import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { loadChecklist, relevantCategories } from "../state/checklist.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";

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
        "'everything an app needs' checklist, returns a structured master prompt skeleton plus a gap " +
        "list of topics the description does not cover, and advances the project to the interview phase.",
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
      const covered = checklist.filter((c) => c.keywords.length > 0 && mentioned.has(c.id)).map((c) => c.title);

      const masterPrompt = [
        `# Master Build Prompt: ${project.name}`,
        ``,
        `## Raw description (verbatim, from the user)`,
        project.description,
        ``,
        `## Your task as the orchestrating agent`,
        `Rewrite the raw description into a precise product brief with these sections, `,
        `using ONLY facts from the description and the upcoming interview answers - never invent requirements:`,
        `1. Goal - one sentence, the job the app does.`,
        `2. Primary users - who they are, their context.`,
        `3. Core user flows - step by step for each main flow.`,
        `4. Explicit features - what the description directly asks for.`,
        `5. Implied needs - what the description implies but does not state (mark each as ASSUMPTION).`,
        `6. Non-functional requirements - performance, security, accessibility, offline, scale.`,
        `7. Out of scope for v1 - be explicit to prevent scope creep.`,
        ``,
        `## Detected topics`,
        covered.length ? covered.map((c) => `- ${c}`).join("\n") : `- (none detected beyond basics)`,
        ``,
        `## Gaps - the description says nothing about these`,
        `These will be resolved in the planning interview. Do NOT guess answers.`,
        gaps.map((g) => `- ${g.category}: ${g.whyItMatters}`).join("\n"),
      ].join("\n");

      store.setPhase(project.id, "interview");
      const updated = store.getProject(project.id)!;
      return json({
        masterPrompt,
        gapCount: gaps.length,
        nextStep: nextStep(updated),
      });
    },
  );
}
