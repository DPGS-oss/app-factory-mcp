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
        "(score >= minScore, default 80, with zero critical findings) - only then does the project " +
        "advance to deploy. " +
        "Also self-verify the manualChecklist items the tools cannot measure. " +
        "This tool can also audit any codebase standalone: pass appPath without projectId.",
      inputSchema: {
        appPath: z.string().describe("Absolute path to the app's root folder"),
        projectId: z.string().optional().describe("App Factory project id (omit for standalone audits)"),
        url: z
          .string()
          .optional()
          .describe("URL of the running app (e.g. http://localhost:3000) to include a Lighthouse audit"),
        minScore: z
          .number()
          .min(0)
          .max(100)
          .default(80)
          .describe("Quality gate: minimum score to pass. Raise it for stricter projects (ask the USER)."),
      },
    },
    async ({ appPath, projectId, url, minScore }) => {
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);

      let project: store.Project | null = null;
      if (projectId) {
        project = store.getProject(projectId);
        if (!project) return err(`No project with id "${projectId}".`);
        const phaseError = store.requirePhase(project, ["audit", "deploy", "done"]);
        if (phaseError) return err(phaseError);
      }

      const report = await runAudit(appPath, url);
      // Apply the configurable quality gate (runAudit's built-in threshold is 80).
      report.passed = report.score >= minScore && report.criticalFindings.length === 0;

      if (project) {
        const priorFailedCount = store
          .getAudits(project.id)
          .filter((a) => a.score < minScore || ((a.report.criticalFindings as unknown[]) ?? []).length > 0)
          .length;
        store.saveAudit(project.id, report.score, report as unknown as Record<string, unknown>);
        if (report.passed && project.phase === "audit") {
          const projectKey = project.id;
          store.setPhase(projectKey, "deploy");
          project = store.getProject(projectKey);
          if (priorFailedCount > 0) {
            store.logEvent(
              projectKey,
              "problem",
              "refine-candidate",
              `Audit recovered to score ${report.score} after ${priorFailedCount} prior failure(s). Call refine to distill root-cause lessons (not band-aids).`,
            );
          }
        } else if (!report.passed) {
          store.logEvent(
            project.id,
            "problem",
            "audit-failed",
            `Audit score ${report.score}, critical=${report.criticalFindings.length}. Fix ROOT CAUSES in fixList (not symptoms), re-run audit, then refine.`,
          );
        }
      }

      return json({
        ...report,
        manualChecklist: verifyItems(),
        verdict: report.passed
          ? "AUDIT PASSED. Also walk the manualChecklist above and confirm each item before deploying." +
            (project
              ? " If this pass followed earlier failures, call refine to capture lasting lessons."
              : "")
          : `AUDIT NOT PASSED (score ${report.score}, ${report.criticalFindings.length} critical). ` +
            "Fix ROOT CAUSES for every item in fixList (do not paper over with disables/ignores), " +
            "then run run_audit again. Do not proceed to deploy. After the gate passes, call refine.",
        learningNudge: report.passed
          ? "If audits failed earlier in this project, call refine before deploy."
          : "Journaled as audit-failed. After fixes pass, distill lessons with refine.",
        ...(project ? { nextStep: nextStep(project) } : {}),
      });
    },
  );
}
