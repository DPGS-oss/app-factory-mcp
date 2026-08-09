#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as store from "./state/store.js";
import { registerCoreTools } from "./phases/core.js";
import { registerIntakeTools } from "./phases/intake.js";
import { registerInterviewTools } from "./phases/interview.js";
import { registerDesignTools } from "./phases/design.js";
import { registerBlueprintTools } from "./phases/blueprint.js";
import { registerAuditTools } from "./phases/audit.js";
import { registerDeployTools } from "./phases/deploy.js";
import { registerInstantTools } from "./phases/instant.js";
import { registerWebTools } from "./phases/web.js";
import { registerBrainTools } from "./phases/brain.js";
import { registerExistingAppTools } from "./phases/existing.js";
import { registerImproveTools } from "./phases/improve.js";
import { registerGithubTools } from "./phases/github.js";
import { registerLegalTools } from "./phases/legal.js";
import { registerEvolveTools } from "./phases/evolve.js";
import {
  PORTABLE_BRAIN_SYNC_TOOLS,
  resolveProjectIdForSync,
  trySyncPortableBrain,
} from "./portable-brain/index.js";

const server = new McpServer(
  {
    name: "app-factory",
    version: "0.3.1",
  },
  {
    instructions:
      "App Factory is an ALWAYS-LEARNING build orchestrator. Standing orders for every host agent " +
      "(Cursor, Devin, Claude, Codex, or any MCP client): " +
      "(0) On session start or context loss, call get_context (or get_project_state) and OBEY ranked " +
      "lessonsLearned — they are binding rules, not suggestions. " +
      "(1) Never skip phases. Intake -> interview -> design -> blueprint -> build -> audit -> deploy. " +
      "Ask the USER real questions; do not invent answers. " +
      "(2) LEARNING LOOP (default, not optional): after a failed audit is fixed, a deploy failure is " +
      "resolved, a tricky bug costs more than one retry, or a project/goal completes — call refine " +
      "(review mode first, then record at most 3 concrete When/Do/Because lessons). Skip vague " +
      "slogans and duplicates. Journal shows refine-candidate / audit-failed / deploy-failed / " +
      "self-improvement-candidate when action is required. " +
      "(3) When a lesson or candidate points at a flaw in App Factory ITSELF, file " +
      "propose_self_improvement. The self-evolution gate is sacred: TWO independent justifications " +
      "(second with measured evidence) + machine verification (build+tests+smoke) before " +
      "commit_self_improvement touches git. Never bypass; reject weak proposals. " +
      "(4) BUILD QUALITY: foundation owns contracts/shared types first; frontend/backend stay in " +
      "disjoint ownership; fix audit ROOT CAUSES not symptoms; prefer installed MCPs/skills. " +
      "(5) If the app workspace has AGENTS.md or .app-factory/BRAIN.md, sync key lessons/decisions " +
      "there after refine so learning travels across agents — do not invent a second brain format. " +
      "(6) Periodically list_self_improvements and advance or reject stale proposals.",
  },
);

// The brain's automatic journal: wrap registerTool so every tool call is
// logged to the events table (name, args summary, error flag) without any
// per-tool code. log_event/get_context are excluded to avoid noise.
// It also watches for recurring failures: a tool that errors 3+ times recently
// becomes a 'self-improvement-candidate' problem event - the seed of the
// autonomous learning loop.
// After successful mutating tools, sync the in-repo portable brain so outside
// agents can resume from AGENTS.md / .app-factory/ without MCP.
{
  const NO_JOURNAL = new Set([
    "log_event",
    "get_context",
    "recall",
    "list_projects",
    "get_project_state",
    "read_portable_brain",
    "sync_portable_brain",
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srv = server as any;
  const original = srv.registerTool.bind(server);
  srv.registerTool = (name: string, config: unknown, cb: (...a: unknown[]) => Promise<unknown>) =>
    original(name, config, async (...cbArgs: unknown[]) => {
      const result = (await cb(...cbArgs)) as {
        isError?: boolean;
        content?: { type: string; text: string }[];
      };
      if (!NO_JOURNAL.has(name)) {
        try {
          const args = (cbArgs[0] ?? {}) as Record<string, unknown>;
          const pid = typeof args.projectId === "string" ? args.projectId : null;
          const summary =
            JSON.stringify(args).slice(0, 300) + (result?.isError ? " -> ERROR" : " -> ok");
          store.logEvent(pid, "tool", name, summary);

          if (result?.isError) {
            const recentErrors = store
              .getEvents(undefined, 100)
              .filter((e) => e.kind === "tool" && e.name === name && e.detail.includes("-> ERROR")).length;
            const alreadyFlagged = store
              .getEvents(undefined, 100)
              .some((e) => e.kind === "problem" && e.name === "self-improvement-candidate" && e.detail.includes(`Tool ${name}`));
            if (recentErrors >= 3 && !alreadyFlagged) {
              store.logEvent(
                pid,
                "problem",
                "self-improvement-candidate",
                `Tool ${name} has errored ${recentErrors} times recently. Review with refine; if the fault is in App Factory itself, file propose_self_improvement with this evidence.`,
              );
            }
          }
        } catch {
          // journaling must never break a tool call
        }
      }
      if (!result?.isError && PORTABLE_BRAIN_SYNC_TOOLS.has(name)) {
        try {
          const args = (cbArgs[0] ?? {}) as Record<string, unknown>;
          const text = result?.content?.[0]?.text ?? "";
          const syncId = resolveProjectIdForSync(name, args, text);
          trySyncPortableBrain(syncId);
        } catch {
          // portable brain sync must never break a tool call
        }
      }
      return result;
    });
}

registerCoreTools(server);
registerIntakeTools(server);
registerInterviewTools(server);
registerDesignTools(server);
registerBlueprintTools(server);
registerAuditTools(server);
registerDeployTools(server);
registerInstantTools(server);
registerWebTools(server);
registerBrainTools(server);
registerExistingAppTools(server);
registerImproveTools(server);
registerGithubTools(server);
registerLegalTools(server);
registerEvolveTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("App Factory MCP running on stdio");
