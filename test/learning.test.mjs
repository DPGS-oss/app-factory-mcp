import { test } from "node:test";
import assert from "node:assert/strict";

const learning = await import("../dist/learning/lessons.js");

test("rankLessons: topical and global lessons rank above unrelated ones", () => {
  const lessons = [
    {
      id: 1,
      projectId: "p1",
      topic: "css",
      lesson: "Always use design tokens for colors",
      evidence: "audit contrast",
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 2,
      projectId: null,
      topic: "windows-shell",
      lesson: "When killing process trees on Windows, use taskkill /T /F because SIGKILL leaves orphans",
      evidence: "test_app failed thrice",
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 3,
      projectId: "p1",
      topic: "deploy-vercel",
      lesson: "When Vercel deploy fails on env, set vars in project settings before retrying",
      evidence: "deploy-failed event",
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const ranked = learning.rankLessons(lessons, "deploy vercel windows env audit", 10);
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].topic, "deploy-vercel", "deploy context should rank deploy lesson first");
  assert.ok(ranked.some((l) => l.scope === "global"));
});

test("isDuplicateLesson rejects near-paraphrases", () => {
  const existing = [
    { lesson: "When audit fails on missing CSP, add security headers in next.config before re-running" },
  ];
  const dup = learning.isDuplicateLesson(
    "When the audit fails because CSP is missing, add security headers in next.config then re-run",
    existing,
  );
  assert.equal(dup.duplicate, true);

  const fresh = learning.isDuplicateLesson(
    "When Playwright hangs on Windows CI, use headed:false and increase navigationTimeout",
    existing,
  );
  assert.equal(fresh.duplicate, false);
});

test("portableBrainSyncHint enables when workspacePath is set", () => {
  const off = learning.portableBrainSyncHint(null);
  assert.equal(off.enabled, false);
  const on = learning.portableBrainSyncHint("C:\\apps\\recipe");
  assert.equal(on.enabled, true);
  assert.ok(on.targetFiles.some((f) => f.includes("AGENTS.md")));
  assert.ok(on.targetFiles.some((f) => f.includes("CLAUDE.md")));
  assert.ok(on.targetFiles.some((f) => f.includes(".app-factory")));
});

test("formatRankedLessons includes relevance markers", () => {
  const lines = learning.formatRankedLessons([
    {
      id: 1,
      topic: "auth",
      lesson: "Rate-limit login",
      evidence: "x",
      scope: "global",
      relevance: 0.9,
      rankReason: "global",
    },
  ]);
  assert.match(lines[0], /rel=0\.9/);
  assert.match(lines[0], /auth/);
});
