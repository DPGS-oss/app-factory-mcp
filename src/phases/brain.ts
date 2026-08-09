import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";
import { projectState } from "./core.js";

/**
 * The "brain": every tool call is journaled automatically (see server.ts),
 * the agent records its own observations with log_event, and get_context
 * reconstructs what is happening, what has happened, and what to do next.
 */
export function registerBrainTools(server: McpServer): void {
  server.registerTool(
    "log_event",
    {
      title: "Record an observation in the project journal",
      description:
        "Write to App Factory's journal (its brain). Use it for things worth remembering mid-build: " +
        "decisions ('chose Postgres over SQLite because...'), problems ('build fails on Windows paths'), " +
        "milestones ('frontend package complete'), or notes ('user prefers fewer questions'). " +
        "Tool calls are journaled automatically - log the reasoning and events between them.",
      inputSchema: {
        kind: z.enum(["note", "decision", "problem", "milestone"]),
        name: z.string().describe("Short label, e.g. 'db-choice'"),
        detail: z.string().describe("What happened / what was decided and why"),
        projectId: z.string().optional().describe("Project this relates to, if any"),
      },
    },
    async ({ kind, name, detail, projectId }) => {
      if (projectId && !store.getProject(projectId)) return err(`No project with id "${projectId}".`);
      store.logEvent(projectId ?? null, kind, name, detail);
      return json({ logged: { kind, name } });
    },
  );

  server.registerTool(
    "get_context",
    {
      title: "Get full situational context (the brain's recap)",
      description:
        "Reconstructs context: what is happening, what has happened, and what to do next. " +
        "With a projectId: the project's full state plus its journal timeline (tool calls, decisions, " +
        "problems, milestones) and related memories. Without: a global recap of all projects and recent " +
        "activity. Call this at the START of any session that continues earlier work, after context " +
        "loss, or whenever unsure what already happened.",
      inputSchema: {
        projectId: z.string().optional(),
        eventLimit: z.number().int().min(10).max(500).default(80),
      },
    },
    async ({ projectId, eventLimit }) => {
      if (projectId) {
        const project = store.getProject(projectId);
        if (!project) return err(`No project with id "${projectId}".`);
        const events = store.getEvents(projectId, eventLimit);
        const problems = events.filter((e) => e.kind === "problem");
        const decisions = events.filter((e) => e.kind === "decision");
        return json({
          state: projectState(project),
          journal: {
            timeline: events.map((e) => `[${e.createdAt}] (${e.kind}) ${e.name}: ${e.detail}`),
            openProblems: problems.map((e) => `${e.name}: ${e.detail}`),
            decisionsMade: decisions.map((e) => `${e.name}: ${e.detail}`),
          },
          activeGoals: store.getGoals(projectId, "active"),
          lessonsLearned: store.getLessons(projectId).map((l) => `[${l.topic}] ${l.lesson}`),
          memories: store.recall(undefined, "project", projectId),
          globalPreferences: store.recall(undefined, "global").slice(0, 15),
        });
      }
      const projects = store.listProjects();
      return json({
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          phase: p.phase,
          mode: p.mode,
          updatedAt: p.updatedAt,
        })),
        recentActivity: store
          .getEvents(undefined, eventLimit)
          .map((e) => `[${e.createdAt}] (${e.kind}) ${e.projectId ?? "-"} ${e.name}: ${e.detail.slice(0, 120)}`),
        lessonsLearned: store.getLessons().map((l) => `[${l.topic}] ${l.lesson}`),
        globalPreferences: store.recall(undefined, "global").slice(0, 15),
        hint: "Pass a projectId for that project's full state and journal.",
      });
    },
  );

  server.registerTool(
    "refine",
    {
      title: "Self-improve: distill lessons from the journal",
      description:
        "The self-improvement loop (inspired by continual-harness agents). Call it in two steps. " +
        "Step 1 - call WITHOUT lessons: it returns review material (recent errors, open problems, failed " +
        "audits, repeated tool patterns, existing lessons). Study it and distill what should be done " +
        "differently next time. Step 2 - call WITH lessons: each lesson must be small, actionable and " +
        "evidence-backed (cite the journal events that prove it). Lessons are injected into future " +
        "get_context recaps and work packages, so they actually change behavior. Use scope 'global' for " +
        "lessons that apply to all future projects (e.g. 'Windows needs taskkill for process trees'), " +
        "project scope for project-specific ones. Do NOT record duplicates of existing lessons. " +
        "Good moments to refine: after a failed audit was fixed, after a tricky bug, at project completion.",
      inputSchema: {
        projectId: z.string().optional(),
        lessons: z
          .array(
            z.object({
              topic: z.string().describe("Short category, e.g. 'windows-shell', 'user-design-prefs'"),
              lesson: z.string().describe("The actionable takeaway, one or two sentences"),
              evidence: z.string().describe("What in the journal backs this up"),
              scope: z.enum(["global", "project"]).default("project"),
            }),
          )
          .optional()
          .describe("Omit on the first call to receive review material"),
        deactivateLessonIds: z
          .array(z.number().int())
          .optional()
          .describe("Ids of existing lessons that turned out wrong or obsolete"),
      },
    },
    async ({ projectId, lessons, deactivateLessonIds }) => {
      if (projectId && !store.getProject(projectId)) return err(`No project with id "${projectId}".`);

      if (lessons?.length || deactivateLessonIds?.length) {
        const saved = (lessons ?? []).map((l) =>
          store.addLesson(l.scope === "global" ? null : (projectId ?? null), l.topic, l.lesson, l.evidence),
        );
        const deactivated = (deactivateLessonIds ?? []).filter((id) => store.deactivateLesson(id));
        store.logEvent(projectId ?? null, "milestone", "refine", `Recorded ${saved.length} lesson(s), deactivated ${deactivated.length}.`);
        return json({
          recorded: saved,
          deactivated,
          note: "Lessons now flow into get_context and work packages automatically.",
        });
      }

      // Review mode: assemble the material to learn from.
      const events = store.getEvents(projectId, 200);
      const errors = events.filter((e) => e.kind === "tool" && e.detail.includes("-> ERROR"));
      const problems = events.filter((e) => e.kind === "problem");
      const failedAudits = projectId
        ? store.getAudits(projectId).filter((a) => a.score < 80).slice(0, 3)
        : [];
      const toolCounts = new Map<string, number>();
      for (const e of events) if (e.kind === "tool") toolCounts.set(e.name, (toolCounts.get(e.name) ?? 0) + 1);
      return json({
        review: {
          recentErrors: errors.map((e) => `${e.name}: ${e.detail.slice(0, 200)}`),
          openProblems: problems.map((e) => `${e.name}: ${e.detail.slice(0, 200)}`),
          failedAudits: failedAudits.map((a) => ({ score: a.score, at: a.createdAt })),
          repeatedTools: [...toolCounts.entries()].filter(([, c]) => c >= 3).map(([n, c]) => `${n} x${c}`),
        },
        existingLessons: store.getLessons(projectId, true),
        instructions:
          "Distill at most 3 small, evidence-backed lessons that would prevent these issues or speed up " +
          "future work, then call refine again with the lessons array. Skip anything already covered by " +
          "existingLessons. If nothing genuinely new was learned, do not record anything.",
      });
    },
  );

  server.registerTool(
    "set_goal",
    {
      title: "Set a persistent goal",
      description:
        "Keep an objective and its success criteria active across sessions until done (inspired by " +
        "long-running-agent design). Set one at the start of substantial work, e.g. goal: 'Ship the " +
        "recipe app to Vercel', criteria: 'audit >= 80, deployed URL responds, user confirmed design'. " +
        "get_context and get_project_state surface active goals, so any future session knows what " +
        "'done' means. Update progress with update_goal as work advances.",
      inputSchema: {
        projectId: z.string(),
        goal: z.string(),
        successCriteria: z.string().describe("Measurable conditions that define done"),
      },
    },
    async ({ projectId, goal, successCriteria }) => {
      if (!store.getProject(projectId)) return err(`No project with id "${projectId}".`);
      const g = store.setGoal(projectId, goal, successCriteria);
      store.logEvent(projectId, "milestone", "goal-set", `${goal} (criteria: ${successCriteria})`);
      return json({ goal: g });
    },
  );

  server.registerTool(
    "update_goal",
    {
      title: "Update goal progress or status",
      description:
        "Record progress on a goal ('3 of 5 packages built, audit pending') or change its status: " +
        "'done' when ALL success criteria are verifiably met, 'paused' if the user shelves it, " +
        "'active' to resume. Update progress at meaningful milestones so a fresh session can pick up instantly.",
      inputSchema: {
        goalId: z.number().int(),
        progress: z.string().optional(),
        status: z.enum(["active", "done", "paused"]).optional(),
      },
    },
    async ({ goalId, progress, status }) => {
      const g = store.updateGoal(goalId, progress, status);
      if (!g) return err(`No goal with id ${goalId}.`);
      if (status === "done") store.logEvent(g.projectId, "milestone", "goal-done", g.goal);
      return json({ goal: g });
    },
  );
}
