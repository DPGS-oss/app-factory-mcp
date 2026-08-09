import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.APP_FACTORY_DATA_DIR ??= mkdtempSync(join(tmpdir(), "appfactory-test-"));

const {
  UI_STYLES,
  FONT_PAIRINGS,
  ICON_SETS,
  ANIMATION_LEVELS,
  CARD_STYLES,
  BACKGROUNDS,
  DESIGN_CATEGORIES,
  OPTIONAL_CATEGORIES,
  findChoice,
  renderIcon,
} = await import("../dist/gallery/options.js");
const { loadChecklist, relevantCategories, verifyItems } = await import("../dist/state/checklist.js");
const { galleryHtml } = await import("../dist/gallery/html.js");

test("design catalog sizes and unique ids", () => {
  assert.equal(UI_STYLES.length, 16);
  assert.equal(FONT_PAIRINGS.length, 8);
  assert.equal(ICON_SETS.length, 6);
  assert.equal(ANIMATION_LEVELS.length, 4);
  assert.equal(CARD_STYLES.length, 4);
  assert.equal(BACKGROUNDS.length, 4);
  for (const list of [UI_STYLES, FONT_PAIRINGS, ICON_SETS, ANIMATION_LEVELS, CARD_STYLES, BACKGROUNDS]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${ids.join(",")}`);
  }
});

test("findChoice resolves every catalog entry and rejects unknowns", () => {
  const cases = [
    ["uiStyle", UI_STYLES],
    ["fontPairing", FONT_PAIRINGS],
    ["iconSet", ICON_SETS],
    ["animation", ANIMATION_LEVELS],
    ["cardStyle", CARD_STYLES],
    ["background", BACKGROUNDS],
  ];
  for (const [cat, list] of cases) {
    for (const item of list) assert.ok(findChoice(cat, item.id), `${cat}/${item.id}`);
    assert.equal(findChoice(cat, "nope-does-not-exist"), null);
  }
  assert.equal(findChoice("colors", "custom"), null, "custom categories are not catalog lookups");
  assert.deepEqual([...DESIGN_CATEGORIES], ["uiStyle", "fontPairing", "iconSet", "animation"]);
  assert.deepEqual([...OPTIONAL_CATEGORIES], ["cardStyle", "background", "colors", "layout"]);
});

test("renderIcon produces svg for every render style", () => {
  for (const set of ICON_SETS) {
    const svg = renderIcon("home", set.render, "#334155");
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
  }
});

test("checklist loads with well-formed questions", () => {
  const cats = loadChecklist();
  assert.ok(cats.length >= 10);
  for (const cat of cats) {
    assert.ok(cat.id && cat.title, "category id/title");
    for (const q of cat.questions) {
      assert.ok(q.id.startsWith(cat.id + "."), `question ${q.id} namespaced under ${cat.id}`);
      assert.ok(["core", "recommended", "optional"].includes(q.priority));
    }
  }
  assert.ok(verifyItems().length >= 10);
  // Keyword-less categories are always relevant.
  const relevant = relevantCategories("just a plain note taking app");
  const keywordless = cats.filter((c) => c.keywords.length === 0).map((c) => c.id);
  for (const id of keywordless) assert.ok(relevant.has(id), `${id} should always be relevant`);
});

test("gallery html renders all sections and escapes the project name", () => {
  const html = galleryHtml({
    id: "t1",
    name: 'Test <script>alert("x")</script> App',
    description: "d",
    workspacePath: null,
    phase: "design",
    mode: "full",
    createdAt: "",
    updatedAt: "",
  });
  for (const heading of [
    "1. UI style",
    "2. Font pairing",
    "3. Icon set",
    "4. Animation level",
    "5. Card style",
    "6. Background treatment",
    "7. Colors",
    "8. Layout designer",
  ]) {
    assert.ok(html.includes(heading), `missing section: ${heading}`);
  }
  assert.ok(!html.includes('<script>alert("x")</script>'), "project name is escaped");
  assert.ok(html.includes("wheel"), "color wheel present");
  assert.ok(html.includes("pal-btn"), "layout palette present");
});
