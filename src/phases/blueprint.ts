import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { verifyItems } from "../state/checklist.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";
import { formatRankedLessons, rankLessons } from "../learning/lessons.js";

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
  parallelGroup: number;
  ownsPaths: string[];
  mustNotTouch: string[];
  instructions: string[];
  doneCriteria: string[];
}

/** Turn gallery design choices into precise implementation instructions for builders. */
export function designImplementationSpec(choices: store.DesignChoice[]): Record<string, unknown> {
  const byCat = Object.fromEntries(choices.map((c) => [c.category, c.choice]));
  const ui = (byCat.uiStyle ?? {}) as Record<string, unknown>;
  const vars = (ui.vars ?? {}) as Record<string, unknown>;
  const fonts = (byCat.fontPairing ?? {}) as Record<string, unknown>;
  const icons = (byCat.iconSet ?? {}) as Record<string, unknown>;
  const animation = (byCat.animation ?? {}) as Record<string, unknown>;
  const card = (byCat.cardStyle ?? {}) as Record<string, unknown>;
  const background = (byCat.background ?? {}) as Record<string, unknown>;
  const colors = (byCat.colors ?? {}) as Record<string, unknown>;
  const layout = (byCat.layout ?? {}) as Record<string, unknown>;

  const motionBudget =
    animation.id === "none"
      ? "No decorative motion. Instant state changes only. Still honor focus/hover affordances."
      : animation.id === "subtle"
        ? "Motion budget: <=150ms ease-out on hover/focus; no page-load choreography; respect prefers-reduced-motion (disable all non-essential)."
        : animation.id === "smooth"
          ? "Motion budget: 150-300ms shared easings; page transitions ok if reduced-motion falls back to instant; max 2 concurrent animations."
          : "Motion budget: playful springs ok on success moments only; never block input; always provide prefers-reduced-motion cut.";

  return {
    tokens: {
      cssVariables: {
        "--background": vars.bg ?? "(from uiStyle)",
        "--surface": vars.surface ?? "(from uiStyle)",
        "--foreground": vars.text ?? "(from uiStyle)",
        "--muted": vars.muted ?? "(from uiStyle)",
        "--accent": colors.primary ?? vars.accent ?? "(from uiStyle)",
        "--border": vars.border ?? "(from uiStyle)",
        "--radius": vars.radius ?? "(from uiStyle)",
      },
      customColors: colors,
      fonts: {
        heading: fonts.heading ?? fonts.headingFont,
        body: fonts.body ?? fonts.bodyFont,
        loadVia: "next/font/google or platform equivalent — never block render on CDN failure",
      },
      iconPackage: icons.package ?? icons.id ?? "lucide-react",
      cardStyle: card.id ?? card.name ?? "default",
      background: background.id ?? background.name ?? "solid",
      uiGuidance: ui.guidance ?? "",
      animationGuidance: animation.guidance ?? "",
    },
    componentRules: [
      "One visual system: all surfaces use token vars — no one-off hex in components.",
      "Interactive elements: visible focus ring (accent-based), min 44px touch targets on mobile.",
      "Forms: label every control; associate errors with aria-describedby; never color-only errors.",
      "Cards/surfaces follow chosen cardStyle; page chrome follows background treatment.",
      layout.grid
        ? `Main screen layout: honor the user's 12x8 grid arrangement ${JSON.stringify(layout)} — translate to responsive CSS (stack below 768px).`
        : "Layout: clear hierarchy — primary action obvious within one viewport on mobile.",
    ],
    a11y: [
      "Keyboard: full main flow with Tab/Enter/Escape only.",
      "WCAG AA contrast for text/icons on backgrounds.",
      "Images: meaningful alt; decorative images alt=\"\".",
      "Live regions for async errors/toasts.",
    ],
    motionBudget,
    emptyLoadingError: [
      "Every list/detail view needs empty, loading (skeleton), and error states with a recovery action.",
      "Never ship a blank white dead-end.",
    ],
  };
}

