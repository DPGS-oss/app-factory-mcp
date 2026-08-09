import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const PHASES = [
  "intake",
  "interview",
  "design",
  "blueprint",
  "build",
  "audit",
  "deploy",
  "done",
] as const;

export type Phase = (typeof PHASES)[number];

export interface Project {
  id: string;
  name: string;
  description: string;
  workspacePath: string | null;
  phase: Phase;
  mode: "full" | "instant" | "maintain";
  createdAt: string;
  updatedAt: string;
}

export interface Answer {
  questionId: string;
  question: string;
  answer: string;
}

export interface DesignChoice {
  category: string;
  choiceId: string;
  choice: Record<string, unknown>;
}

export interface WorkPackage {
  packageId: string;
  title: string;
  status: "pending" | "in_progress" | "done";
  spec: Record<string, unknown>;
  summary: string | null;
}

export interface AuditRecord {
  id: number;
  projectId: string;
  createdAt: string;
  score: number;
  report: Record<string, unknown>;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
// dist/state -> repo root is two levels up
const repoRoot = join(moduleDir, "..", "..");
const dataDir = process.env.APP_FACTORY_DATA_DIR ?? join(repoRoot, "data");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(join(dataDir, "appfactory.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      workspace_path TEXT,
      phase TEXT NOT NULL DEFAULT 'intake',
      mode TEXT NOT NULL DEFAULT 'full',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory (
      scope TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, project_id, key)
    );
    CREATE TABLE IF NOT EXISTS answers (
      project_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS design_choices (
      project_id TEXT NOT NULL,
      category TEXT NOT NULL,
      choice_id TEXT NOT NULL,
      choice_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, category)
    );
    CREATE TABLE IF NOT EXISTS work_packages (
      project_id TEXT NOT NULL,
      package_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      spec_json TEXT NOT NULL,
      summary TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, package_id)
    );
    CREATE TABLE IF NOT EXISTS audits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      score REAL NOT NULL,
      report_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, id);
  `);
  return db;
}

function now(): string {
  return new Date().toISOString();
}

// ---------- projects ----------

export function createProject(
  name: string,
  description: string,
  workspacePath?: string,
  mode: "full" | "instant" | "maintain" = "full",
): Project {
  const d = getDb();
  const id = randomUUID().slice(0, 8);
  const ts = now();
  d.prepare(
    `INSERT INTO projects (id, name, description, workspace_path, phase, mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'intake', ?, ?, ?)`,
  ).run(id, name, description, workspacePath ?? null, mode, ts, ts);
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const row = getDb()
    .prepare(`SELECT * FROM projects WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : null;
}

