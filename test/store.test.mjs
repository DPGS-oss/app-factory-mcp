import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate the database before the store module loads.
process.env.APP_FACTORY_DATA_DIR = mkdtempSync(join(tmpdir(), "appfactory-test-"));
const store = await import("../dist/state/store.js");

test("project lifecycle: create, get, list, phase transitions", () => {
  const p = store.createProject("unit-app", "a unit test app");
  assert.equal(p.phase, "intake");
  assert.equal(p.mode, "full");
  assert.equal(store.getProject(p.id).name, "unit-app");
  assert.ok(store.listProjects().some((x) => x.id === p.id));

  store.setPhase(p.id, "design");
  assert.equal(store.getProject(p.id).phase, "design");
  assert.equal(store.phaseAfter("design"), "blueprint");
  assert.equal(store.phaseAfter("done"), "done");

  const guard = store.requirePhase(store.getProject(p.id), ["build"]);
  assert.match(guard, /requires phase/);
  assert.equal(store.requirePhase(store.getProject(p.id), ["design"]), null);
});

test("memory: remember and recall with scopes", () => {
  const p = store.createProject("mem-app", "memory test");
  store.remember("fav-style", "dark-professional", "global");
  store.remember("db-choice", "postgres", "project", p.id);

  assert.ok(store.recall("fav-style").some((m) => m.value === "dark-professional"));
  assert.ok(store.recall(undefined, "project", p.id).some((m) => m.key === "db-choice"));
  // Overwrite on same key
  store.remember("fav-style", "player-dark", "global");
  const hits = store.recall("fav-style", "global");
  assert.equal(hits.filter((m) => m.key === "fav-style").length, 1);
  assert.equal(hits[0].value, "player-dark");
});

test("lessons: add, scope mixing, deactivate", () => {
  const p = store.createProject("lesson-app", "lesson test");
  const globalLesson = store.addLesson(null, "windows-shell", "Use taskkill for process trees", "test_app events");
  const projLesson = store.addLesson(p.id, "user-prefs", "User prefers dark styles", "design choices");

  const forProject = store.getLessons(p.id);
  assert.ok(forProject.some((l) => l.id === globalLesson.id), "global lessons visible to projects");
  assert.ok(forProject.some((l) => l.id === projLesson.id));

  assert.equal(store.deactivateLesson(projLesson.id), true);
  assert.ok(!store.getLessons(p.id).some((l) => l.id === projLesson.id), "deactivated lesson hidden");
  assert.ok(
    store.getLessons(p.id, true).some((l) => l.id === projLesson.id),
    "still visible when includeInactive",
  );
});

test("goals: set, progress, status transitions", () => {
  const p = store.createProject("goal-app", "goal test");
  const g = store.setGoal(p.id, "Ship it", "audit >= 80 and deployed");
  assert.equal(g.status, "active");

  const updated = store.updateGoal(g.id, "3 of 5 packages done");
  assert.equal(updated.progress, "3 of 5 packages done");
  assert.equal(updated.status, "active");

  const done = store.updateGoal(g.id, undefined, "done");
  assert.equal(done.status, "done");
  assert.equal(done.progress, "3 of 5 packages done", "progress preserved on status change");

  assert.equal(store.getGoals(p.id, "active").length, 0);
  assert.equal(store.getGoals(p.id).length, 1);
  assert.equal(store.updateGoal(99999), null);
});

test("events: journal and automatic compaction", () => {
  const p = store.createProject("event-app", "event test");
  store.logEvent(p.id, "decision", "db-choice", "chose sqlite");
  store.logEvent(p.id, "problem", "flaky-test", "timer test flakes");

  // Push past the compaction threshold (300 tool events).
  for (let i = 0; i < 320; i++) {
    store.logEvent(p.id, "tool", `tool_${i % 7}`, `{"i":${i}}${i % 50 === 0 ? " -> ERROR" : " -> ok"}`);
  }

  const events = store.getEvents(p.id, 500);
  const digests = events.filter((e) => e.kind === "digest");
  const tools = events.filter((e) => e.kind === "tool");
  assert.ok(digests.length >= 1, "a digest event was created");
  assert.ok(tools.length < 320, "old tool events were compacted away");
  assert.match(digests[0].detail, /Digest of \d+ tool calls/);
  assert.match(digests[0].detail, /Errors/);
  // Manual entries survive compaction.
  assert.ok(events.some((e) => e.kind === "decision" && e.name === "db-choice"));
  assert.ok(events.some((e) => e.kind === "problem" && e.name === "flaky-test"));
});

test("design choices and work packages round-trip", () => {
  const p = store.createProject("dc-app", "design choice test");
  store.saveDesignChoice(p.id, "uiStyle", "clean-minimal", { name: "Clean Minimal" });
  store.saveDesignChoice(p.id, "colors", "custom", { primary: "#22d3ee", gradient: true });
  const choices = store.getDesignChoices(p.id);
  assert.equal(choices.length, 2);
  assert.equal(choices.find((c) => c.category === "colors").choice.primary, "#22d3ee");

  store.saveWorkPackage(p.id, "frontend", "Frontend", { instructions: ["build ui"] });
  store.updateWorkPackage(p.id, "frontend", "done", "finished");
  const pkg = store.getWorkPackages(p.id)[0];
  assert.equal(pkg.status, "done");
  assert.equal(pkg.summary, "finished");
});

test("audits round-trip", () => {
  const p = store.createProject("audit-app", "audit test");
  store.saveAudit(p.id, 85, { passed: true, checks: [] });
  const audits = store.getAudits(p.id);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].score, 85);
  assert.equal(audits[0].report.passed, true);
});
