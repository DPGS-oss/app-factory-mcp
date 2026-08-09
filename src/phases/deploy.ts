import { z } from "zod";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";

type DeployTarget = "vercel" | "netlify" | "docker" | "local" | "expo-eas" | "tauri-bundle";

interface DeployOption {
  target: DeployTarget;
  bestFor: string;
  requirements: string[];
  steps: string[];
}

function deployOptions(): DeployOption[] {
  return [
    {
      target: "vercel",
      bestFor: "Web apps and websites - easiest, free tier, custom domains, automatic HTTPS.",
      requirements: ["A Vercel account", "vercel CLI login (`npx vercel login`) or the Vercel MCP"],
      steps: [
        "Ensure the production build passes locally",
        "deploy tool runs `npx vercel --prod --yes` in the app folder",
        "Set environment variables in the Vercel dashboard or via `npx vercel env add`",
      ],
    },
    {
      target: "netlify",
      bestFor: "Static sites and simple web apps; generous free tier.",
      requirements: ["A Netlify account", "netlify CLI login (`npx netlify login`)"],
      steps: ["deploy tool runs `npx netlify deploy --prod`"],
    },
    {
      target: "docker",
      bestFor: "Self-hosting on your own server or NAS; full control, no vendor.",
      requirements: ["Docker installed on the target machine"],
      steps: [
        "deploy tool writes Dockerfile, .dockerignore and docker-compose.yml into the app",
        "deploy tool (execute=true) runs `docker compose up -d --build`",
      ],
    },
    {
      target: "local",
      bestFor: "Personal apps that only run on this machine - zero hosting cost.",
      requirements: ["Node.js on this machine"],
      steps: [
        "deploy tool runs the production build",
        "App starts with `npm start`; optionally register it to run at login",
      ],
    },
    {
      target: "expo-eas",
      bestFor: "Native mobile apps for the App Store / Play Store (Expo projects).",
      requirements: ["An Expo account", "`npm i -g eas-cli` and `eas login`", "Store developer accounts"],
      steps: ["`eas build --platform all`", "`eas submit` for store submission"],
    },
    {
      target: "tauri-bundle",
      bestFor: "Desktop installers for Windows/Mac/Linux (Tauri projects).",
      requirements: ["Rust toolchain", "Platform signing certificates for distribution"],
      steps: ["`npm run tauri build` produces installers in src-tauri/target/release/bundle"],
    },
  ];
}

function dockerfileFor(appPath: string): string {
  let isNext = false;
  try {
    const pkg = JSON.parse(readFileSync(join(appPath, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    isNext = Boolean(pkg.dependencies?.next);
  } catch {
    /* generic node app */
  }
  if (isNext) {
    return `FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
`;
  }
  return `FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app ./
USER app
EXPOSE 3000
CMD ["npm", "start"]
`;
}

const DOCKERIGNORE = `node_modules
.next
dist
.git
.env
*.log
`;

function composeFor(appName: string): string {
  return `services:
  app:
    build: .
    container_name: ${appName.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
`;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, output: output + "\n" + e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.slice(-6000) });
    });
  });
}

export function registerDeployTools(server: McpServer): void {
  server.registerTool(
    "get_deploy_options",
    {
      title: "Get deployment options",
      description:
        "Phase 6 of the App Factory workflow. Lists deployment targets with requirements and steps. " +
        "Present the relevant options to the USER (respecting their interview answer about deployment) " +
        "and ask which they want, then call deploy.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["build", "audit", "deploy", "done"]);
      if (phaseError) return err(phaseError);

      const deployAnswer = store
        .getAnswers(projectId)
        .find((a) => a.questionId === "deployment.target")?.answer;
      return json({
        userDeployAnswer: deployAnswer ?? "(not asked)",
        options: deployOptions(),
        instructions:
          "Ask the USER which target to use (their interview answer above is the default). " +
          "Then call deploy with execute=false first to review generated configs, and execute=true to actually deploy.",
      });
    },
  );

  server.registerTool(
    "deploy",
    {
      title: "Deploy the app",
      description:
        "Deploys the finished app. With execute=false it only generates deployment config files " +
        "(Dockerfile/compose for docker) and returns the exact commands. With execute=true it runs the " +
        "deployment. Only available once the audit has passed. Marks the project done on success.",
      inputSchema: {
        projectId: z.string(),
        appPath: z.string().describe("Absolute path to the app root"),
        target: z.enum(["vercel", "netlify", "docker", "local", "expo-eas", "tauri-bundle"]),
        execute: z
          .boolean()
          .default(false)
          .describe("false = generate configs and commands only; true = actually run the deployment"),
      },
    },
    async ({ projectId, appPath, target, execute }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["deploy", "done"]);
      if (phaseError) return err(phaseError);
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);

      const generated: string[] = [];
      let command: { cmd: string; args: string[] } | null = null;

      switch (target) {
        case "docker": {
          writeFileSync(join(appPath, "Dockerfile"), dockerfileFor(appPath));
          writeFileSync(join(appPath, ".dockerignore"), DOCKERIGNORE);
          writeFileSync(join(appPath, "docker-compose.yml"), composeFor(project.name));
          generated.push("Dockerfile", ".dockerignore", "docker-compose.yml");
          command = { cmd: "docker", args: ["compose", "up", "-d", "--build"] };
          break;
        }
        case "vercel":
          command = { cmd: "npx", args: ["--yes", "vercel", "--prod", "--yes"] };
          break;
        case "netlify":
          command = { cmd: "npx", args: ["--yes", "netlify", "deploy", "--prod"] };
          break;
        case "local":
          command = { cmd: "npm", args: ["run", "build"] };
          break;
        case "expo-eas":
          command = { cmd: "npx", args: ["--yes", "eas-cli", "build", "--platform", "all", "--non-interactive"] };
          break;
        case "tauri-bundle":
          command = { cmd: "npm", args: ["run", "tauri", "build"] };
          break;
      }

      if (!execute) {
        return json({
          executed: false,
          generatedFiles: generated,
          commandToRun: command ? `${command.cmd} ${command.args.join(" ")}` : null,
          hint:
            "Review the generated files, make sure required logins/env vars exist, then call deploy " +
            "again with execute=true (or run the command yourself in the terminal).",
        });
      }

      const result = await runCommand(command!.cmd, command!.args, appPath, 1200000);
      const ok = result.code === 0;
      if (ok) store.setPhase(projectId, "done");
      return json({
        executed: true,
        success: ok,
        generatedFiles: generated,
        output: result.output,
        ...(ok
          ? {
              projectComplete: true,
              finalStep:
                "Deployment succeeded. Tell the USER where the app lives, and store their deploy " +
                "preference with remember (scope global).",
            }
          : { hint: "Deployment failed - read the output, fix the cause, and retry." }),
      });
    },
  );
}
