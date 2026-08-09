import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.APP_FACTORY_DATA_DIR ??= mkdtempSync(join(tmpdir(), "appfactory-test-"));
const store = await import("../dist/state/store.js");
const blueprint = await import("../dist/phases/blueprint.js");

test("designImplementationSpec exposes tokens, a11y, motion budget", () => {
  const spec = blueprint.designImplementationSpec([
    {
      category: "uiStyle",
      choiceId: "linear",
      choice: {
        id: "linear",
        vars: { bg: "#fff", surface: "#f8f8f8", text: "#111", muted: "#666", accent: "#5e6ad2", border: "#ddd", radius: "8px" },
        guidance: "clean dense UI",
      },
    },
    {
      category: "animation",
      choiceId: "subtle",
      choice: { id: "subtle", guidance: "short transitions" },
    },
    {
      category: "fontPairing",
      choiceId: "inter-pair",
      choice: { heading: "Inter", body: "Inter" },
    },
  ]);
  assert.equal(spec.tokens.cssVariables["--accent"], "#5e6ad2");
  assert.ok(Array.isArray(spec.a11y) && spec.a11y.length >= 3);
  assert.match(String(spec.motionBudget), /150ms|Motion budget/i);
  assert.ok(Array.isArray(spec.emptyLoadingError));
});

test("buildPackages: foundation owns contracts; parallel packages have disjoint mustNotTouch", () => {
  const p = store.createProject("bp-quality", "A notes app with login for teams");
  store.recordAnswer(p.id, "platforms.targets", "Where should this run?", "responsive web app / PWA");
  store.recordAnswer(p.id, "deployment.target", "Deploy?", "Vercel");
  store.recordAnswer(p.id, "auth.needed", "Accounts?", "email+password login");
  store.recordAnswer(p.id, "features.must", "Must have?", "create and list notes");

  const pkgs = blueprint.buildPackages(store.getProject(p.id), ["nextjs-pwa"]);
  const byId = Object.fromEntries(pkgs.map((x) => [x.packageId, x]));
  assert.ok(byId.foundation);
  assert.equal(byId.foundation.parallelGroup, 0);
  assert.ok(byId.foundation.instructions.some((i) => /CONTRACTS FIRST/i.test(i)));
  assert.ok(byId.foundation.ownsPaths.some((p) => /contracts/.test(p)));
  assert.ok(byId.foundation.doneCriteria.some((d) => /env\.ts/.test(d)));

  assert.equal(byId.frontend.parallelGroup, 1);
  assert.equal(byId.backend.parallelGroup, 1);
  assert.ok(byId.frontend.mustNotTouch.some((p) => /api/.test(p)));
  assert.ok(byId.backend.mustNotTouch.some((p) => /components/.test(p)));
  assert.ok(byId.frontend.instructions.some((i) => /empty|loading|error/i.test(i)));
  assert.ok(byId.backend.instructions.some((i) => /Rate-limit/i.test(i)));
});
