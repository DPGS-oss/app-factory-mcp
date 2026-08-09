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

const server = new McpServer({
  name: "app-factory",
  version: "0.1.0",
});

// The brain's automatic journal: wrap registerTool so every tool call is
// logged to the events table (name, args summary, error flag) without any
// per-tool code. log_event/get_context are excluded to avoid noise.
{
  const NO_JOURNAL = new Set(["log_event", "get_context", "recall", "list_projects", "get_project_state"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srv = server as any;
  const original = srv.registerTool.bind(server);
  srv.registerTool = (name: string, config: unknown, cb: (...a: unknown[]) => Promise<unknown>) =>
    original(name, config, async (...cbArgs: unknown[]) => {
      const result = (await cb(...cbArgs)) as { isError?: boolean };
      if (!NO_JOURNAL.has(name)) {
        try {
          const args = (cbArgs[0] ?? {}) as Record<string, unknown>;
          const pid = typeof args.projectId === "string" ? args.projectId : null;
          const summary =
            JSON.stringify(args).slice(0, 300) + (result?.isError ? " -> ERROR" : " -> ok");
          store.logEvent(pid, "tool", name, summary);
        } catch {
          // journaling must never break a tool call
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("App Factory MCP running on stdio");
