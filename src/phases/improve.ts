import { z } from "zod";
import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { verifyItems } from "../state/checklist.js";
import { analyzeApp } from "./existing.js";
import { json, err } from "../util.js";

interface Idea {
  theme: string;
  idea: string;
  effort: "small" | "medium" | "large";
}

/** Curated, broadly-applicable improvement library; the agent tailors and extends it. */
const IDEA_LIBRARY: Idea[] = [
  // UX & delight
  { theme: "ux", idea: "Add empty states that teach: when a list has no items, show what it's for and a one-click way to create the first one.", effort: "small" },
  { theme: "ux", idea: "Add undo for destructive actions (toast with 'Undo') instead of confirmation dialogs.", effort: "medium" },
  { theme: "ux", idea: "Add keyboard shortcuts for the 2-3 most frequent actions, with a '?' overlay listing them.", effort: "medium" },
  { theme: "ux", idea: "Add optimistic UI updates so actions feel instant even on slow connections.", effort: "medium" },
  { theme: "ux", idea: "Onboarding: a 3-step first-run checklist that walks new users to their first success moment.", effort: "medium" },
  { theme: "delight", idea: "Micro-interactions on success moments (subtle confetti/checkmark animation when completing a key task).", effort: "small" },
  { theme: "delight", idea: "Personal touches: greet returning users by name with a context-aware line (e.g. 'Picking up where you left off?').", effort: "small" },
  // Retention & growth
  { theme: "growth", idea: "Shareable artifacts: let users share a public read-only link of something they made - every share is free marketing.", effort: "medium" },
  { theme: "growth", idea: "SEO content pages generated from public data (categories, templates, examples) to capture search traffic.", effort: "large" },
  { theme: "retention", idea: "Weekly email digest of the user's activity/progress with one clear call-to-action back into the app.", effort: "medium" },
  { theme: "retention", idea: "Streaks or progress tracking for recurring tasks - visible momentum keeps users coming back.", effort: "medium" },
  // Monetization
  { theme: "monetization", idea: "A clear free tier limit + one paid tier. Gate capacity (projects/items), not core features.", effort: "large" },
  { theme: "monetization", idea: "Team/collaboration features as the paid upgrade - individuals use free, companies pay.", effort: "large" },
  // Performance & quality
  { theme: "performance", idea: "Add skeleton loaders for anything that takes >300ms and measure Core Web Vitals in production.", effort: "small" },
  { theme: "performance", idea: "Cache expensive queries and paginate every list; test with 10x the expected data volume.", effort: "medium" },
  { theme: "quality", idea: "Add error tracking (e.g. Sentry) and a /api/health endpoint monitored by an uptime checker.", effort: "small" },
  { theme: "quality", idea: "One end-to-end test for the money path (the flow that makes the app worth using) run in CI.", effort: "medium" },
  // Accessibility & trust
  { theme: "accessibility", idea: "Full keyboard pass: complete the main flow using only Tab/Enter/Escape and fix everything that blocks it.", effort: "small" },
  { theme: "accessibility", idea: "Add a visible focus style and respect prefers-reduced-motion in all animations.", effort: "small" },
  { theme: "trust", idea: "Add a simple changelog/what's-new page - visible momentum builds user trust.", effort: "small" },
  { theme: "trust", idea: "Data export (CSV/JSON) - users trust apps more when they can leave with their data.", effort: "medium" },
  // Idea-level (product strategy)
  { theme: "idea", idea: "Narrow the audience: the same app aimed at one specific niche (e.g. 'for wedding photographers') beats a generic tool - sharper copy, features and pricing.", effort: "medium" },
  { theme: "idea", idea: "Find the 'aha moment' and cut everything that delays it. If users must configure before experiencing value, add smart defaults or demo data.", effort: "medium" },
  { theme: "idea", idea: "Add one 'only-here' feature competitors lack rather than five parity features - be the best at something specific.", effort: "large" },
  { theme: "idea", idea: "Turn the app's data into insight: dashboards, trends or reports users would screenshot and share.", effort: "large" },
];

export function registerImproveTools(server: McpServer): void {
  server.registerTool(
    "suggest_improvements",
    {
      title: "Suggest improvements for the app and its idea",
      description:
        "Generates improvement suggestions on two levels: the APP (missing capabilities, quality gaps, " +
        "UX, performance, retention) and the IDEA (positioning, differentiation, monetization). " +
        "Works with a projectId (uses stored context), an appPath (analyzes the codebase), or both. " +
        "Present the relevant suggestions to the USER as a menu - never implement them unasked. " +
        "Treat the returned ideas as a starting point and ADD your own suggestions specific to this " +
        "app's domain.",
      inputSchema: {
        projectId: z.string().optional(),
        appPath: z.string().optional().describe("Analyze this codebase for capability gaps"),
        focus: z
          .enum(["all", "ux", "growth", "retention", "monetization", "performance", "quality", "accessibility", "trust", "delight", "idea"])
          .default("all"),
      },
    },
    async ({ projectId, appPath, focus }) => {
      if (!projectId && !appPath) return err("Provide a projectId, an appPath, or both.");

      const gaps: string[] = [];
      let projectContext: Record<string, unknown> | null = null;

      if (appPath) {
        if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);
        const analysis = analyzeApp(appPath);
        gaps.push(...analysis.issues);
        for (const [cap, present] of Object.entries(analysis.capabilities)) {
          if (!present && ["pwa", "analytics", "errorTracking", "i18n"].includes(cap)) {
            gaps.push(`Capability not detected: ${cap} - consider whether this app should have it.`);
          }
        }
        projectContext = { frameworks: analysis.frameworks, capabilities: analysis.capabilities };
      }

      if (projectId) {
        const project = store.getProject(projectId);
        if (!project) return err(`No project with id "${projectId}".`);
        const answers = store.getAnswers(projectId);
        const skipped = answers.filter((a) => /skip|your judgment|you decide/i.test(a.answer));
        if (skipped.length) {
          gaps.push(
            `${skipped.length} interview answers were delegated to the agent (${skipped
              .map((s) => s.questionId)
              .join(", ")}) - revisit them with the user now that the app is real.`,
          );
        }
        projectContext = {
          ...(projectContext ?? {}),
          name: project.name,
          description: project.description,
          phase: project.phase,
          openProblems: store
            .getEvents(projectId, 200)
            .filter((e) => e.kind === "problem")
            .map((e) => `${e.name}: ${e.detail}`),
        };
      }

      const ideas = IDEA_LIBRARY.filter((i) => focus === "all" || i.theme === focus);
      return json({
        context: projectContext,
        detectedGaps: gaps,
        qualityChecklist: verifyItems().slice(0, 20),
        suggestions: ideas,
        instructions:
          "Curate: pick the 5-8 suggestions most relevant to THIS app, add 2-3 of your own that are " +
          "specific to its domain and users, then present them to the USER grouped by effort " +
          "(quick wins first). Implement only what they choose, journaling decisions with log_event.",
      });
    },
  );
}
