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
        globalPreferences: store.recall(undefined, "global").slice(0, 15),
        hint: "Pass a projectId for that project's full state and journal.",
      });
    },
  );
}
