import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";
import { nextStep } from "./guidance.js";
import { trySyncPortableBrain } from "../portable-brain/index.js";
import { formatRankedLessons, rankLessons } from "../learning/lessons.js";

export { nextStep };

export function projectState(project: store.Project) {
  const packages = store.getWorkPackages(project.id);
  const contextText = [
    project.phase,
    project.description,
    ...packages.map((p) => `${p.packageId} ${p.title}`),
  ].join(" ");
  const ranked = rankLessons(store.getLessons(project.id), contextText, 12);
  return {
    project,
    answers: store.getAnswers(project.id),
    designChoices: store.getDesignChoices(project.id),
    workPackages: packages,
    audits: store.getAudits(project.id).slice(0, 3),
    activeGoals: store.getGoals(project.id, "active"),
    lessonsLearned: formatRankedLessons(ranked),
    lessonsRanked: ranked,
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
      const portableBrain = trySyncPortableBrain(project.id);
      return json({
        project,
        rememberedUserPreferences: priorPrefs,
        nextStep: nextStep(project),
        portableBrain: portableBrain
          ? { workspacePath: portableBrain.workspacePath, filesWritten: portableBrain.files.length }
          : null,
        workflow:
          "App Factory guides you phase by phase. Never skip phases: the planning interview and design " +
          "gallery are what make the final app complete. Ask the USER real questions; do not invent answers. " +
          "When workspacePath is set, a portable brain (AGENTS.md + .app-factory/) is kept in the app repo " +
          "so any agent can resume without MCP.",
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
