import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { verifyItems } from "../state/checklist.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";

export type Target = "nextjs-pwa" | "expo" | "tauri" | "docker";

/** Infer scaffold targets from the platform/deployment interview answers. */
export function inferTargets(answers: store.Answer[]): Target[] {
  const text = answers
    .filter((a) => a.questionId === "platforms.targets" || a.questionId === "deployment.target")
    .map((a) => a.answer.toLowerCase())
    .join(" ");
  const targets = new Set<Target>();
  if (/(native|app store|play store|android|ios|expo)/.test(text)) targets.add("expo");
  if (/(desktop app|tauri|electron|windows app|mac app)/.test(text)) targets.add("tauri");
  if (/(self-host|self host|docker|own server|local(ly)? on my|purely local)/.test(text)) targets.add("docker");
  // Web/PWA is the universal base unless the user asked exclusively for native/desktop.
  if (targets.size === 0 || /(web|pwa|browser|responsive|site)/.test(text)) targets.add("nextjs-pwa");
  return [...targets];
}

export function readTemplate(target: Target): string {
  const file = join(store.repoRoot, "templates", `${target}.md`);
  if (!existsSync(file)) return `(No template file for "${target}" yet - follow ecosystem best practices.)`;
  return readFileSync(file, "utf8");
}

interface PackageDef {
  packageId: string;
  title: string;
  parallelGroup: number; // packages in the same group can run as parallel subagents
  instructions: string[];
  doneCriteria: string[];
}

export function buildPackages(project: store.Project, targets: Target[]): PackageDef[] {
  const answers = store.getAnswers(project.id);
  const answerText = answers.map((a) => `${a.questionId} ${a.answer}`).join(" ").toLowerCase();
  const has = (re: RegExp) => re.test(answerText);
  const wantsAuth = has(/auth\.needed(?!.*\b(no|none|skip)\b)/) && !has(/auth\.needed[^.]*\b(no accounts|no login|none needed)\b/);
  const wantsPayments = has(/payments\.model/) && !has(/payments\.model[^.]*\bno\b/);

  const pkgs: PackageDef[] = [];

  pkgs.push({
    packageId: "foundation",
    title: "Foundation: scaffold, design tokens, PWA shell",
    parallelGroup: 0,
    instructions: [
      `Scaffold the app following the template(s): ${targets.join(", ")}.`,
      "Wire the design tokens (colors, radius, shadows), fonts and icon library from the design choices.",
      "Honor optional design choices when present: cardStyle (surface treatment guidance), background " +
        "(page background treatment), colors (custom primary overrides the style accent; build a gradient " +
        "from primary->second if gradient=true), and layout (the user's own arrangement of the main screen " +
        "on a 12x8 grid - items have {type,x,y,w,h}; translate it into the real responsive layout).",
      "Set up the PWA manifest, icons, service worker, health endpoint, error pages and security headers.",
      "Create the data model (schema + migrations) from the interview's data entities answer.",
      "Commit the scaffold before other packages start.",
    ],
    doneCriteria: ["`npm run dev` starts clean", "type check passes", "design tokens visibly applied"],
  });

  pkgs.push({
    packageId: "frontend",
    title: "Frontend: pages, components and user flows",
    parallelGroup: 1,
    instructions: [
      "Build every screen for the must-have features from the interview, using the chosen design system.",
      "Follow the chosen animation level guidance; honor prefers-reduced-motion.",
      "Responsive at 360px, 768px and 1280px widths. Keyboard accessible, labeled forms, alt text.",
      "Do not touch API/database files owned by the backend package - call its endpoints/actions.",
    ],
    doneCriteria: ["all must-have flows clickable end to end", "no console errors", "responsive at all three widths"],
  });

  pkgs.push({
    packageId: "backend",
    title: "Backend: data access, API and business logic",
    parallelGroup: 1,
    instructions: [
      "Implement server actions / API routes for every feature, with zod validation on every input.",
      "Parameterized queries only. Pagination on all list endpoints.",
      wantsAuth
        ? "Implement authentication as answered in the interview (hashed passwords or provider flow, httpOnly sessions, rate-limited login, role checks on the server)."
        : "No user accounts were requested - keep the app anonymous but structure data access so auth can be added later.",
      wantsPayments
        ? "Implement payments as answered in the interview (server-computed amounts, signature-verified webhooks, secrets in env vars). Use the Stripe MCP/skill if installed."
        : "",
      "Do not touch page/component files owned by the frontend package.",
    ].filter(Boolean),
    doneCriteria: ["every endpoint validated + tested", "auth flows work (if requested)", "no secrets in code"],
  });

  pkgs.push({
    packageId: "tests",
    title: "Tests: unit + end-to-end",
    parallelGroup: 1,
    instructions: [
      "Vitest unit tests for business logic (aim at src/lib).",
      "One Playwright end-to-end test covering the single most important user flow from the interview.",
      "A test for auth-protected routes rejecting anonymous users (if auth was requested).",
    ],
    doneCriteria: ["`npm test` green", "e2e test green against a dev server"],
  });

  pkgs.push({
    packageId: "polish",
    title: "Polish: a11y, performance, SEO, legal",
    parallelGroup: 2,
    instructions: [
      "Run through the checklist verify items and fix gaps (contrast, labels, lazy images, pagination).",
      "Add SEO metadata/sitemap for public pages (if any), analytics and error tracking (if requested).",
      "Add privacy/terms pages if personal data is stored.",
      "Write the README: purpose, setup, env vars, deploy instructions.",
    ],
    doneCriteria: ["checklist verify items addressed or consciously waived with a note"],
  });

  return pkgs;
}