export function buildPackages(project: store.Project, targets: Target[]): PackageDef[] {
  const answers = store.getAnswers(project.id);
  const answerText = answers.map((a) => `${a.questionId} ${a.answer}`).join(" ").toLowerCase();
  const has = (re: RegExp) => re.test(answerText);
  const wantsAuth =
    has(/auth\.needed(?!.*\b(no|none|skip)\b)/) &&
    !has(/auth\.needed[^.]*\b(no accounts|no login|none needed)\b/);
  const wantsPayments = has(/payments\.model/) && !has(/payments\.model[^.]*\bno\b/);

  const pkgs: PackageDef[] = [];

  pkgs.push({
    packageId: "foundation",
    title: "Foundation: scaffold, contracts, design tokens, PWA shell",
    parallelGroup: 0,
    ownsPaths: [
      "package.json",
      "tsconfig.json",
      "next.config.*",
      "src/app/layout.tsx",
      "src/app/globals.css",
      "src/app/manifest.ts",
      "src/app/api/health/**",
      "src/lib/contracts/**",
      "src/lib/env.ts",
      "prisma/** OR supabase/migrations/**",
      ".env.example",
      ".github/workflows/**",
    ],
    mustNotTouch: ["src/app/(admin|dashboard|app)/** pages that frontend owns after contracts land"],
    instructions: [
      `Scaffold following template(s): ${targets.join(", ")}.`,
      "CONTRACTS FIRST (parallel-safety): create `src/lib/contracts/` with zod schemas + shared TypeScript types for every API/entity the interview defined. Frontend and backend MUST import these — no divergent shapes.",
      "Add `src/lib/env.ts` validating required env vars with zod at startup; document every key in `.env.example` (no real secrets).",
      "Wire design tokens from designImplementation (CSS vars, fonts, icons). Apply cardStyle/background/colors/layout when present.",
      "PWA: manifest, icons, service worker, health endpoint, error.tsx, not-found.tsx, security headers.",
      "Data model: schema + migration workflow from data.entities (never rely on push-to-prod without migrations).",
      "CI-ready scripts in package.json: `lint`, `typecheck`, `test`, `build`. Prefer a minimal GitHub Actions workflow that runs them.",
      "Commit the scaffold before other packages start.",
    ],
    doneCriteria: [
      "`npm run dev` starts clean",
      "`npm run typecheck` (or tsc --noEmit) passes",
      "src/lib/contracts/ exports schemas used by at least one entity",
      "src/lib/env.ts rejects missing required env vars",
      "design tokens visibly applied on a smoke page",
      ".env.example exists and matches env.ts keys",
    ],
  });

  pkgs.push({
    packageId: "frontend",
    title: "Frontend: pages, components and user flows",
    parallelGroup: 1,
    ownsPaths: ["src/app/**/page.tsx", "src/components/**", "src/app/**/loading.tsx", "public/**"],
    mustNotTouch: ["src/app/api/**", "src/lib/db/**", "prisma/**", "src/lib/env.ts", "src/lib/contracts/** (read-only import)"],
    instructions: [
      "Build every must-have screen from the interview using the designImplementation rules (tokens, a11y, motion budget).",
      "Import API/entity types ONLY from src/lib/contracts — if a type is missing, stop and extend contracts (do not invent local duplicates).",
      "Every data view: empty + loading (skeleton) + error states with recovery. Optimistic UI only where safe.",
      "Responsive at 360 / 768 / 1280. Keyboard accessible. Form labels + alt text.",
      "Call backend via server actions / fetch to contracts-defined endpoints — do not embed SQL or secrets.",
    ],
    doneCriteria: [
      "All must-have flows clickable end-to-end against real or mocked contract endpoints",
      "Empty/loading/error states present on primary lists",
      "No console errors; responsive at three widths",
      "No edits under mustNotTouch paths",
    ],
  });

  pkgs.push({
    packageId: "backend",
    title: "Backend: data access, API and business logic",
    parallelGroup: 1,
    ownsPaths: ["src/app/api/**", "src/lib/db/**", "src/lib/server/**", "src/lib/auth/**"],
    mustNotTouch: ["src/components/**", "src/app/**/page.tsx", "src/app/globals.css"],
    instructions: [
      "Implement server actions / API routes for every feature; validate EVERY input with zod schemas from src/lib/contracts (or extend contracts first).",
      "Parameterized queries only. Pagination on all list endpoints. Timeouts on external calls.",
      "Rate-limit auth and expensive mutations (even a simple in-memory/IP limit in v1).",
      wantsAuth
        ? "Auth as interviewed: hashed passwords or provider flow, httpOnly sessions, rate-limited login, server-side role checks."
        : "No accounts requested — keep anonymous but structure data access so auth can be added without rewrite.",
      wantsPayments
        ? "Payments as interviewed: server-computed amounts, signature-verified webhooks, secrets only in env. Prefer Stripe MCP/skill."
        : "",
      "Never return stack traces to clients; log safely without PII/secrets.",
    ].filter(Boolean),
    doneCriteria: [
      "Every endpoint validates with contract schemas",
      "Auth flows work if requested; unauthorized rejected server-side",
      "No secrets in code; rate limit present on auth/expensive routes",
      "No edits under mustNotTouch paths",
    ],
  });

  pkgs.push({
    packageId: "tests",
    title: "Tests: unit + end-to-end",
    parallelGroup: 1,
    ownsPaths: ["**/*.test.ts", "**/*.spec.ts", "e2e/**", "playwright.config.*", "vitest.config.*"],
    mustNotTouch: ["src/app/globals.css (style-only churn)"],
    instructions: [
      "Vitest unit tests for business logic in src/lib (especially contract parsers and authz helpers).",
      "One Playwright e2e covering the single most important user flow from the interview (the money path).",
      wantsAuth ? "Test that protected routes reject anonymous users." : "",
      "Wire `npm test` and document how to run e2e. Tests must be CI-ready (no interactive prompts).",
    ].filter(Boolean),
    doneCriteria: [
      "`npm test` green",
      "e2e green against a local/dev server OR documented skip with reason if environment blocks browsers",
      "At least one contract/schema unit test",
    ],
  });

  pkgs.push({
    packageId: "polish",
    title: "Polish: a11y, performance, SEO, legal, observability",
    parallelGroup: 2,
    ownsPaths: ["src/app/**/layout.tsx metadata", "README.md", "src/app/privacy/**", "src/app/terms/**"],
    mustNotTouch: ["src/lib/contracts/** (unless fixing a discovered gap)"],
    instructions: [
      "Walk checklist verify items; fix gaps (contrast, labels, lazy images, pagination).",
      "Performance budget: Lighthouse perf >= 80 on key pages when URL available; images via optimized component; no unbounded lists.",
      "SEO metadata/sitemap for public pages; analytics + error tracking if requested (Sentry MCP if installed).",
      "Privacy/terms if personal data stored — prefer generate_legal_docs.",
      "README: purpose, setup, env vars, scripts, deploy, test commands.",
    ],
    doneCriteria: [
      "Checklist verify items addressed or consciously waived with a README note",
      "README complete; legal pages linked if required",
    ],
  });

  return pkgs;
}

