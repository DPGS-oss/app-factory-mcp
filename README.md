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

1. **Intake** - `start_project` + `enhance_prompt`: your description becomes a production-grade
   master prompt (goal, flows, non-goals, acceptance criteria, architecture sketch, threat model
   lite, UX principles, success metrics) plus a gap list against the checklist, with prior lessons
   injected when relevant.
2. **Interview** - `get_next_questions` / `record_answer`: a checklist-driven planning interview
   (auth, data, UX empty/loading/error states, migrations, rate limits, observability, payments,
   offline, accessibility, legal, deployment...). Core questions are always asked; others appear
   only when relevant.
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
4. **Blueprint** - `generate_blueprint`: design choices become a precise `designImplementation`
   (tokens, component rules, a11y, motion budget) and parallelizable work packages (foundation,
   frontend, backend, tests, polish) with `ownsPaths` / `mustNotTouch`, contracts-first foundation,
   and verifiable done criteria. Scaffold targets: Next.js PWA, Expo, Tauri, Docker.
5. **Build** - `get_work_package` / `report_package_done` coordinate subagents; ranked lessons are
   binding rules in every package spec.
6. **Audit** - `run_audit`: typecheck, lint, tests, dependency vulnerability scan, secret scan,
   semgrep (if installed) and Lighthouse (if given a running URL). Fix **root causes** (not
   suppresses); failed audits journal `audit-failed` and recovery journals a `refine-candidate`.
   Gate: score >= configurable `minScore` (default 80) with zero critical findings.
7. **Deploy** - `get_deploy_options` / `deploy`: Vercel, Netlify, Docker, local, Expo EAS or Tauri
   bundles. Failures journal `deploy-failed`; success nudges `refine` + preference memory.

Plus:

- **The brain** - every tool call is journaled automatically; the agent records decisions, problems
  and milestones with `log_event`, and `get_context` reconstructs what is happening, what has
  happened and what to do next - across sessions. Long journals are compacted automatically into
  digest entries so recaps stay sharp on big projects.
- **Portable brain (handoff across agents)** - each app with a `workspacePath` also gets an in-repo
  brain (`AGENTS.md`, `CLAUDE.md`, `.app-factory/BRAIN.md`, `state.json`, `journal.jsonl`, …) so
  Cursor, Claude Code, Codex, Devin, or any agent can resume mid-stream **without** App Factory MCP.
  Synced automatically on major tools; also `init_portable_brain` / `sync_portable_brain` /
  `read_portable_brain` / `write_portable_brain`.
- **Self-improvement** - `refine` reviews the journal (errors, open problems, failed audits, deploy
  failures, repeated/error-prone tools) with an explicit quality bar and anti-patterns. Near-
  duplicate lessons are rejected. Surviving lessons are **ranked by relevance** and injected into
  `get_context`, `get_project_state`, work packages, and the portable brain (`BRAIN.md`), so
  behavior actually changes. Server instructions steer every host agent into this loop by default.
- **Self-evolution (gated)** - App Factory can improve its own codebase from what it learns in use.
  A tool that keeps failing is automatically flagged as a `self-improvement-candidate` in the
  journal. The agent files a proposal (`propose_self_improvement`) with evidence, and then the gate
  applies: the proposal must be justified **twice** (`justify_self_improvement`) with *independent*
  reasoning - near-duplicate justifications are rejected by a similarity check, and the second
  justification must include measured evidence. Only then does `apply_self_improvement` unlock, and
  the final `commit_self_improvement` re-runs build + unit tests + smoke itself and refuses to git
  commit/push unless everything passes - "definite improvement" is enforced by the machine, not
  claimed by the agent. Weak proposals get `reject_self_improvement`, with the reasoning preserved.
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
limits. The SQLite brain, goals and lessons live in the data dir, so the same project can be
advanced from Cursor one day and Devin the next. The **portable brain** in the app repo is the
handoff layer when MCP is unavailable (see below).

## Portable brain / handoff across agents

When a project has a `workspacePath` (set on `start_project`, `import_app`, `generate_blueprint`,
or `init_portable_brain`), App Factory keeps a durable, AI-readable context store **inside the app
repo**:

```
<app>/
  AGENTS.md                 # entrypoint: how to resume
  CLAUDE.md                 # Claude Code pointer (same brain)
  .app-factory/
    BRAIN.md                # always-current narrative recap
    state.json              # machine-readable state
    journal.jsonl           # append-only event log
    decisions.md            # decisions made
    open-problems.md        # unresolved issues
```

Secrets are scrubbed before write. Sync is idempotent and runs automatically after start/import,
answers, design choices, blueprint/build progress, audits, goals, refine, and `log_event`.
`state.json` includes **`lessonsRanked`** (id, scope, relevance, rankReason) and
`lessonsLearned` (formatted lines); `AGENTS.md` / `BRAIN.md` surface the top ranked lessons
prominently so outside agents obey the same binding rules as `get_context`.

| Agent | How it picks up |
|-------|-----------------|
| **Cursor** | Opens `AGENTS.md` / `.app-factory/BRAIN.md` (agents often auto-read `AGENTS.md`). With MCP: `get_context` + auto-sync. |
| **Claude Code** | Reads `CLAUDE.md` and `AGENTS.md` at session start; follow links into `.app-factory/`. |
| **Codex** | Start from `AGENTS.md` then `BRAIN.md` + `state.json`; append journal lines when deciding/fixing. |
| **Devin** | Same files in the workspace; with MCP configured, prefer `get_context` / `sync_portable_brain`. |

Explicit tools: `init_portable_brain`, `sync_portable_brain`, `read_portable_brain`,
`write_portable_brain`. Outside agents without MCP can still continue from disk alone.

## Optional audit tools

The audit uses what it finds and skips the rest gracefully:

- `gitleaks` - deeper secret scanning (built-in regex scan is the fallback)
- `osv-scanner` - dependency CVEs (npm audit is the fallback)
- `semgrep` - static security analysis (`pip install semgrep`)
- Lighthouse - runs via `npx lighthouse` when you pass a running app `url`

## Development

```bash
npm run build   # compile TypeScript
npm test        # unit tests (store, lessons ranking, evolve gate, portable brain, blueprint quality, catalog)
npm run smoke   # end-to-end test of the whole workflow over real stdio MCP
```

CI runs build + unit tests + smoke on Ubuntu and Windows, Node 22 and 24, for every push and PR.

Layout:

- `src/server.ts` - MCP entry point
- `src/state/` - SQLite store (projects, memory, answers, choices, packages, audits) + checklist loader
- `src/portable-brain/` - in-repo AGENTS.md / `.app-factory/*` writer for cross-agent handoff
- `src/learning/` - lesson ranking / refine quality helpers
- `src/phases/` - one module per workflow phase (tools live here)
- `src/learning/` - lesson ranking, quality bar, duplicate detection for the always-learning loop
- `src/portable-brain/` - in-repo AGENTS.md / `.app-factory` sync for cross-agent handoff
- `src/gallery/` - the design gallery: option data, HTML renderer, local HTTP server
- `src/audit/` - audit runners and scoring
- `checklists/` - the "everything an app needs" knowledge base (edit to extend the interview/audit)
- `templates/` - scaffold guides per target (nextjs-pwa, expo, tauri, docker)