export function registerBlueprintTools(server: McpServer): void {
  server.registerTool(
    "generate_blueprint",
    {
      title: "Generate the build blueprint",
      description:
        "Phase 4 of the App Factory workflow. Compiles the description, interview answers and design " +
        "choices into a build blueprint with parallelizable work packages. Launch one parallel subagent " +
        "per work package within the same parallelGroup (group 0 first, then 1, then 2), passing each " +
        "subagent the full spec from get_work_package. Advances the project to the build phase.",
      inputSchema: {
        projectId: z.string(),
        workspacePath: z
          .string()
          .optional()
          .describe("Absolute path where the app will be built (stored on the project)"),
      },
    },
    async ({ projectId, workspacePath }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["blueprint"]);
      if (phaseError) return err(phaseError);
      if (workspacePath) store.setWorkspacePath(projectId, workspacePath);

      const answers = store.getAnswers(projectId);
      const choices = store.getDesignChoices(projectId);
      const targets = inferTargets(answers);
      const packages = buildPackages(project, targets);
      for (const p of packages) {
        store.saveWorkPackage(projectId, p.packageId, p.title, {
          parallelGroup: p.parallelGroup,
          instructions: p.instructions,
          doneCriteria: p.doneCriteria,
        });
      }
      store.setPhase(projectId, "build");
      const updated = store.getProject(projectId)!;

      return json({
        blueprint: {
          project: { id: project.id, name: project.name, description: project.description },
          targets,
          designChoices: Object.fromEntries(choices.map((c) => [c.category, c.choice])),
          interviewAnswers: answers,
          agentDecisions:
            "Any answer recorded as 'skip' / 'use your judgment' is yours to decide - decide once, " +
            "note the decision in the README, and stay consistent.",
          workPackages: packages.map((p) => ({
            packageId: p.packageId,
            title: p.title,
            parallelGroup: p.parallelGroup,
          })),
          parallelization:
            "Run group 0 (foundation) first and alone. Then run all group 1 packages as PARALLEL " +
            "subagents - they have disjoint file ownership. Then group 2. Call get_work_package for " +
            "each package's full spec and report_package_done when a subagent finishes.",
          otherTools:
            "Prefer installed MCPs/skills over hand-rolling: Supabase (database/auth), Stripe (payments), " +
            "Vercel (deploy), Sentry (error tracking), browser tools (visual verification).",
        },
        nextStep: nextStep(updated),
      });
    },
  );

  server.registerTool(
    "get_work_package",
    {
      title: "Get a work package spec",
      description:
        "Returns the full spec for one work package: instructions, done criteria, relevant interview " +
        "answers, design choices, and the scaffold template (for the foundation package). Give this " +
        "spec verbatim to the subagent responsible for the package.",
      inputSchema: {
        projectId: z.string(),
        packageId: z.string(),
      },
    },
    async ({ projectId, packageId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["build", "audit"]);
      if (phaseError) return err(phaseError);

      const pkg = store.getWorkPackages(projectId).find((p) => p.packageId === packageId);
      if (!pkg) {
        return err(
          `No package "${packageId}". Available: ${store
            .getWorkPackages(projectId)
            .map((p) => p.packageId)
            .join(", ")}`,
        );
      }
      store.updateWorkPackage(projectId, packageId, "in_progress");

      const answers = store.getAnswers(projectId);
      const targets = inferTargets(answers);
      const spec: Record<string, unknown> = {
        project: { name: project.name, description: project.description, workspacePath: project.workspacePath },
        package: pkg,
        designChoices: Object.fromEntries(store.getDesignChoices(projectId).map((c) => [c.category, c.choice])),
        interviewAnswers: answers,
      };
      if (packageId === "foundation") {
        spec.templates = Object.fromEntries(targets.map((t) => [t, readTemplate(t)]));
      }
      return json(spec);
    },
  );

  server.registerTool(
    "report_package_done",
    {
      title: "Report a work package as done",
      description:
        "Mark a work package complete with a short summary of what was built. When every package is " +
        "done the project advances to the audit phase.",
      inputSchema: {
        projectId: z.string(),
        packageId: z.string(),
        summary: z.string().describe("2-4 sentences: what was built, key decisions, anything left"),
      },
    },
    async ({ projectId, packageId, summary }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["build"]);
      if (phaseError) return err(phaseError);

      const pkg = store.getWorkPackages(projectId).find((p) => p.packageId === packageId);
      if (!pkg) return err(`No package "${packageId}".`);
      store.updateWorkPackage(projectId, packageId, "done", summary);

      const all = store.getWorkPackages(projectId);
      const remaining = all.filter((p) => p.status !== "done");
      if (remaining.length === 0) {
        store.setPhase(projectId, "audit");
        const updated = store.getProject(projectId)!;
        return json({
          allPackagesDone: true,
          checklistToVerify: verifyItems(),
          nextStep: nextStep(updated),
        });
      }
      return json({
        allPackagesDone: false,
        remaining: remaining.map((p) => ({ packageId: p.packageId, status: p.status })),
      });
    },
  );
}
