import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import * as store from "../state/store.js";
import { nextStep } from "../phases/guidance.js";
import { rankLessons } from "../learning/lessons.js";

export const BRAIN_DIR = ".app-factory";
export const BRAIN_VERSION = 1 as const;

/** Object/key names that should never be persisted into the portable brain. */
const SENSITIVE_KEY = /^(api[_-]?key|secret|password|passwd|token|auth|bearer|authorization|private[_-]?key|access[_-]?key|client[_-]?secret|connectionstring)$/i;

/** Token-shaped and assignment patterns redacted inside free text. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(sk|pk|rk|whsec)[-_][a-zA-Z0-9]{16,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\b-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /\b(api[_-]?key|password|passwd|secret|token|bearer|authorization|private[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*['"]?[^\s'"]{6,}/gi,
  /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*['"]?[^\s'"]{8,}/g,
];

const REDACTED = "[REDACTED]";

export interface PortableBrainState {
  version: typeof BRAIN_VERSION;
  projectId: string;
  name: string;
  description: string;
  phase: store.Phase;
  mode: store.Project["mode"];
  workspacePath: string;
  nextStep: string;
  updatedAt: string;
  lastSyncedEventId: number;
  answers: store.Answer[];
  designChoices: store.DesignChoice[];
  workPackages: Array<{
    packageId: string;
    title: string;
    status: store.WorkPackage["status"];
    summary: string | null;
  }>;
  recentAudits: Array<{ id: number; score: number; createdAt: string; passed?: boolean }>;
  activeGoals: Array<{
    id: number;
    goal: string;
    successCriteria: string;
    status: string;
    progress: string;
  }>;
  lessons: Array<{ topic: string; lesson: string; evidence: string; relevance?: number }>;
  decisions: Array<{ name: string; detail: string; createdAt: string }>;
  openProblems: Array<{ name: string; detail: string; createdAt: string }>;
  recentActivity: Array<{ kind: string; name: string; detail: string; createdAt: string }>;
}

export interface JournalLine {
  id: number;
  kind: string;
  name: string;
  detail: string;
  createdAt: string;
  source: "app-factory" | "agent";
}

export interface SyncResult {
  workspacePath: string;
  files: string[];
  lastSyncedEventId: number;
  initialized: boolean;
}

export interface ReadResult {
  workspacePath: string;
  agentsMd: string | null;
  brainMd: string | null;
  state: PortableBrainState | null;
  decisionsMd: string | null;
  openProblemsMd: string | null;
  journalTail: JournalLine[];
}

function brainRoot(workspacePath: string): string {
  return join(workspacePath, BRAIN_DIR);
}

function scrubString(text: string): string {
  let out = text;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(re, (match) => {
      const sep = match.match(/[:=]/);
      if (sep) {
        const idx = match.indexOf(sep[0]);
        return match.slice(0, idx + 1) + REDACTED;
      }
      return REDACTED;
    });
  }
  return out;
}

function scrubUnknown<T>(value: T): T {
  if (typeof value === "string") return scrubString(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubUnknown(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubUnknown(v);
      }
    }
    return out as T;
  }
  return value;
}

/** Idempotent write: skip if contents identical (avoids needless mtime churn). */
function writeIfChanged(path: string, contents: string): boolean {
  try {
    if (existsSync(path) && readFileSync(path, "utf8") === contents) return false;
  } catch {
    /* rewrite */
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  return true;
}

function ensureBrainDir(workspacePath: string): void {
  mkdirSync(brainRoot(workspacePath), { recursive: true });
}

function readExistingState(workspacePath: string): PortableBrainState | null {
  const path = join(brainRoot(workspacePath), "state.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PortableBrainState;
  } catch {
    return null;
  }
}

function readJournalLines(workspacePath: string): JournalLine[] {
  const path = join(brainRoot(workspacePath), "journal.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  const out: JournalLine[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as JournalLine);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

function buildState(project: store.Project, workspacePath: string, lastSyncedEventId: number): PortableBrainState {
  const events = store.getEvents(project.id, 200);
  const decisions = events
    .filter((e) => e.kind === "decision")
    .map((e) => ({ name: e.name, detail: scrubString(e.detail), createdAt: e.createdAt }));
  const openProblems = events
    .filter((e) => e.kind === "problem")
    .map((e) => ({ name: e.name, detail: scrubString(e.detail), createdAt: e.createdAt }));
  const audits = store.getAudits(project.id).slice(0, 5);
  const packages = store.getWorkPackages(project.id);
  const lessonContext = [
    project.phase,
    project.description,
    ...packages.map((p) => `${p.packageId} ${p.title}`),
  ].join(" ");
  // Ranked so the most relevant lessons surface first in BRAIN.md for any agent.
  const lessons = rankLessons(store.getLessons(project.id), lessonContext, 20).map((l) => ({
    topic: l.topic,
    lesson: scrubString(l.lesson),
    evidence: scrubString(l.evidence),
    relevance: l.relevance,
  }));

  return scrubUnknown({
    version: BRAIN_VERSION,
    projectId: project.id,
    name: project.name,
    description: project.description,
    phase: project.phase,
    mode: project.mode,
    workspacePath,
    nextStep: nextStep(project),
    // Use project.updatedAt so identical syncs stay byte-identical (idempotent writes).
    updatedAt: project.updatedAt,
    lastSyncedEventId,
    answers: store.getAnswers(project.id),
    designChoices: store.getDesignChoices(project.id),
    workPackages: packages.map((w) => ({
      packageId: w.packageId,
      title: w.title,
      status: w.status,
      summary: w.summary,
    })),
    recentAudits: audits.map((a) => ({
      id: a.id,
      score: a.score,
      createdAt: a.createdAt,
      passed: a.score >= 80 && !(a.report as { critical?: number }).critical,
    })),
    activeGoals: store.getGoals(project.id, "active").map((g) => ({
      id: g.id,
      goal: g.goal,
      successCriteria: g.successCriteria,
      status: g.status,
      progress: g.progress,
    })),
    lessons,
    decisions,
    openProblems,
    recentActivity: events.slice(-40).map((e) => ({
      kind: e.kind,
      name: e.name,
      detail: scrubString(e.detail).slice(0, 300),
      createdAt: e.createdAt,
    })),
  });
}

function renderBrainMd(state: PortableBrainState): string {
  const wpLines = state.workPackages.length
    ? state.workPackages
        .map((w) => `- [${w.status}] **${w.packageId}** — ${w.title}${w.summary ? `: ${w.summary}` : ""}`)
        .join("\n")
    : "_No work packages yet._";
  const goals = state.activeGoals.length
    ? state.activeGoals
        .map(
          (g) =>
            `- **${g.goal}** (criteria: ${g.successCriteria})${g.progress ? ` — progress: ${g.progress}` : ""}`,
        )
        .join("\n")
    : "_No active goals._";
  const decisions = state.decisions.length
    ? state.decisions
        .slice(-15)
        .map((d) => `- **${d.name}**: ${d.detail}`)
        .join("\n")
    : "_No decisions recorded yet._";
  const problems = state.openProblems.length
    ? state.openProblems.map((p) => `- **${p.name}**: ${p.detail}`).join("\n")
    : "_No open problems._";
  const lessons = state.lessons.length
    ? state.lessons
        .map((l) =>
          l.relevance !== undefined
            ? `- **[${l.topic}|rel=${l.relevance}]** ${l.lesson}`
            : `- **[${l.topic}]** ${l.lesson}`,
        )
        .join("\n")
    : "_No lessons yet._";
  const design = state.designChoices.length
    ? state.designChoices.map((c) => `- **${c.category}**: ${c.choiceId}`).join("\n")
    : "_No design choices yet._";
  const activity = state.recentActivity.length
    ? state.recentActivity
        .slice(-20)
        .map((a) => `- \`${a.createdAt}\` (${a.kind}) **${a.name}**: ${a.detail}`)
        .join("\n")
    : "_No recent activity._";

  return `# Project brain — ${state.name}

> Auto-generated by App Factory. Safe for any coding agent (Cursor, Claude Code, Codex, Devin, etc.).
> Do **not** put secrets here. Prefer updating via App Factory tools when available; otherwise edit these files carefully.

## Goal

${state.description}

## Status

| Field | Value |
|------|-------|
| Project ID | \`${state.projectId}\` |
| Phase | **${state.phase}** |
| Mode | ${state.mode} |
| Updated | ${state.updatedAt} |

## What to do next

${state.nextStep}

## Active goals

${goals}

## Work packages

${wpLines}

## Design choices

${design}

## Decisions

${decisions}

## Open problems

${problems}

## Lessons

${lessons}

## Recent activity

${activity}

## Machine state

See \`.app-factory/state.json\` for structured data and \`.app-factory/journal.jsonl\` for the append-only event log.
`;
}

function renderAgentsMd(state: PortableBrainState): string {
  return `# Agent handoff — ${state.name}

This repo has a **portable project brain** so any coding agent can resume work without App Factory MCP.

## Start here

1. Read \`.app-factory/BRAIN.md\` — narrative recap (goal, phase, next step, decisions, problems).
2. Read \`.app-factory/state.json\` — machine-readable state.
3. Skim \`.app-factory/journal.jsonl\` (tail) — recent events.
4. Check \`.app-factory/decisions.md\` and \`.app-factory/open-problems.md\`.

## Current snapshot

- **Goal:** ${state.description.slice(0, 400)}${state.description.length > 400 ? "…" : ""}
- **Phase:** ${state.phase} (${state.mode})
- **Next:** ${state.nextStep}

## If App Factory MCP is available

Call \`get_context\` / \`get_project_state\` with projectId \`${state.projectId}\`, then \`sync_portable_brain\` after meaningful progress.

## If App Factory MCP is NOT available

Continue from **What to do next** in \`.app-factory/BRAIN.md\`. When you make a decision or hit a problem, append a line to \`.app-factory/journal.jsonl\` (JSON object with \`kind\`, \`name\`, \`detail\`, \`createdAt\`, \`source: "agent"\`) and update \`BRAIN.md\` / \`open-problems.md\` / \`decisions.md\` accordingly. Never write secrets into the brain.

## Also see

- \`CLAUDE.md\` — pointer for Claude Code (same brain).
`;
}

function renderClaudeMd(state: PortableBrainState): string {
  return `# ${state.name}

Claude Code / coding-agent entrypoint for this project.

**Read \`AGENTS.md\` and \`.app-factory/BRAIN.md\` before changing code.**

- Phase: ${state.phase}
- Next: ${state.nextStep}
- Structured state: \`.app-factory/state.json\`
- Journal: \`.app-factory/journal.jsonl\`

Do not commit secrets into \`.app-factory/\`.
`;
}

function renderDecisionsMd(state: PortableBrainState): string {
  const body = state.decisions.length
    ? state.decisions.map((d) => `## ${d.name}\n\n_${d.createdAt}_\n\n${d.detail}\n`).join("\n")
    : "_No decisions recorded yet._\n";
  return `# Decisions — ${state.name}\n\n${body}`;
}

function renderOpenProblemsMd(state: PortableBrainState): string {
  const body = state.openProblems.length
    ? state.openProblems.map((p) => `## ${p.name}\n\n_${p.createdAt}_\n\n${p.detail}\n`).join("\n")
    : "_No open problems._\n";
  return `# Open problems — ${state.name}\n\n${body}`;
}

function appendNewJournalEvents(
  workspacePath: string,
  projectId: string,
  afterId: number,
): { appended: number; lastId: number } {
  const events = store.getEvents(projectId, 500).filter((e) => e.id > afterId);
  const important = events.filter((e) =>
    ["decision", "problem", "milestone", "digest", "note"].includes(e.kind),
  );
  const tools = events.filter((e) => e.kind === "tool");
  const toolSample = tools.slice(-30);
  const toWrite = [...important, ...toolSample]
    .filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => a.id - b.id);

  const existing = new Set(readJournalLines(workspacePath).map((l) => l.id));
  const journalPath = join(brainRoot(workspacePath), "journal.jsonl");
  let appended = 0;
  let lastId = afterId;
  for (const e of toWrite) {
    if (existing.has(e.id)) {
      lastId = Math.max(lastId, e.id);
      continue;
    }
    const line: JournalLine = {
      id: e.id,
      kind: e.kind,
      name: e.name,
      detail: scrubString(e.detail),
      createdAt: e.createdAt,
      source: "app-factory",
    };
    appendFileSync(journalPath, JSON.stringify(line) + "\n", "utf8");
    appended++;
    lastId = Math.max(lastId, e.id);
  }
  const all = store.getEvents(projectId, 500);
  if (all.length) lastId = Math.max(lastId, all[all.length - 1].id);
  return { appended, lastId };
}

/**
 * Initialize portable brain files in an app workspace (idempotent).
 * Creates `.app-factory/` plus `AGENTS.md` / `CLAUDE.md` entrypoints.
 */
export function initPortableBrain(projectId: string, workspacePath?: string): SyncResult {
  const project = store.getProject(projectId);
  if (!project) throw new Error(`No project with id "${projectId}".`);
  const ws = workspacePath ?? project.workspacePath;
  if (!ws) throw new Error(`Project "${projectId}" has no workspacePath. Pass workspacePath to init.`);
  if (workspacePath && workspacePath !== project.workspacePath) {
    store.setWorkspacePath(projectId, workspacePath);
  }
  ensureBrainDir(ws);
  const journalPath = join(brainRoot(ws), "journal.jsonl");
  if (!existsSync(journalPath)) writeFileSync(journalPath, "", "utf8");
  return syncPortableBrain(projectId)!;
}

/**
 * Full sync of SQLite project state into the app's portable brain files.
 * Returns null when the project has no workspacePath.
 */
export function syncPortableBrain(projectId: string): SyncResult | null {
  const project = store.getProject(projectId);
  if (!project?.workspacePath) return null;
  const ws = project.workspacePath;
  ensureBrainDir(ws);

  const existing = readExistingState(ws);
  const journalPath = join(brainRoot(ws), "journal.jsonl");
  if (!existsSync(journalPath)) writeFileSync(journalPath, "", "utf8");

  const { lastId } = appendNewJournalEvents(ws, projectId, existing?.lastSyncedEventId ?? 0);
  const state = buildState(project, ws, lastId);

  const files: string[] = [];
  const writes: Array<[string, string]> = [
    [join(brainRoot(ws), "state.json"), JSON.stringify(state, null, 2) + "\n"],
    [join(brainRoot(ws), "BRAIN.md"), renderBrainMd(state)],
    [join(brainRoot(ws), "decisions.md"), renderDecisionsMd(state)],
    [join(brainRoot(ws), "open-problems.md"), renderOpenProblemsMd(state)],
    [join(ws, "AGENTS.md"), renderAgentsMd(state)],
    [join(ws, "CLAUDE.md"), renderClaudeMd(state)],
  ];
  for (const [path, contents] of writes) {
    if (writeIfChanged(path, contents)) files.push(path);
  }

  return {
    workspacePath: ws,
    files,
    lastSyncedEventId: lastId,
    initialized: !existing,
  };
}

/** Never-throwing sync for automatic hooks. */
export function trySyncPortableBrain(projectId: string | null | undefined): SyncResult | null {
  if (!projectId) return null;
  try {
    return syncPortableBrain(projectId);
  } catch {
    return null;
  }
}

/**
 * Append an agent-authored journal line and mirror into App Factory's SQLite journal.
 */
export function writePortableBrainEvent(
  projectId: string,
  kind: "note" | "decision" | "problem" | "milestone",
  name: string,
  detail: string,
  mirrorToStore = true,
): { journalLine: JournalLine; sync: SyncResult | null } {
  const project = store.getProject(projectId);
  if (!project) throw new Error(`No project with id "${projectId}".`);
  if (!project.workspacePath) throw new Error(`Project "${projectId}" has no workspacePath.`);

  if (mirrorToStore) store.logEvent(projectId, kind, name, detail);

  const events = store.getEvents(projectId, 5);
  const latest = events[events.length - 1];
  const line: JournalLine = {
    id: latest?.id ?? Date.now(),
    kind,
    name,
    detail: scrubString(detail),
    createdAt: latest?.createdAt ?? new Date().toISOString(),
    source: mirrorToStore ? "app-factory" : "agent",
  };

  ensureBrainDir(project.workspacePath);
  if (!mirrorToStore) {
    appendFileSync(
      join(brainRoot(project.workspacePath), "journal.jsonl"),
      JSON.stringify(line) + "\n",
      "utf8",
    );
  }
  const sync = syncPortableBrain(projectId);
  return { journalLine: line, sync };
}

/** Read portable brain files from a workspace (or from a project's workspacePath). */
export function readPortableBrain(opts: {
  projectId?: string;
  workspacePath?: string;
  journalLimit?: number;
}): ReadResult {
  let ws = opts.workspacePath;
  if (!ws && opts.projectId) {
    const p = store.getProject(opts.projectId);
    if (!p) throw new Error(`No project with id "${opts.projectId}".`);
    if (!p.workspacePath) throw new Error(`Project "${opts.projectId}" has no workspacePath.`);
    ws = p.workspacePath;
  }
  if (!ws) throw new Error("Provide projectId or workspacePath.");

  const root = brainRoot(ws);
  const safeRead = (path: string): string | null => {
    try {
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    } catch {
      return null;
    }
  };

  const stateRaw = safeRead(join(root, "state.json"));
  let state: PortableBrainState | null = null;
  if (stateRaw) {
    try {
      state = JSON.parse(stateRaw) as PortableBrainState;
    } catch {
      state = null;
    }
  }
  const journal = readJournalLines(ws);
  const limit = opts.journalLimit ?? 40;
  return {
    workspacePath: ws,
    agentsMd: safeRead(join(ws, "AGENTS.md")),
    brainMd: safeRead(join(root, "BRAIN.md")),
    state,
    decisionsMd: safeRead(join(root, "decisions.md")),
    openProblemsMd: safeRead(join(root, "open-problems.md")),
    journalTail: journal.slice(-limit),
  };
}

/** Tools that should refresh the portable brain after a successful call. */
export const PORTABLE_BRAIN_SYNC_TOOLS = new Set([
  "start_project",
  "instant_site",
  "import_app",
  "enhance_prompt",
  "record_answer",
  "set_design_choice",
  "generate_blueprint",
  "get_work_package",
  "report_package_done",
  "run_audit",
  "deploy",
  "log_event",
  "refine",
  "set_goal",
  "update_goal",
  "init_portable_brain",
  "sync_portable_brain",
  "write_portable_brain",
  "remember",
]);

export function resolveProjectIdForSync(
  toolName: string,
  args: Record<string, unknown>,
  resultText: string,
): string | null {
  if (typeof args.projectId === "string") return args.projectId;
  if (toolName === "update_goal" || toolName === "start_project" || toolName === "instant_site" || toolName === "import_app") {
    try {
      const parsed = JSON.parse(resultText) as {
        goal?: { projectId?: string };
        project?: { id?: string };
      };
      if (parsed.goal?.projectId) return parsed.goal.projectId;
      if (parsed.project?.id) return parsed.project.id;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Exported for unit tests */
export const _test = {
  scrubString,
  scrubUnknown,
  buildState,
  writeIfChanged,
  brainRoot,
  REDACTED,
};
