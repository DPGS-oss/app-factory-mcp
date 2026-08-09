import { z } from "zod";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";

// ---------- codebase analysis ----------

export interface AppAnalysis {
  name: string;
  frameworks: string[];
  language: string;
  dependencies: string[];
  capabilities: Record<string, boolean>;
  structure: string[];
  fileCounts: Record<string, number>;
  issues: string[];
}

const FRAMEWORK_DEPS: Record<string, string> = {
  next: "Next.js",
  react: "React",
  "react-native": "React Native",
  expo: "Expo",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  express: "Express",
  fastify: "Fastify",
  electron: "Electron",
  "@tauri-apps/api": "Tauri",
};

function countFiles(dir: string, counts: Record<string, number>, depth = 0): void {
  if (depth > 5) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (["node_modules", ".git", "dist", "build", ".next", "coverage", "out", ".expo"].includes(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) countFiles(full, counts, depth + 1);
    else {
      const ext = entry.includes(".") ? entry.slice(entry.lastIndexOf(".")) : "(none)";
      counts[ext] = (counts[ext] ?? 0) + 1;
    }
  }
}

export function analyzeApp(appPath: string): AppAnalysis {
  let pkg: { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> } = {};
  try {
    pkg = JSON.parse(readFileSync(join(appPath, "package.json"), "utf8"));
  } catch {
    /* not a node project or no package.json */
  }
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const depNames = Object.keys(allDeps);

  const frameworks = Object.entries(FRAMEWORK_DEPS)
    .filter(([dep]) => depNames.includes(dep))
    .map(([, label]) => label);

  const language = existsSync(join(appPath, "tsconfig.json"))
    ? "TypeScript"
    : existsSync(join(appPath, "pyproject.toml")) || existsSync(join(appPath, "requirements.txt"))
      ? "Python"
      : depNames.length > 0
        ? "JavaScript"
        : "unknown";

  const has = (...names: string[]) => names.some((n) => depNames.includes(n));
  const fileExists = (...paths: string[]) => paths.some((p) => existsSync(join(appPath, p)));

  const capabilities: Record<string, boolean> = {
    tests: has("vitest", "jest", "@playwright/test", "mocha") || fileExists("tests", "test", "__tests__", "e2e"),
    lint: fileExists("eslint.config.js", "eslint.config.mjs", ".eslintrc.json", ".eslintrc.js", "biome.json"),
    readme: fileExists("README.md", "readme.md"),
    envExample: fileExists(".env.example", ".env.template", ".env.sample"),
    ci: fileExists(".github/workflows"),
    docker: fileExists("Dockerfile", "docker-compose.yml"),
    database: has("prisma", "@prisma/client", "drizzle-orm", "@supabase/supabase-js", "mongoose", "better-sqlite3", "pg", "mysql2"),
    auth: has("next-auth", "@auth/core", "@clerk/nextjs", "lucia", "passport", "@supabase/auth-helpers-nextjs", "better-auth"),
    payments: has("stripe", "@stripe/stripe-js", "razorpay", "@paypal/checkout-server-sdk"),
    i18n: has("next-intl", "i18next", "react-i18next", "next-i18next"),
    pwa: fileExists("public/manifest.json", "src/app/manifest.ts", "app/manifest.ts") || has("@serwist/next", "next-pwa"),
    analytics: has("posthog-js", "@vercel/analytics", "plausible-tracker"),
    errorTracking: has("@sentry/nextjs", "@sentry/react", "@sentry/node"),
    animation: has("framer-motion", "motion", "react-spring", "@react-spring/web"),
    git: fileExists(".git"),
  };

  let structure: string[] = [];
  try {
    structure = readdirSync(appPath)
      .filter((e) => !["node_modules", ".git", ".next", "dist", "build"].includes(e))
      .slice(0, 40);
  } catch {
    /* unreadable */
  }

  const fileCounts: Record<string, number> = {};
  countFiles(appPath, fileCounts);

  const issues: string[] = [];
  if (!capabilities.tests) issues.push("No automated tests detected.");
  if (!capabilities.readme) issues.push("No README.");
  if (!capabilities.envExample && depNames.length > 0) issues.push("No .env.example documenting environment variables.");
  if (!capabilities.lint) issues.push("No linter configuration.");
  if (!capabilities.ci) issues.push("No CI workflow.");
  if (!capabilities.errorTracking) issues.push("No error tracking - production failures will be invisible.");
  if (!capabilities.git) issues.push("Not a git repository - no version history safety net.");
  if (!pkg.scripts?.build && depNames.length > 0) issues.push("No build script defined.");

  return {
    name: pkg.name ?? appPath.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "app",
    frameworks,
    language,
    dependencies: depNames.slice(0, 60),
    capabilities,
    structure,
    fileCounts,
    issues,
  };
}

