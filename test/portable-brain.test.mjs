import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.APP_FACTORY_DATA_DIR = mkdtempSync(join(tmpdir(), "appfactory-pb-"));
const store = await import("../dist/state/store.js");
const brain = await import("../dist/portable-brain/index.js");

test("init + sync writes AGENTS.md and .app-factory brain files", () => {
  const ws = mkdtempSync(join(tmpdir(), "pb-ws-"));
  const p = store.createProject("pb-app", "Build a portable brain demo", ws);

  const result = brain.initPortableBrain(p.id);
  assert.equal(result.workspacePath, ws);
  assert.ok(existsSync(join(ws, "AGENTS.md")));
  assert.ok(existsSync(join(ws, "CLAUDE.md")));
  assert.ok(existsSync(join(ws, ".app-factory", "BRAIN.md")));
  assert.ok(existsSync(join(ws, ".app-factory", "state.json")));
  assert.ok(existsSync(join(ws, ".app-factory", "journal.jsonl")));
  assert.ok(existsSync(join(ws, ".app-factory", "decisions.md")));
  assert.ok(existsSync(join(ws, ".app-factory", "open-problems.md")));

  const state = JSON.parse(readFileSync(join(ws, ".app-factory", "state.json"), "utf8"));
  assert.equal(state.projectId, p.id);
  assert.equal(state.phase, "intake");
  assert.match(state.nextStep, /enhance_prompt/);
  assert.match(readFileSync(join(ws, "AGENTS.md"), "utf8"), /portable project brain/i);
  assert.match(readFileSync(join(ws, ".app-factory", "BRAIN.md"), "utf8"), /What to do next/);
});

test("sync is idempotent and updates on progress", () => {
  const ws = mkdtempSync(join(tmpdir(), "pb-ws2-"));
  const p = store.createProject("pb-progress", "Progress test", ws);
  brain.initPortableBrain(p.id);

  const first = brain.syncPortableBrain(p.id);
  const second = brain.syncPortableBrain(p.id);
  assert.equal(second.files.length, 0, "unchanged sync writes nothing");

  store.setPhase(p.id, "build");
  store.logEvent(p.id, "decision", "db", "chose sqlite for local demos");
  store.logEvent(p.id, "problem", "ci", "windows path separators break a script");
  const third = brain.syncPortableBrain(p.id);
  assert.ok(third.files.length > 0, "phase/event changes rewrite files");

  const state = JSON.parse(readFileSync(join(ws, ".app-factory", "state.json"), "utf8"));
  assert.equal(state.phase, "build");
  assert.ok(state.decisions.some((d) => d.name === "db"));
  assert.ok(state.openProblems.some((d) => d.name === "ci"));
  assert.match(readFileSync(join(ws, ".app-factory", "decisions.md"), "utf8"), /chose sqlite/);
  assert.match(readFileSync(join(ws, ".app-factory", "open-problems.md"), "utf8"), /windows path/);

  const journal = readFileSync(join(ws, ".app-factory", "journal.jsonl"), "utf8");
  assert.match(journal, /"kind":"decision"/);
  assert.match(journal, /"kind":"problem"/);

  // Re-sync should not duplicate journal ids
  brain.syncPortableBrain(p.id);
  const lines = readFileSync(join(ws, ".app-factory", "journal.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l).id);
  assert.equal(new Set(lines).size, lines.length, "journal ids unique");
  void first;
});

test("read_portable_brain returns disk snapshot", () => {
  const ws = mkdtempSync(join(tmpdir(), "pb-ws3-"));
  const p = store.createProject("pb-read", "Read test", ws);
  brain.initPortableBrain(p.id);
  store.logEvent(p.id, "milestone", "scaffold", "foundation done");
  brain.syncPortableBrain(p.id);

  const snap = brain.readPortableBrain({ projectId: p.id });
  assert.equal(snap.workspacePath, ws);
  assert.ok(snap.agentsMd?.includes("Agent handoff"));
  assert.ok(snap.brainMd?.includes("Project brain"));
  assert.equal(snap.state.projectId, p.id);
  assert.ok(snap.journalTail.some((j) => j.name === "scaffold"));

  const byPath = brain.readPortableBrain({ workspacePath: ws });
  assert.equal(byPath.state.name, "pb-read");
});

test("secret scrubbing keeps secrets out of brain files", () => {
  const ws = mkdtempSync(join(tmpdir(), "pb-ws4-"));
  const p = store.createProject("pb-secret", "Secret scrub test", ws);
  brain.initPortableBrain(p.id);
  store.logEvent(
    p.id,
    "note",
    "creds",
    "deploy failed with api_key=sk-abcdefghijklmnopqrstuvwxyz123456 and ghp_abcdefghijklmnopqrstuv",
  );
  store.remember("token", "super-secret-value-12345", "project", p.id);
  brain.syncPortableBrain(p.id);

  const brainMd = readFileSync(join(ws, ".app-factory", "BRAIN.md"), "utf8");
  const journal = readFileSync(join(ws, ".app-factory", "journal.jsonl"), "utf8");
  assert.doesNotMatch(brainMd, /sk-abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(journal, /ghp_abcdefghijklmnopqrstuv/);
  assert.match(journal, /REDACTED/);

  assert.equal(brain._test.scrubString("password=hunter2"), "password=[REDACTED]");
  assert.equal(brain._test.scrubUnknown({ api_key: "abc", ok: "fine" }).api_key, "[REDACTED]");
  assert.equal(brain._test.scrubUnknown({ api_key: "abc", ok: "fine" }).ok, "fine");
});

test("writePortableBrainEvent mirrors to store and disk", () => {
  const ws = mkdtempSync(join(tmpdir(), "pb-ws5-"));
  const p = store.createProject("pb-write", "Write test", ws);
  brain.initPortableBrain(p.id);
  const { journalLine, sync } = brain.writePortableBrainEvent(
    p.id,
    "decision",
    "stack",
    "use Next.js App Router",
  );
  assert.equal(journalLine.kind, "decision");
  assert.ok(sync?.files);
  const snap = brain.readPortableBrain({ projectId: p.id });
  assert.ok(snap.state.decisions.some((d) => d.name === "stack"));
});

test("sync returns null without workspacePath", () => {
  const p = store.createProject("no-ws", "no workspace");
  assert.equal(brain.syncPortableBrain(p.id), null);
  assert.equal(brain.trySyncPortableBrain(p.id), null);
  // init with explicit path attaches workspace
  const ws = mkdtempSync(join(tmpdir(), "pb-ws6-"));
  const init = brain.initPortableBrain(p.id, ws);
  assert.equal(init.workspacePath, ws);
  assert.equal(store.getProject(p.id).workspacePath, ws);
});

test("init is safe when workspace parent dirs missing", () => {
  const parent = mkdtempSync(join(tmpdir(), "pb-parent-"));
  const ws = join(parent, "nested", "app");
  // do not mkdir ws — init/sync should create it
  const p = store.createProject("nested-app", "nested", ws);
  brain.initPortableBrain(p.id);
  assert.ok(existsSync(join(ws, "AGENTS.md")));
  assert.ok(existsSync(join(ws, ".app-factory", "state.json")));
  void mkdirSync;
});
