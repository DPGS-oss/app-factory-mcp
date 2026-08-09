import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";

/** Human-readable "what to do next" guidance per phase, used across tools. */
export function nextStep(project: store.Project): string {
  switch (project.phase) {
    case "intake":
      return `Call enhance_prompt with projectId "${project.id}" to turn the description into a refined master prompt and a gap list.`;
    case "interview":
      return `Call get_next_questions with projectId "${project.id}", ask the USER those questions (do not answer them yourself), then save each reply with record_answer. Repeat until the interview reports complete.`;
    case "design":
      return `Call launch_design_gallery with projectId "${project.id}". A browser page opens where the USER picks a UI style, font pairing, icon set and animation level. Then call get_design_choices to read their selections.`;
    case "blueprint":
      return `Call generate_blueprint with projectId "${project.id}". It compiles everything into a build spec with parallel work packages. Then launch parallel subagents, one per work package.`;
    case "build":
      return `For each work package: call get_work_package, give its spec to a subagent, and call report_package_done when it finishes. When all packages are done the project advances to audit.`;
    case "audit":
      return `Call run_audit with projectId "${project.id}" and the app path. Fix every item in the fix list, then re-run until the audit passes (score >= 80 and no critical findings).`;
    case "deploy":
      return `Call get_deploy_options with projectId "${project.id}", ask the USER which target they want, then call deploy.`;
    case "done":
      return `Project is complete. Store any lasting user preferences with remember (scope "global") so future projects start smarter.`;
  }
}

export function projectState(project: store.Project) {
  return {
    project,
    answers: store.getAnswers(project.id),
    designChoices: store.getDesignChoices(project.id),
    workPackages: store.getWorkPackages(project.id),
    audits: store.getAudits(project.id).slice(0, 3),
    nextStep: nextStep(project),
  };
}

export function registerCoreTools(server: McpServer): void {
  server.registerTool(
    "start_project",
    {
      title: "Start a new app project",
      description:
        "Begin the App Factory workflow for a new app. Provide the user's raw description verbatim. " +
        "Returns the project id and the first step of the guided workflow " +
        "(intake -> interview -> design -> blueprint -> build -> audit -> deploy).",
      inputSchema: {
        name: z.string().describe("Short project name, e.g. 'recipe-box'"),
        description: z
          .string()
          .describe("The user's app description, as raw and complete as possible"),
        workspacePath: z
          .string()
          .optional()
          .describe("Absolute path of the folder where the app will be built"),
      },
    },
    async ({ name, description, workspacePath }) => {
      const project = store.createProject(name, description, workspacePath);
      const priorPrefs = store.recall(undefined, "global").slice(0, 10);
      return json({
        project,
        rememberedUserPreferences: priorPrefs,
        nextStep: nextStep(project),
        workflow:
          "App Factory guides you phase by phase. Never skip phases: the planning interview and design " +
          "gallery are what make the final app complete. Ask the USER real questions; do not invent answers.",
      });
    },
  );

  server.registerTool(
    "get_project_state",
    {
      title: "Get project state",
      description:
        "Full state of an App Factory project: phase, interview answers, design choices, work packages, " +
        "recent audits, and exactly what to do next. Call this whenever unsure how to proceed.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}". Use list_projects.`);
      return json(projectState(project));
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List all App Factory projects with their current phase.",
      inputSchema: {},
    },
    async () => json(store.listProjects()),
  );

  server.registerTool(
    "remember",
    {
      title: "Store a memory",
      description:
        "Persist a fact for future sessions. Use scope 'global' for lasting user preferences " +
        "(favorite styles, fonts, stacks, deploy targets) and scope 'project' for project-specific facts. " +
        "Global memories personalize every future project.",
      inputSchema: {
        key: z.string().describe("Short identifier, e.g. 'preferred-font-style'"),
        value: z.string().describe("The fact to remember"),
        scope: z.enum(["global", "project"]).default("global"),
        projectId: z.string().optional().describe("Required when scope is 'project'"),
      },
    },
    async ({ key, value, scope, projectId }) => {
      if (scope === "project" && !projectId) {
        return err("projectId is required when scope is 'project'.");
      }
      store.remember(key, value, scope, projectId);
      return json({ stored: { key, value, scope, projectId: projectId ?? null } });
    },
  );

  server.registerTool(
    "recall",
    {
      title: "Recall memories",
      description:
        "Search stored memories. Call with no arguments to list recent memories, or filter by query text, " +
        "scope, and projectId. Always recall global memories at the start of a new project.",
      inputSchema: {
        query: z.string().optional().describe("Substring to search in keys and values"),
        scope: z.enum(["global", "project"]).optional(),
        projectId: z.string().optional(),
      },
    },
    async ({ query, scope, projectId }) => json(store.recall(query, scope, projectId)),
  );
}