export function registerBlueprintTools(server: McpServer): void {
  server.registerTool(
    "generate_blueprint",
    {
      title: "Generate the build blueprint",
      description:
        "Phase 4 of the App Factory workflow. Compiles description, interview answers and design " +
        "choices into a build blueprint: designImplementation (tokens, component rules, a11y, motion " +
        "budget) plus parallelizable work packages with file ownership and contracts-first rules. " +
        "Launch one parallel subagent per package within the same parallelGroup (0 then 1 then 2).",
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
      const designImplementation = designImplementationSpec(choices);
      const packages = buildPackages(project, targets);
      for (const p of packages) {
        store.saveWorkPackage(projectId, p.packageId, p.title, {
          parallelGroup: p.parallelGroup,
          ownsPaths: p.ownsPaths,
          mustNotTouch: p.mustNotTouch,
          instructions: p.instructions,
          doneCriteria: p.doneCriteria,
          designImplementation,
        });
      }
      store.setPhase(projectId, "build");
      const updated = store.getProject(projectId)!;

      return json({
        blueprint: {
          project: { id: project.id, name: project.name, description: project.description },
          targets,
          designChoices: Object.fromEntries(choices.map((c) => [c.category, c.choice])),
          designImplementation,
          interviewAnswers: answers,
          agentDecisions:
            "Any answer recorded as 'skip' / 'use your judgment' is yours to decide - decide once, " +
            "log_event as decision, note in README, and stay consistent.",
          workPackages: packages.map((p) => ({
            packageId: p.packageId,
            title: p.title,
            parallelGroup: p.parallelGroup,
            ownsPaths: p.ownsPaths,
            mustNotTouch: p.mustNotTouch,
          })),
          parallelization:
            "Run group 0 (foundation) FIRST and ALONE — it owns shared contracts/types/env. " +
            "Then run all group 1 packages as PARALLEL subagents with disjoint ownsPaths. " +
            "Then group 2. Call get_work_package for each full spec; report_package_done when finished. " +
            "If two packages need the same type, extend contracts in foundation (or a quick serial fix) — never fork types.",
          otherTools:
            "Prefer installed MCPs/skills: Supabase, Stripe, Vercel, Sentry, browser tools.",
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
        "Returns the full spec for one work package: ownsPaths, mustNotTouch, instructions, " +
        "verifiable doneCriteria, designImplementation, ranked lessonsLearned, interview answers, " +
        "and scaffold templates (foundation). Give this spec verbatim to the subagent.",
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
      const choices = store.getDesignChoices(projectId);
      const contextText = `${packageId} ${pkg.title} ${project.description} ${JSON.stringify(pkg.spec)}`;
      const ranked = rankLessons(store.getLessons(projectId), contextText, 10);
      const designImplementation =
        (pkg.spec.designImplementation as Record<string, unknown> | undefined) ??
        designImplementationSpec(choices);

      const spec: Record<string, unknown> = {
        project: {
          name: project.name,
          description: project.description,
          workspacePath: project.workspacePath,
        },
        package: pkg,
        ownership: {
          ownsPaths: pkg.spec.ownsPaths ?? [],
          mustNotTouch: pkg.spec.mustNotTouch ?? [],
          rule: "Stay inside ownsPaths. Treat mustNotTouch as hard boundaries for parallel safety.",
        },
        designImplementation,
        interviewAnswers: answers,
        doneCriteria: pkg.spec.doneCriteria ?? [],
        lessonsLearned: formatRankedLessons(ranked),
        lessonsRanked: ranked,
        bindingRule: "Obey lessonsLearned unless the user explicitly overrides.",
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
        "Mark a work package complete with a short summary of what was built. Confirm doneCriteria " +
        "were verified. When every package is done the project advances to the audit phase.",
      inputSchema: {
        projectId: z.string(),
        packageId: z.string(),
        summary: z
          .string()
          .describe("2-4 sentences: what was built, key decisions, doneCriteria evidence, anything left"),
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
      store.logEvent(projectId, "milestone", `package-done:${packageId}`, summary.slice(0, 500));

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
