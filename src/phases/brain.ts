import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";
import { projectState } from "./core.js";
import * as portableBrain from "../portable-brain/index.js";
import {
  LESSON_ANTI_PATTERNS,
  LESSON_QUALITY_BAR,
  REFINE_TRIGGERS,
  formatRankedLessons,
  isDuplicateLesson,
  portableBrainSyncHint,
  rankLessons,
} from "../learning/lessons.js";

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
        "Tool calls are journaled automatically - log the reasoning and events between them. " +
        "After fixing a failed audit or deploy, log a milestone then call refine.",
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
      const synced = projectId ? portableBrain.trySyncPortableBrain(projectId) : null;
      return json({
        logged: { kind, name },
        portableBrain: synced ? { workspacePath: synced.workspacePath, updated: true } : null,
      });
    },
  );

  server.registerTool(
    "get_context",
    {
      title: "Get full situational context (the brain's recap)",
      description:
        "Reconstructs context: what is happening, what has happened, and what to do next. " +
        "With a projectId: the project's full state plus its journal timeline (tool calls, decisions, " +
        "problems, milestones), ranked lessonsLearned (most relevant first), and related memories. " +
        "Without: a global recap of all projects and recent activity. Call this at the START of any " +
        "session that continues earlier work, after context loss, or whenever unsure what already happened.",
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
        const packages = store.getWorkPackages(projectId);
        const contextText = [
          project.phase,
          project.description,
          ...packages.map((p) => `${p.packageId} ${p.title} ${p.status}`),
          ...problems.map((e) => e.name + " " + e.detail),
        ].join(" ");
        const ranked = rankLessons(store.getLessons(projectId), contextText, 12);
        const refinePending = problems.filter(
          (e) =>
            e.name === "refine-candidate" ||
            e.name === "self-improvement-candidate" ||
            e.name.includes("audit-failed") ||
            e.name.includes("deploy-failed"),
        );
        return json({
          state: projectState(project),
          journal: {
            timeline: events.map((e) => `[${e.createdAt}] (${e.kind}) ${e.name}: ${e.detail}`),
            openProblems: problems.map((e) => `${e.name}: ${e.detail}`),
            decisionsMade: decisions.map((e) => `${e.name}: ${e.detail}`),
          },
          activeGoals: store.getGoals(projectId, "active"),
          lessonsLearned: formatRankedLessons(ranked),
          lessonsRanked: ranked,
          learningLoop: {
            refinePending: refinePending.map((e) => `${e.name}: ${e.detail.slice(0, 200)}`),
            refineTriggers: REFINE_TRIGGERS,
            portableBrain: portableBrainSyncHint(project.workspacePath),
          },
          memories: store.recall(undefined, "project", projectId),
          globalPreferences: store.recall(undefined, "global").slice(0, 15),
        });
      }
      const projects = store.listProjects();
      const ranked = rankLessons(store.getLessons(), "global build deploy audit windows", 15);
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
        lessonsLearned: formatRankedLessons(ranked),
        lessonsRanked: ranked,
        globalPreferences: store.recall(undefined, "global").slice(0, 15),
        learningLoop: {
          refineTriggers: REFINE_TRIGGERS,
          hint: "Pass a projectId for that project's full state, ranked lessons, and refine candidates.",
        },
      });
    },
  );

  server.registerTool(
    "refine",
    {
      title: "Self-improve: distill lessons from the journal",
      description:
        "ALWAYS-LEARNING loop. Call in two steps. " +
        "Step 1 WITHOUT lessons: returns review material (errors, open problems, failed audits, deploy " +
        "failures, repeated tools, existing lessons, quality bar, anti-patterns). " +
        "Step 2 WITH lessons: each lesson must be small, actionable, evidence-backed. Near-duplicates are " +
        "rejected. Lessons inject into get_context and work packages ranked by relevance. " +
        "WHEN to call: " +
        REFINE_TRIGGERS.slice(0, 4).join(" | ") +
        ". Do NOT record vague slogans or duplicates.",
      inputSchema: {
        projectId: z.string().optional(),
        lessons: z
          .array(
            z.object({
              topic: z.string().describe("Short category, e.g. 'windows-shell', 'audit-csp'"),
              lesson: z
                .string()
                .describe("Actionable rule: 'When X, do Y because Z' — one or two sentences"),
              evidence: z.string().describe("Journal events / audit findings that prove it"),
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
        const existing = store.getLessons(projectId, true);
        const saved = [];
        const rejected: { topic: string; reason: string }[] = [];
        for (const l of lessons ?? []) {
          if (l.lesson.trim().length < 40) {
            rejected.push({ topic: l.topic, reason: "Too thin (<40 chars). Make it a concrete When/Do/Because rule." });
            continue;
          }
          const dup = isDuplicateLesson(l.lesson, existing);
          if (dup.duplicate) {
            rejected.push({
              topic: l.topic,
              reason: `Near-duplicate of existing lesson: "${dup.matchedLesson}"`,
            });
            continue;
          }
          const row = store.addLesson(
            l.scope === "global" ? null : (projectId ?? null),
            l.topic,
            l.lesson,
            l.evidence,
          );
          saved.push(row);
          existing.push(row);
        }
        const deactivated = (deactivateLessonIds ?? []).filter((id) => store.deactivateLesson(id));
        store.logEvent(
          projectId ?? null,
          "milestone",
          "refine",
          `Recorded ${saved.length} lesson(s), deactivated ${deactivated.length}, rejected ${rejected.length}.`,
        );
        const project = projectId ? store.getProject(projectId) : null;
        const synced = projectId ? portableBrain.trySyncPortableBrain(projectId) : null;
        return json({
          recorded: saved,
          deactivated,
          rejected,
          portableBrain: synced
            ? { ...portableBrainSyncHint(project?.workspacePath), synced: true, filesUpdated: synced.files.length }
            : portableBrainSyncHint(project?.workspacePath),
          note:
            "Lessons now flow into get_context and work packages (ranked by relevance). " +
            "Portable brain files were synced when a workspacePath is set.",
        });
      }

      // Review mode: assemble the material to learn from.
      const events = store.getEvents(projectId, 200);
      const errors = events.filter((e) => e.kind === "tool" && e.detail.includes("-> ERROR"));
      const problems = events.filter((e) => e.kind === "problem");
      const failedAudits = projectId
        ? store.getAudits(projectId).filter((a) => a.score < 80).slice(0, 5)
        : [];
      const deployFails = problems.filter((e) => e.name.includes("deploy-failed"));
      const refineCandidates = problems.filter(
        (e) =>
          e.name === "refine-candidate" ||
          e.name === "self-improvement-candidate" ||
          e.name.includes("audit-failed") ||
          e.name.includes("deploy-failed"),
      );
      const toolCounts = new Map<string, number>();
      const toolErrors = new Map<string, number>();
      for (const e of events) {
        if (e.kind === "tool") {
          toolCounts.set(e.name, (toolCounts.get(e.name) ?? 0) + 1);
          if (e.detail.includes("-> ERROR")) {
            toolErrors.set(e.name, (toolErrors.get(e.name) ?? 0) + 1);
          }
        }
      }
      return json({
        review: {
          recentErrors: errors.map((e) => `${e.name}: ${e.detail.slice(0, 200)}`),
          openProblems: problems.map((e) => `${e.name}: ${e.detail.slice(0, 200)}`),
          refineCandidates: refineCandidates.map((e) => `${e.name}: ${e.detail.slice(0, 240)}`),
          failedAudits: failedAudits.map((a) => ({
            score: a.score,
            at: a.createdAt,
            topFindings: summarizeAuditFindings(a.report),
          })),
          deployFailures: deployFails.map((e) => e.detail.slice(0, 240)),
          repeatedTools: [...toolCounts.entries()].filter(([, c]) => c >= 3).map(([n, c]) => `${n} x${c}`),
          errorProneTools: [...toolErrors.entries()]
            .filter(([, c]) => c >= 2)
            .map(([n, c]) => `${n} errors x${c}`),
        },
        existingLessons: store.getLessons(projectId, true),
        qualityBar: LESSON_QUALITY_BAR,
        antiPatterns: LESSON_ANTI_PATTERNS,
        whenToRefine: REFINE_TRIGGERS,
        instructions:
          "Distill at most 3 small, evidence-backed lessons that would prevent these issues or speed up " +
          "future work, then call refine again with the lessons array. Skip anything already covered by " +
          "existingLessons. Reject vague slogans. If a flaw is in App Factory itself (not the app under " +
          "construction), file propose_self_improvement instead. If nothing genuinely new was learned, " +
          "do not record anything.",
      });
    },
  );

  server.registerTool(
    "set_goal",
    {
      title: "Set a persistent goal",
      description:
        "Keep an objective and its success criteria active across sessions (inspired by " +
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
        "'active' to resume. When marking done after a hard project, call refine next.",
      inputSchema: {
        goalId: z.number().int(),
        progress: z.string().optional(),
        status: z.enum(["active", "done", "paused"]).optional(),
      },
    },
    async ({ goalId, progress, status }) => {
      const g = store.updateGoal(goalId, progress, status);
      if (!g) return err(`No goal with id ${goalId}.`);
      if (status === "done") {
        store.logEvent(g.projectId, "milestone", "goal-done", g.goal);
        store.logEvent(
          g.projectId,
          "problem",
          "refine-candidate",
          "Goal completed. Call refine to distill lasting lessons before the session ends.",
        );
      }
      portableBrain.trySyncPortableBrain(g.projectId);
      return json({
        goal: g,
        ...(status === "done"
          ? { nextLearningStep: "Call refine (review mode, then with lessons) before closing out." }
          : {}),
      });
    },
  );

  server.registerTool(
    "init_portable_brain",
    {
      title: "Initialize portable brain in an app workspace",
      description:
        "Create the in-repo portable brain so any coding agent (Cursor, Claude Code, Codex, Devin) can " +
        "resume without App Factory MCP. Writes AGENTS.md, CLAUDE.md, and .app-factory/{BRAIN.md,state.json," +
        "journal.jsonl,decisions.md,open-problems.md}. Idempotent. Pass workspacePath if the project does " +
        "not already have one. Prefer calling this when a workspace is first known; sync_portable_brain " +
        "keeps it current afterward (also runs automatically on major tools).",
      inputSchema: {
        projectId: z.string(),
        workspacePath: z
          .string()
          .optional()
          .describe("Absolute app root; required if the project has no workspacePath yet"),
      },
    },
    async ({ projectId, workspacePath }) => {
      if (!store.getProject(projectId)) return err(`No project with id "${projectId}".`);
      try {
        const result = portableBrain.initPortableBrain(projectId, workspacePath);
        store.logEvent(projectId, "milestone", "portable-brain-init", `Initialized at ${result.workspacePath}`);
        return json({
          initialized: result.initialized,
          workspacePath: result.workspacePath,
          files: result.files,
          hint: "Outside agents: open AGENTS.md then .app-factory/BRAIN.md to resume.",
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "sync_portable_brain",
    {
      title: "Sync portable brain files from App Factory state",
      description:
        "Rewrite the app's portable brain from current SQLite state (phase, answers, design, packages, " +
        "audits, goals, lessons, decisions, problems) and append new journal events. Safe and idempotent. " +
        "Also runs automatically after start/import, answers, design, blueprint, build progress, audits, " +
        "goals, refine, and log_event when a workspacePath is set.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      if (!store.getProject(projectId)) return err(`No project with id "${projectId}".`);
      try {
        const result = portableBrain.syncPortableBrain(projectId);
        if (!result) {
          return err(
            `Project "${projectId}" has no workspacePath. Call init_portable_brain with workspacePath first.`,
          );
        }
        return json({
          workspacePath: result.workspacePath,
          filesUpdated: result.files,
          lastSyncedEventId: result.lastSyncedEventId,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "read_portable_brain",
    {
      title: "Read the portable brain from an app workspace",
      description:
        "Read AGENTS.md / .app-factory brain files from disk (by projectId or workspacePath). Use when " +
        "resuming work, verifying sync, or inspecting what an outside agent would see without MCP.",
      inputSchema: {
        projectId: z.string().optional(),
        workspacePath: z.string().optional(),
        journalLimit: z.number().int().min(1).max(200).default(40),
      },
    },
    async ({ projectId, workspacePath, journalLimit }) => {
      if (!projectId && !workspacePath) return err("Provide projectId or workspacePath.");
      try {
        return json(portableBrain.readPortableBrain({ projectId, workspacePath, journalLimit }));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "write_portable_brain",
    {
      title: "Write a decision/problem/note into the portable brain",
      description:
        "Record an observation into both App Factory's journal and the in-repo portable brain, then sync. " +
        "Use when an agent needs to persist a decision, problem, milestone or note that future agents " +
        "must see in AGENTS.md / .app-factory/.",
      inputSchema: {
        projectId: z.string(),
        kind: z.enum(["note", "decision", "problem", "milestone"]),
        name: z.string(),
        detail: z.string(),
      },
    },
    async ({ projectId, kind, name, detail }) => {
      if (!store.getProject(projectId)) return err(`No project with id "${projectId}".`);
      try {
        const result = portableBrain.writePortableBrainEvent(projectId, kind, name, detail, true);
        return json({
          written: result.journalLine,
          sync: result.sync
            ? { workspacePath: result.sync.workspacePath, filesUpdated: result.sync.files.length }
            : null,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );
}

function summarizeAuditFindings(report: Record<string, unknown>): string[] {
  const fixList = report.fixList;
  if (Array.isArray(fixList)) {
    return fixList.slice(0, 5).map((f) => String(f).slice(0, 160));
  }
  const critical = report.criticalFindings;
  if (Array.isArray(critical)) {
    return critical.slice(0, 5).map((f) => String(f).slice(0, 160));
  }
  return [];
}