export function listProjects(): Project[] {
  const rows = getDb()
    .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToProject);
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    workspacePath: (row.workspace_path as string) ?? null,
    phase: row.phase as Phase,
    mode: row.mode as Project["mode"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function setPhase(projectId: string, phase: Phase): void {
  getDb()
    .prepare(`UPDATE projects SET phase = ?, updated_at = ? WHERE id = ?`)
    .run(phase, now(), projectId);
}

export function setWorkspacePath(projectId: string, workspacePath: string): void {
  getDb()
    .prepare(`UPDATE projects SET workspace_path = ?, updated_at = ? WHERE id = ?`)
    .run(workspacePath, now(), projectId);
}

/**
 * Guard used by phase tools. Returns an error string when the project is not
 * in one of the allowed phases, so the agent gets steered back on track
 * instead of skipping planning.
 */
export function requirePhase(project: Project, allowed: Phase[]): string | null {
  if (allowed.includes(project.phase)) return null;
  return (
    `Project "${project.name}" (${project.id}) is in phase "${project.phase}", but this tool requires phase ` +
    `${allowed.map((p) => `"${p}"`).join(" or ")}. ` +
    `Follow the workflow in order: ${PHASES.join(" -> ")}. ` +
    `Use get_project_state to see what to do next.`
  );
}

export function phaseAfter(phase: Phase): Phase {
  const i = PHASES.indexOf(phase);
  return PHASES[Math.min(i + 1, PHASES.length - 1)];
}

// ---------- memory ----------

export function remember(
  key: string,
  value: string,
  scope: "global" | "project",
  projectId?: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO memory (scope, project_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(scope, project_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(scope, scope === "project" ? (projectId ?? "") : "", key, value, now());
}

export function recall(
  query?: string,
  scope?: "global" | "project",
  projectId?: string,
): { scope: string; projectId: string; key: string; value: string; updatedAt: string }[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (scope) {
    clauses.push(`scope = ?`);
    params.push(scope);
    if (scope === "project" && projectId) {
      clauses.push(`project_id = ?`);
      params.push(projectId);
    }
  }
  if (query) {
    clauses.push(`(key LIKE ? OR value LIKE ?)`);
    params.push(`%${query}%`, `%${query}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM memory ${where} ORDER BY updated_at DESC LIMIT 50`)
    .all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    scope: r.scope as string,
    projectId: r.project_id as string,
    key: r.key as string,
    value: r.value as string,
    updatedAt: r.updated_at as string,
  }));
}

// ---------- answers ----------

export function recordAnswer(
  projectId: string,
  questionId: string,
  question: string,
  answer: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO answers (project_id, question_id, question, answer, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, question_id) DO UPDATE SET question = excluded.question, answer = excluded.answer, updated_at = excluded.updated_at`,
    )
    .run(projectId, questionId, question, answer, now());
}

export function getAnswers(projectId: string): Answer[] {
  const rows = getDb()
    .prepare(`SELECT * FROM answers WHERE project_id = ? ORDER BY updated_at ASC`)
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    questionId: r.question_id as string,
    question: r.question as string,
    answer: r.answer as string,
  }));
}

// ---------- design choices ----------

export function saveDesignChoice(
  projectId: string,
  category: string,
  choiceId: string,
  choice: Record<string, unknown>,
): void {
  getDb()
    .prepare(
      `INSERT INTO design_choices (project_id, category, choice_id, choice_json, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, category) DO UPDATE SET choice_id = excluded.choice_id, choice_json = excluded.choice_json, updated_at = excluded.updated_at`,
    )
    .run(projectId, category, choiceId, JSON.stringify(choice), now());
}

export function getDesignChoices(projectId: string): DesignChoice[] {
  const rows = getDb()
    .prepare(`SELECT * FROM design_choices WHERE project_id = ?`)
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    category: r.category as string,
    choiceId: r.choice_id as string,
    choice: JSON.parse(r.choice_json as string) as Record<string, unknown>,
  }));
}

// ---------- work packages ----------

export function saveWorkPackage(
  projectId: string,
  packageId: string,
  title: string,
  spec: Record<string, unknown>,
): void {
  getDb()
    .prepare(
      `INSERT INTO work_packages (project_id, package_id, title, status, spec_json, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(project_id, package_id) DO UPDATE SET title = excluded.title, spec_json = excluded.spec_json, updated_at = excluded.updated_at`,
    )
    .run(projectId, packageId, title, JSON.stringify(spec), now());
}

export function getWorkPackages(projectId: string): WorkPackage[] {
  const rows = getDb()
    .prepare(`SELECT * FROM work_packages WHERE project_id = ?`)
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    packageId: r.package_id as string,
    title: r.title as string,
    status: r.status as WorkPackage["status"],
    spec: JSON.parse(r.spec_json as string) as Record<string, unknown>,
    summary: (r.summary as string) ?? null,
  }));
}

export function updateWorkPackage(
  projectId: string,
  packageId: string,
  status: WorkPackage["status"],
  summary?: string,
): void {
  getDb()
    .prepare(
      `UPDATE work_packages SET status = ?, summary = COALESCE(?, summary), updated_at = ? WHERE project_id = ? AND package_id = ?`,
    )
    .run(status, summary ?? null, now(), projectId, packageId);
}

// ---------- events (the brain's journal) ----------

export interface EventRecord {
  id: number;
  projectId: string | null;
  kind: "tool" | "note" | "decision" | "problem" | "milestone";
  name: string;
  detail: string;
  createdAt: string;
}

export function logEvent(
  projectId: string | null,
  kind: EventRecord["kind"],
  name: string,
  detail: string,
): void {
  getDb()
    .prepare(`INSERT INTO events (project_id, kind, name, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(projectId, kind, name, detail.slice(0, 2000), now());
}

export function getEvents(projectId?: string, limit = 100): EventRecord[] {
  const rows = (
    projectId
      ? getDb().prepare(`SELECT * FROM events WHERE project_id = ? ORDER BY id DESC LIMIT ?`).all(projectId, limit)
      : getDb().prepare(`SELECT * FROM events ORDER BY id DESC LIMIT ?`).all(limit)
  ) as Record<string, unknown>[];
  return rows.reverse().map((r) => ({
    id: r.id as number,
    projectId: (r.project_id as string) ?? null,
    kind: r.kind as EventRecord["kind"],
    name: r.name as string,
    detail: r.detail as string,
    createdAt: r.created_at as string,
  }));
}

// ---------- audits ----------

export function saveAudit(projectId: string, score: number, report: Record<string, unknown>): void {
  getDb()
    .prepare(`INSERT INTO audits (project_id, created_at, score, report_json) VALUES (?, ?, ?, ?)`)
    .run(projectId, now(), score, JSON.stringify(report));
}

export function getAudits(projectId: string): AuditRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM audits WHERE project_id = ? ORDER BY id DESC`)
    .all(projectId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    projectId: r.project_id as string,
    createdAt: r.created_at as string,
    score: r.score as number,
    report: JSON.parse(r.report_json as string) as Record<string, unknown>,
  }));
}

export { repoRoot, dataDir };
