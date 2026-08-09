import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.APP_FACTORY_DATA_DIR ??= mkdtempSync(join(tmpdir(), "appfactory-test-"));
const store = await import("../dist/state/store.js");
const { similarity } = await import("../dist/phases/evolve.js");

test("proposal state machine: proposed -> justified-once -> justified-twice -> rejected", () => {
  const p = store.addProposal("test-title", "test-problem", "test-change", "test-evidence");
  assert.equal(p.status, "proposed");
  assert.equal(p.justification1, null);

  const once = store.updateProposal(p.id, { justification1: "first reasoning", status: "justified-once" });
  assert.equal(once.status, "justified-once");
  assert.equal(once.justification1, "first reasoning");

  const twice = store.updateProposal(p.id, {
    justification2: "second reasoning",
    measuredEvidence: "5 errors in journal",
    status: "justified-twice",
  });
  assert.equal(twice.status, "justified-twice");
  assert.equal(twice.measuredEvidence, "5 errors in journal");

  const rejected = store.updateProposal(p.id, { status: "rejected", verification: '{"rejectedBecause":"test"}' });
  assert.equal(rejected.status, "rejected");

  assert.ok(store.listProposals("rejected").some((x) => x.id === p.id));
  assert.ok(!store.listProposals("proposed").some((x) => x.id === p.id));
  assert.equal(store.updateProposal(99999, { status: "rejected" }), null);
  assert.equal(store.getProposal(99999), null);
});

test("similarity: catches paraphrases, passes independent reasoning", () => {
  assert.ok(similarity("the quick brown fox jumps", "the quick brown fox jumps") > 0.99, "identical text");
  assert.ok(
    similarity(
      "the npm audit parser fails because output contains warnings before the json starts",
      "npm audit parser output fails: json starts after the warnings it contains",
    ) > 0.6,
    "paraphrase should score high",
  );
  assert.ok(
    similarity(
      "the npm audit parser fails because output contains warnings before the json starts",
      "measured over ten runs, twelve minutes were wasted on retries; a regression test would prevent recurrence entirely",
    ) < 0.2,
    "independent reasoning should score low",
  );
  assert.equal(similarity("", "anything here at all"), 1, "empty text is treated as duplicate");
});
