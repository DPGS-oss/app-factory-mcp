import { z } from "zod";
import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { verifyItems } from "../state/checklist.js";
import { runAudit } from "../audit/runner.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";

export function registerAuditTools(server: McpServer): void {
  server.registerTool(
    "run_audit",
    {
      title: "Run the one-step quality & security audit",
      description:
        "Phase 5 of the App Factory workflow. Runs the full audit pipeline against the app: " +
        "typecheck, lint, tests, dependency vulnerability scan, secret scan, semgrep static security " +
        "analysis (if installed) and Lighthouse (if a running app url is provided). Returns a scored " +
        "report with a concrete fix list. Fix EVERYTHING in fixList and re-run until passed=true " +
        "(score >= 80 with zero critical findings) - only then does the project advance to deploy. " +
        "Also self-verify the manualChecklist items the tools cannot measure. " +
        "This tool can also audit any codebase standalone: pass appPath without projectId.",
      inputSchema: {
        appPath: z.string().describe("Absolute path to the app's root folder"),
        projectId: z.string().optional().describe("App Factory project id (omit for standalone audits)"),
        url: z
          .string()
          .optional()
          .describe("URL of the running app (e.g. http://localhost:3000) to include a Lighthouse audit"),
      },
    },
    async ({ appPath, projectId, url }) => {
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);

      let project: store.Project | null = null;
      if (projectId) {
        project = store.getProject(projectId);
        if (!project) return err(`No project with id "${projectId}".`);
        const phaseError = store.requirePhase(project, ["audit", "deploy", "done"]);
        if (phaseError) return err(phaseError);
      }

      const report = await runAudit(appPath, url);

      if (project) {
        store.saveAudit(project.id, report.score, report as unknown as Record<string, unknown>);
        if (report.passed && project.phase === "audit") {
          store.setPhase(project.id, "deploy");
          project = store.getProject(project.id);
        }
      }

      return json({
        ...report,
        manualChecklist: verifyItems(),
        verdict: report.passed
          ? "AUDIT PASSED. Also walk the manualChecklist above and confirm each item before deploying."
          : `AUDIT NOT PASSED (score ${report.score}, ${report.criticalFindings.length} critical). ` +
            "Fix every item in fixList, then run run_audit again. Do not proceed to deploy.",
        ...(project ? { nextStep: nextStep(project) } : {}),
      });
    },
  );
}
