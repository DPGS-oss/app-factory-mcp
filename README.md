# App Factory MCP

[![CI](https://github.com/DPGS-oss/app-factory-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/DPGS-oss/app-factory-mcp/actions/workflows/ci.yml)

An orchestrator MCP server that takes a plain-language app description all the way to a deployed,
audited application. It guides the host agent (Cursor, Devin, Claude Desktop - any MCP client) and
its parallel subagents through a strict quality workflow - the MCP owns the state machine, memory,
checklists, design gallery and audit/deploy pipelines; the agent writes the code.

## The workflow

```
intake -> interview -> design -> blueprint -> build -> audit -> deploy
```

1. **Intake** - `start_project` + `enhance_prompt`: your description becomes a structured master
   prompt plus a gap list measured against the "everything an app needs" checklist.
2. **Interview** - `get_next_questions` / `record_answer`: a checklist-driven planning interview
   (auth, data, payments, offline, accessibility, legal, deployment...). Core questions are always
   asked; others appear only when relevant.
3. **Design** - `launch_design_gallery`: a local web page opens in your browser - a full design
   studio. Required sections: sixteen live UI mockups of *your* app (each inspired by famous
   products - Spotify, Notion, Linear, Stripe, Airbnb, Netflix, Duolingo, Apple and more), eight
   real font pairings, six icon sets and four animation levels. Optional sections: **card style**
   (flat / outlined / elevated / frosted glass), **background treatment** (solid / subtle gradient /
   vivid gradient / aurora blur), an interactive **color wheel** (pick your own accent, optionally a
   two-color gradient), and a drag-and-drop **layout designer** where you arrange Navbar, Sidebar,
   Hero, Card Grid and more on a 12x8 grid to design the main screen yourself. Everything flows back
   through `get_design_choices`. For even broader direction, `get_design_inspiration` serves the
   design languages of 100 of the world's most famous apps (palettes and patterns as inspiration -
   never logos or brand assets).
4. **Blueprint** - `generate_blueprint`: everything is compiled into parallelizable work packages
   (foundation, frontend, backend, tests, polish) with disjoint file ownership, ready for parallel
   Cursor subagents. Scaffold targets are inferred: Next.js PWA (web), Expo (native mobile),
   Tauri (desktop), Docker (self-hosted).
5. **Build** - `get_work_package` / `report_package_done` coordinate the subagents.
6. **Audit** - `run_audit`: one call runs typecheck, lint, tests, dependency vulnerability scan,
   secret scan, semgrep (if installed) and Lighthouse (if given a running URL). Returns a score and
   a fix list; the workflow refuses to advance until it passes (score >= the configurable `minScore`
   gate, default 80, with zero critical findings).
7. **Deploy** - `get_deploy_options` / `deploy`: Vercel, Netlify, Docker (configs generated for
   you), local, Expo EAS or Tauri bundles.

Plus:

- **The brain** - every tool call is journaled automatically; the agent records decisions, problems
  and milestones with `log_event`, and `get_context` reconstructs what is happening, what has
  happened and what to do next - across sessions. Long journals are compacted automatically into
  digest entries so recaps stay sharp on big projects.
- **Self-improvement** - `refine` reviews the journal (errors, open problems, failed audits,
  repeated patterns) and persists small, evidence-backed lessons. Lessons are injected into future
  `get_context` recaps and work packages, so the system genuinely gets better with use - global
  lessons carry across all projects.
- **Persistent goals** - `set_goal` / `update_goal` keep an objective and measurable success
  criteria alive across sessions, so any future session knows exactly what "done" means.
- **Memory** - `remember` / `recall` (SQLite): global user preferences persist across projects, so
  every new project starts smarter.
- **Existing apps** - `analyze_app` understands any codebase (frameworks, capabilities, issues),
  `import_app` adopts it as a maintenance-mode project for the improve/fix loop, and `test_app`
  verifies it builds, passes tests and actually responds over HTTP.
- **Improvement engine** - `suggest_improvements` proposes upgrades on two levels: the app (UX,
  performance, retention, quality gaps) and the idea itself (positioning, differentiation,
  monetization).
- **GitHub scout** - `search_github` finds supporting repos/libraries with license and maintenance
  signals.
- **Legal & compliance** - `generate_legal_docs` produces tailored Privacy Policy, Terms of Service
  and Cookie Policy templates plus a region-aware compliance checklist (GDPR, CCPA/CPRA, DPDP,
  COPPA, PCI-DSS), and the interview asks where your users live so the right regulations apply.
  Templates, not legal advice - the tool says so too.
- **Instant websites** - `instant_site`: skips the deep interview, auto-fills sensible answers,
  jumps straight to the design gallery, then scaffold-audit-deploy.
- **Internet** - `web_search` / `fetch_url` for research during any phase.
- **Standalone audits** - `run_audit` works on any codebase, no project required.

## Install

Requires Node.js >= 22.5 (uses the built-in `node:sqlite`).

From source:

```bash
npm install
npm run build
```

Register in Cursor's `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "app-factory": {
      "command": "node",
      "args": ["<absolute path to this folder>/dist/server.js"]
    }
  }
}
```

Then reload Cursor and say e.g. *"Use app-factory to build me a recipe manager app"*.

State is stored in `~/.app-factory` (or `./data` when running from a clone that already has one);
override with the `APP_FACTORY_DATA_DIR` environment variable.

## Beyond Cursor: Devin and other MCP clients

App Factory speaks standard MCP over stdio, so any MCP-capable agent can run it:

- **Devin (cloud)**: Settings -> MCP Marketplace -> **Add a custom MCP** -> transport STDIO,
  command `node`, args `<path>/dist/server.js`.
- **Devin CLI**: `devin mcp add app-factory -- node <path>/dist/server.js`
- **Claude Desktop / others**: add the same command/args to their MCP config.

Notes for headless/VM environments (like Devin's workspace): set `APP_FACTORY_NO_BROWSER=1` so
`launch_design_gallery` serves the page without trying to open a browser (fetch the URL or use
`set_design_choice` as the no-UI fallback), and set `GITHUB_TOKEN` for higher `search_github` rate
limits. The brain, goals and lessons live in the data dir, so the same project can be advanced from
Cursor one day and Devin the next.

## Optional audit tools

The audit uses what it finds and skips the rest gracefully:

- `gitleaks` - deeper secret scanning (built-in regex scan is the fallback)
- `osv-scanner` - dependency CVEs (npm audit is the fallback)
- `semgrep` - static security analysis (`pip install semgrep`)
- Lighthouse - runs via `npx lighthouse` when you pass a running app `url`

## Development

```bash
npm run build   # compile TypeScript
npm test        # unit tests (store, lessons, goals, compaction, design catalog, gallery html)
npm run smoke   # end-to-end test of the whole workflow over real stdio MCP
```

CI runs build + unit tests + smoke on Ubuntu and Windows, Node 22 and 24, for every push and PR.

Layout:

- `src/server.ts` - MCP entry point
- `src/state/` - SQLite store (projects, memory, answers, choices, packages, audits) + checklist loader
- `src/phases/` - one module per workflow phase (tools live here)
- `src/gallery/` - the design gallery: option data, HTML renderer, local HTTP server
- `src/audit/` - audit runners and scoring
- `checklists/` - the "everything an app needs" knowledge base (edit to extend the interview/audit)
- `templates/` - scaffold guides per target (nextjs-pwa, expo, tauri, docker)