// ---------- app runtime testing ----------

function runStep(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, output: output + "\n" + e.message, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.slice(-4000), timedOut });
    });
  });
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    /* already dead */
  }
}

// ---------- tools ----------

export function registerExistingAppTools(server: McpServer): void {
  server.registerTool(
    "analyze_app",
    {
      title: "Analyze an existing app codebase",
      description:
        "Understand an existing app: detects frameworks, language, dependencies, capabilities " +
        "(tests, auth, database, payments, PWA, CI, error tracking...), folder structure and issues. " +
        "Use this FIRST when asked to understand, improve, fix or extend an app that already exists. " +
        "Complements (does not replace) reading the actual source code.",
      inputSchema: {
        appPath: z.string().describe("Absolute path to the app's root folder"),
      },
    },
    async ({ appPath }) => {
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);
      const analysis = analyzeApp(appPath);
      return json({
        analysis,
        hint:
          "To work on this app with the full App Factory workflow (journal, audits, deploys), call " +
          "import_app. For improvement ideas call suggest_improvements. To verify it runs, call test_app.",
      });
    },
  );

  server.registerTool(
    "import_app",
    {
      title: "Import an existing app into App Factory",
      description:
        "Adopt an already-built app as an App Factory project in maintenance mode: analyzes the " +
        "codebase, creates the project (phase=audit) and journals the baseline. From there the " +
        "improve/fix loop is: suggest_improvements -> make changes -> test_app -> run_audit -> deploy. " +
        "All brain/journal/memory tools work on it like any other project.",
      inputSchema: {
        appPath: z.string().describe("Absolute path to the app's root folder"),
        goal: z
          .string()
          .describe("What the user wants: e.g. 'fix the login bug', 'modernize the UI', 'add payments'"),
      },
    },
    async ({ appPath, goal }) => {
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);
      const analysis = analyzeApp(appPath);
      const project = store.createProject(
        analysis.name,
        `[imported existing app] Goal: ${goal}`,
        appPath,
        "maintain",
      );
      store.setPhase(project.id, "audit");
      store.remember("analysis", JSON.stringify(analysis), "project", project.id);
      store.logEvent(
        project.id,
        "milestone",
        "imported",
        `Imported existing app at ${appPath}. Frameworks: ${analysis.frameworks.join(", ") || "unknown"}. ` +
          `Goal: ${goal}. Baseline issues: ${analysis.issues.join(" | ") || "none detected"}`,
      );
      return json({
        project: store.getProject(project.id),
        analysis,
        workflow:
          "Maintenance mode. Recommended loop: (1) run_audit for a scored baseline, " +
          "(2) suggest_improvements for ideas, (3) implement fixes/improvements, journaling decisions " +
          "with log_event, (4) test_app to verify it still runs, (5) run_audit again, (6) deploy. " +
          "Use get_context anytime to recall what has happened.",
      });
    },
  );

  server.registerTool(
    "test_app",
    {
      title: "Test that an app builds, passes tests and runs",
      description:
        "One-step app verification: runs the test suite (if any), the production build (if any), then " +
        "starts the app and checks it actually responds over HTTP without server errors, and cleanly " +
        "stops it. Use after building or changing an app. For visual/UX verification, follow up by " +
        "opening the returned URL with browser tools while running the dev server yourself.",
      inputSchema: {
        appPath: z.string().describe("Absolute path to the app's root folder"),
        url: z.string().default("http://localhost:3000").describe("URL the app serves once started"),
        startCommand: z
          .string()
          .optional()
          .describe("Command to start the app (default: npm run dev, falling back to npm start)"),
        skipBuild: z.boolean().default(false),
        skipTests: z.boolean().default(false),
      },
    },
    async ({ appPath, url, startCommand, skipBuild, skipTests }) => {
      if (!existsSync(appPath)) return err(`appPath "${appPath}" does not exist.`);
      let scripts: Record<string, string> = {};
      try {
        scripts = (JSON.parse(readFileSync(join(appPath, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
      } catch {
        return err("No readable package.json - test_app currently supports Node-based apps.");
      }

      const results: Record<string, unknown> = {};

      if (!skipTests && scripts.test && !scripts.test.includes("no test specified")) {
        const r = await runStep("npm", ["test", "--silent"], appPath, 420000);
        results.tests = { passed: r.code === 0, output: r.code === 0 ? "(passing)" : r.output };
      } else {
        results.tests = { skipped: true, reason: skipTests ? "skipTests=true" : "no test script" };
      }

      if (!skipBuild && scripts.build) {
        const r = await runStep("npm", ["run", "build"], appPath, 600000);
        results.build = { passed: r.code === 0, output: r.code === 0 ? "(clean)" : r.output };
      } else {
        results.build = { skipped: true, reason: skipBuild ? "skipBuild=true" : "no build script" };
      }

      // Runtime check: start, poll, fetch, kill.
      const start = startCommand ?? (scripts.dev ? "npm run dev" : scripts.start ? "npm start" : null);
      if (!start) {
        results.runtime = { skipped: true, reason: "no dev/start script and no startCommand given" };
      } else {
        const [cmd, ...args] = start.split(" ");
        const child = spawn(cmd, args, { cwd: appPath, shell: true, windowsHide: true });
        let serverOutput = "";
        child.stdout?.on("data", (d) => (serverOutput += d.toString()));
        child.stderr?.on("data", (d) => (serverOutput += d.toString()));

        let responded = false;
        let status = 0;
        let bodySnippet = "";
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 2500));
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            status = res.status;
            bodySnippet = (await res.text()).slice(0, 500);
            responded = true;
            break;
          } catch {
            if (child.exitCode !== null) break; // process died
          }
        }
        killTree(child.pid);

        const serverErrored = /error|exception|EADDRINUSE|cannot find module/i.test(serverOutput) && !responded;
        results.runtime = {
          started: child.exitCode === null || responded,
          responded,
          httpStatus: status,
          healthy: responded && status < 500,
          bodySnippet: responded ? bodySnippet : undefined,
          serverOutput: responded && status < 500 ? undefined : serverOutput.slice(-3000),
          ...(serverErrored ? { note: "Server output contains errors - see serverOutput." } : {}),
        };
      }

      const runtime = results.runtime as { healthy?: boolean; skipped?: boolean };
      const tests = results.tests as { passed?: boolean; skipped?: boolean };
      const build = results.build as { passed?: boolean; skipped?: boolean };
      const allGood =
        (tests.skipped || tests.passed) && (build.skipped || build.passed) && (runtime.skipped || runtime.healthy);
      return json({
        verdict: allGood
          ? "APP TEST PASSED - tests, build and runtime are healthy (skipped steps noted)."
          : "APP TEST FAILED - fix the failing step(s) below and re-run test_app.",
        results,
        nextLevel:
          "For deeper verification: start the dev server in a terminal and use browser tools to click " +
          "through the main user flow visually, then run_audit for the full quality pipeline.",
      });
    },
  );
}
