import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { loadChecklist, relevantCategories } from "../state/checklist.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";
import { formatRankedLessons, rankLessons } from "../learning/lessons.js";

/**
 * Builds the refined "master prompt" skeleton from the raw description plus a
 * gap analysis against the checklist. The MCP is deterministic: it structures
 * and flags; the agent fills in the intelligence.
 */
export function registerIntakeTools(server: McpServer): void {
  server.registerTool(
    "enhance_prompt",
    {
      title: "Enhance the app description into a master prompt",
      description:
        "Phase 1 of the App Factory workflow. Analyzes the project description against the " +
        "'everything an app needs' checklist and returns a PRODUCTION-GRADE master prompt skeleton " +
        "(goal, users, flows, features, non-goals, acceptance criteria, architecture sketch, threat " +
        "model lite, UX principles, success metrics, observability) plus a gap list. Advances the " +
        "project to the interview phase. Fill sections from user facts + interview answers only — " +
        "never invent requirements.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["intake"]);
      if (phaseError) return err(phaseError);

      const checklist = loadChecklist();
      const mentioned = relevantCategories(project.description);
      const gaps = checklist
        .filter((c) => !mentioned.has(c.id) && c.questions.length > 0)
        .map((c) => ({ category: c.title, whyItMatters: c.questions[0]?.why ?? "" }));
      const covered = checklist
        .filter((c) => c.keywords.length > 0 && mentioned.has(c.id))
        .map((c) => c.title);

      const ranked = rankLessons(store.getLessons(), project.description, 8);
      const lessonBlock = ranked.length
        ? [
            ``,
            `## Lessons from prior App Factory projects (binding unless contradicted by the user)`,
            ...formatRankedLessons(ranked).map((l) => `- ${l}`),
          ]
        : [];

      const masterPrompt = [
        `# Master Build Prompt: ${project.name}`,
        ``,
        `## Raw description (verbatim, from the user)`,
        project.description,
        ``,
        `## Your task as the orchestrating agent`,
        `Rewrite the raw description into a precise product brief using ONLY facts from the`,
        `description and the upcoming interview answers — never invent requirements. Mark every`,
        `inference as ASSUMPTION. Produce ALL of the following sections:`,
        ``,
        `### 1. Goal`,
        `One sentence: the job the app does for the primary user.`,
        ``,
        `### 2. Primary users & context`,
        `Who they are, when/where they use it, what "done" feels like for them.`,
        ``,
        `### 3. Core user flows`,
        `Step-by-step for each must-have flow (happy path + one failure path each).`,
        ``,
        `### 4. Explicit features (v1)`,
        `Only what the description or interview directly asks for.`,
        ``,
        `### 5. Implied needs (ASSUMPTIONS)`,
        `What the description implies but does not state — each line tagged ASSUMPTION.`,
        ``,
        `### 6. Non-goals / out of scope for v1`,
        `Explicit exclusions to prevent scope creep.`,
        ``,
        `### 7. Acceptance criteria`,
        `Verifiable checks for v1 (Given/When/Then or bullet pass/fail). Tie to purpose.success.`,
        ``,
        `### 8. Architecture sketch`,
        `Targets (web/PWA/native/desktop), data stores, auth boundary, key modules, and shared`,
        `contracts the foundation package must define before frontend/backend diverge.`,
        ``,
        `### 9. Threat model lite`,
        `Assets to protect, likely attackers/mistakes, top 5 controls (authn/z, validation, secrets,`,
        `rate limits, headers). Calibrate to security.sensitivity interview answer.`,
        ``,
        `### 10. UX principles`,
        `Include empty / loading / error / success states; accessibility baseline; motion budget`,
        `from design choices; content tone. Never ship a blank dead-end screen.`,
        ``,
        `### 11. Non-functional requirements`,
        `Performance budget hints, offline expectations, scale, observability (errors, health, logs).`,
        ``,
        `### 12. Success metrics`,
        `How we know the app succeeded post-launch (usage, task completion, uptime) — from purpose.success.`,
        ``,
        `### 13. Open questions`,
        `Only items still unresolved after the interview; do not invent answers here.`,
        ``,
        `## Detected topics already hinted in the description`,
        covered.length ? covered.map((c) => `- ${c}`).join("\n") : `- (none detected beyond basics)`,
        ``,
        `## Gaps — the description says nothing about these`,
        `Resolve in the planning interview. Do NOT guess answers.`,
        gaps.map((g) => `- ${g.category}: ${g.whyItMatters}`).join("\n"),
        ...lessonBlock,
      ].join("\n");

      store.setPhase(project.id, "interview");
      const updated = store.getProject(project.id)!;
      return json({
        masterPrompt,
        gapCount: gaps.length,
        gaps,
        priorLessons: formatRankedLessons(ranked),
        agentInstructions:
          "Present a short summary of gaps to the USER, then proceed with get_next_questions. " +
          "Keep the full masterPrompt as the north-star document; update it mentally as answers arrive. " +
          "Honor priorLessons unless the user overrides.",
        nextStep: nextStep(updated),
      });
    },
  );
}
