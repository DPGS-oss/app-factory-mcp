// Smoke test: spawns the built server over stdio, initializes, lists tools,
// and exercises the core project/memory tools end to end.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist", "server.js")],
  env: {
    ...process.env,
    APP_FACTORY_DATA_DIR: join(root, "data", "smoke"),
    APP_FACTORY_NO_BROWSER: "1",
  },
});

const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}):`, tools.map((t) => t.name).join(", "));

function parse(res) {
  return JSON.parse(res.content[0].text);
}

const started = parse(
  await client.callTool({
    name: "start_project",
    arguments: { name: "smoke-app", description: "A tiny test app for smoke testing" },
  }),
);
console.log("start_project -> id:", started.project.id, "phase:", started.project.phase);

await client.callTool({
  name: "remember",
  arguments: { key: "smoke-pref", value: "dark themes", scope: "global" },
});
const recalled = parse(
  await client.callTool({ name: "recall", arguments: { query: "smoke-pref" } }),
);
if (recalled[0]?.value !== "dark themes") throw new Error("recall failed");
console.log("remember/recall -> ok");

const state = parse(
  await client.callTool({
    name: "get_project_state",
    arguments: { projectId: started.project.id },
  }),
);
console.log("get_project_state -> nextStep:", state.nextStep.slice(0, 80) + "...");

// Phase 2: intake + interview
const pid = started.project.id;
const enhanced = parse(
  await client.callTool({ name: "enhance_prompt", arguments: { projectId: pid } }),
);
if (!enhanced.masterPrompt.includes("Master Build Prompt")) throw new Error("enhance_prompt failed");
console.log(`enhance_prompt -> ok (${enhanced.gapCount} gaps found)`);

let rounds = 0;
for (;;) {
  const batch = parse(
    await client.callTool({ name: "get_next_questions", arguments: { projectId: pid } }),
  );
  if (batch.interviewComplete) break;
  if (++rounds > 20) throw new Error("interview never completed");
  for (const q of batch.questions) {
    await client.callTool({
      name: "record_answer",
      arguments: { projectId: pid, questionId: q.questionId, answer: "use your judgment" },
    });
  }
}
const afterInterview = parse(
  await client.callTool({ name: "get_project_state", arguments: { projectId: pid } }),
);
if (afterInterview.project.phase !== "design") throw new Error("expected design phase");
console.log(`interview -> completed in ${rounds} rounds, phase is now "design"`);

// Phase 3: design gallery
const gallery = parse(
  await client.callTool({ name: "launch_design_gallery", arguments: { projectId: pid } }),
);
const page = await fetch(gallery.url).then((r) => r.text());
if (!page.includes("Design Studio")) throw new Error("gallery page did not render");
console.log("launch_design_gallery -> serving at", gallery.url);

const waiting = parse(
  await client.callTool({ name: "get_design_choices", arguments: { projectId: pid } }),
);
if (!waiting.waiting) throw new Error("expected waiting=true before user selects");

const post = await fetch(new URL("/select", gallery.url), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    uiStyle: "dark-professional",
    fontPairing: "techy-grotesk",
    iconSet: "lucide",
    animation: "smooth",
    cardStyle: "glass",
    background: "aurora",
    colors: { primary: "#22d3ee", gradient: true, second: "#8b5cf6" },
    layout: {
      grid: [12, 8],
      screen: "main",
      items: [
        { type: "Navbar", x: 0, y: 0, w: 12, h: 1 },
        { type: "Sidebar", x: 0, y: 1, w: 3, h: 7 },
        { type: "Card Grid", x: 3, y: 1, w: 9, h: 4 },
      ],
    },
  }),
});
if (!post.ok) throw new Error("POST /select failed: " + (await post.text()));

const choices = parse(
  await client.callTool({ name: "get_design_choices", arguments: { projectId: pid } }),
);
if (choices.waiting || !choices.choices.uiStyle) throw new Error("choices not collected");
if (choices.choices.cardStyle?.id !== "glass") throw new Error("optional cardStyle not stored");
if (choices.choices.colors?.primary !== "#22d3ee") throw new Error("custom colors not stored");
if (choices.choices.layout?.items?.length !== 3) throw new Error("layout not stored");
console.log("optional design choices -> cardStyle, background, colors, layout all stored");
const afterDesign = parse(
  await client.callTool({ name: "get_project_state", arguments: { projectId: pid } }),
);
if (afterDesign.project.phase !== "blueprint") throw new Error("expected blueprint phase");
console.log("design gallery -> choices collected, phase is now \"blueprint\"");

// Phase 4: blueprint + work packages
const bp = parse(
  await client.callTool({
    name: "generate_blueprint",
    arguments: { projectId: pid, workspacePath: "C:/tmp/smoke-app" },
  }),
);
if (!bp.blueprint.workPackages.length) throw new Error("no work packages");
console.log(
  `generate_blueprint -> targets: ${bp.blueprint.targets.join(",")}; packages: ` +
    bp.blueprint.workPackages.map((p) => p.packageId).join(", "),
);

const foundation = parse(
  await client.callTool({
    name: "get_work_package",
    arguments: { projectId: pid, packageId: "foundation" },
  }),
);
if (!foundation.templates || !Object.keys(foundation.templates).length) {
  throw new Error("foundation package missing scaffold template");
}
console.log("get_work_package(foundation) -> includes template:", Object.keys(foundation.templates).join(","));

let lastReport;
for (const p of bp.blueprint.workPackages) {
  lastReport = parse(
    await client.callTool({
      name: "report_package_done",
      arguments: { projectId: pid, packageId: p.packageId, summary: "smoke: built" },
    }),
  );
}
if (!lastReport.allPackagesDone) throw new Error("expected all packages done");
const afterBuild = parse(
  await client.callTool({ name: "get_project_state", arguments: { projectId: pid } }),
);
if (afterBuild.project.phase !== "audit") throw new Error("expected audit phase");
console.log('build packages -> all done, phase is now "audit"');

// Phase 5: audit (run against this very repo - expected to NOT pass, exercising the fix loop)
console.log("run_audit -> auditing the MCP repo itself (takes ~a minute)...");
const audit = parse(
  await client.callTool(
    { name: "run_audit", arguments: { projectId: pid, appPath: root } },
    undefined,
    { timeout: 600000 },
  ),
);
if (typeof audit.score !== "number" || !Array.isArray(audit.checks)) throw new Error("bad audit report");
console.log(
  `run_audit -> score ${audit.score}, passed=${audit.passed}, checks: ` +
    audit.checks.map((c) => `${c.name}=${c.status}`).join(", "),
);
if (audit.passed) {
  console.log("run_audit -> passed, project advanced to deploy");
} else if (!audit.fixList.length) {
  throw new Error("failed audit must include fixes");
}

// Phase 6: deploy options, instant site, fetch_url
const opts = parse(
  await client.callTool({ name: "get_deploy_options", arguments: { projectId: pid } }),
);
if (!opts.options.some((o) => o.target === "vercel") || !opts.options.some((o) => o.target === "docker")) {
  throw new Error("deploy options missing targets");
}
console.log("get_deploy_options ->", opts.options.map((o) => o.target).join(", "));

const instant = parse(
  await client.callTool({
    name: "instant_site",
    arguments: { name: "smoke-site", description: "A landing page for a bakery in Pune" },
  }),
);
if (instant.project.phase !== "design" || instant.project.mode !== "instant") {
  throw new Error("instant_site did not fast-forward to design");
}
console.log("instant_site -> project", instant.project.id, "in design phase, gallery at", instant.galleryUrl);

const fetched = parse(
  await client.callTool({
    name: "fetch_url",
    arguments: { url: instant.galleryUrl, maxChars: 2000 },
  }),
);
if (!fetched.content.includes("Design Studio")) throw new Error("fetch_url failed");
console.log("fetch_url -> ok (fetched the gallery page)");

// Phase 7: multi-target inference (expo/tauri/docker templates)
const { inferTargets, readTemplate } = await import(
  new URL("../dist/phases/blueprint.js", import.meta.url)
);
const targets = inferTargets([
  {
    questionId: "platforms.targets",
    question: "",
    answer: "web plus native mobile app stores and a desktop app, self-hosted with docker",
  },
]);
for (const t of ["nextjs-pwa", "expo", "tauri", "docker"]) {
  if (!targets.includes(t)) throw new Error(`target inference missed ${t}`);
  const tpl = readTemplate(t);
  if (!tpl.includes("Scaffold")) throw new Error(`template for ${t} missing or empty`);
}
console.log("multi-target inference -> ", targets.join(", "), "(all templates present)");

// Brain: log_event + get_context (auto-journal should already have tool events)
await client.callTool({
  name: "log_event",
  arguments: { kind: "decision", name: "smoke-decision", detail: "chose X because Y", projectId: pid },
});
const ctx = parse(
  await client.callTool({ name: "get_context", arguments: { projectId: pid } }),
);
if (!ctx.journal.timeline.length) throw new Error("journal is empty - auto-logging failed");
if (!ctx.journal.decisionsMade.some((d) => d.includes("smoke-decision"))) {
  throw new Error("logged decision missing from context");
}
const autoLogged = ctx.journal.timeline.filter((t) => t.includes("(tool)")).length;
console.log(`brain -> ${ctx.journal.timeline.length} journal entries (${autoLogged} auto-logged tool calls)`);

const globalCtx = parse(await client.callTool({ name: "get_context", arguments: {} }));
if (!globalCtx.projects.length) throw new Error("global context missing projects");
console.log("brain -> global recap lists", globalCtx.projects.length, "projects");

// Existing apps: analyze this repo, import it, suggest improvements
const analysis = parse(
  await client.callTool({ name: "analyze_app", arguments: { appPath: root } }),
);
if (analysis.analysis.language !== "TypeScript") throw new Error("analyze_app misdetected language");
console.log(
  "analyze_app -> language:", analysis.analysis.language,
  "| issues:", analysis.analysis.issues.length,
);

const imported = parse(
  await client.callTool({
    name: "import_app",
    arguments: { appPath: root, goal: "smoke: verify import flow" },
  }),
);
if (imported.project.mode !== "maintain" || imported.project.phase !== "audit") {
  throw new Error("import_app did not create a maintain-mode project in audit phase");
}
console.log("import_app -> project", imported.project.id, "(maintain mode, audit phase)");

const suggestions = parse(
  await client.callTool({
    name: "suggest_improvements",
    arguments: { projectId: imported.project.id, appPath: root, focus: "all" },
  }),
);
if (!suggestions.suggestions.length || !suggestions.detectedGaps.length) {
  throw new Error("suggest_improvements returned nothing");
}
console.log(
  `suggest_improvements -> ${suggestions.detectedGaps.length} gaps, ${suggestions.suggestions.length} ideas`,
);

// Design breadth: 16 UI styles in the gallery + inspiration library
const inspiration = parse(
  await client.callTool({ name: "get_design_inspiration", arguments: { limit: 100 } }),
);
if (inspiration.count < 100) throw new Error(`expected 100 inspiration apps, got ${inspiration.count}`);
const darkOnes = parse(
  await client.callTool({ name: "get_design_inspiration", arguments: { query: "dark", limit: 100 } }),
);
console.log(`design inspiration -> ${inspiration.count} apps total, ${darkOnes.count} match 'dark'`);

const { UI_STYLES, FONT_PAIRINGS, ICON_SETS } = await import(
  new URL("../dist/gallery/options.js", import.meta.url)
);
if (UI_STYLES.length < 16 || FONT_PAIRINGS.length < 8 || ICON_SETS.length < 6) {
  throw new Error("design catalog not expanded");
}
console.log(
  `design catalog -> ${UI_STYLES.length} UI styles, ${FONT_PAIRINGS.length} font pairings, ${ICON_SETS.length} icon sets`,
);

// GitHub search (network; tolerate rate-limit errors but not crashes)
const gh = await client.callTool({
  name: "search_github",
  arguments: { query: "react starter", minStars: 1000, limit: 3 },
});
if (gh.isError) {
  console.log("search_github -> skipped (network/rate limit):", gh.content[0].text.slice(0, 80));
} else {
  const repos = parse(gh);
  if (!repos.results.length) throw new Error("search_github returned no results");
  console.log("search_github ->", repos.results.map((r) => r.fullName).join(", "));
}

// Legal & compliance
const legal = parse(
  await client.callTool({
    name: "generate_legal_docs",
    arguments: {
      appName: "smoke-app",
      owner: "Smoke Labs",
      contactEmail: "legal@smoke.test",
      dataCollected: "email, name, recipes",
      regions: ["EU", "US/California"],
      usesAnalytics: true,
      usesPayments: true,
      usesCookies: true,
      childrenUnder13: false,
      jurisdiction: "India",
    },
  }),
);
if (!legal.documents["privacy-policy.md"].includes("GDPR")) throw new Error("privacy policy missing GDPR");
if (!legal.documents["terms-of-service.md"].includes("India")) throw new Error("terms missing jurisdiction");
if (!legal.documents["cookie-policy.md"]) throw new Error("cookie policy missing");
if (!legal.applicableRegulations.some((r) => r.includes("CCPA"))) throw new Error("CCPA not detected");
console.log(
  `generate_legal_docs -> ${Object.keys(legal.documents).length} documents, ` +
    `${legal.complianceChecklist.length} checklist items, regulations: ${legal.applicableRegulations.join("; ")}`,
);

await client.close();
console.log("SMOKE TEST PASSED");
