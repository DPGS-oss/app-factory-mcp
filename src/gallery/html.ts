import {
  UI_STYLES,
  FONT_PAIRINGS,
  ICON_SETS,
  ANIMATION_LEVELS,
  CARD_STYLES,
  BACKGROUNDS,
  renderIcon,
  type UiStyle,
} from "./options.js";
import type { Project } from "../state/store.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A miniature, fully-themed mockup of the user's app rendered in CSS. */
function mockup(style: UiStyle, appName: string): string {
  const v = style.vars;
  const accentBg = `background:${v.accent}`;
  return `
  <div class="mock" style="background:${v.bg};border:1px solid ${v.border};border-radius:${v.radius}">
    <div class="mock-top" style="background:${v.surface};border-bottom:1px solid ${v.border}">
      <span class="mock-logo" style="${accentBg};border-radius:6px"></span>
      <span class="mock-title" style="color:${v.text}">${esc(appName)}</span>
      <span class="mock-avatar" style="border:2px solid ${v.border};background:${v.bg}"></span>
    </div>
    <div class="mock-body">
      <div class="mock-side" style="background:${v.surface};border-right:1px solid ${v.border}">
        <span class="mock-nav on" style="${accentBg};opacity:.9"></span>
        <span class="mock-nav" style="background:${v.muted};opacity:.35"></span>
        <span class="mock-nav" style="background:${v.muted};opacity:.35"></span>
        <span class="mock-nav" style="background:${v.muted};opacity:.35"></span>
      </div>
      <div class="mock-main">
        <div class="mock-h" style="color:${v.text}">Dashboard</div>
        <div class="mock-sub" style="color:${v.muted}">Welcome back</div>
        <div class="mock-cards">
          <div class="mock-card" style="background:${v.surface};border:1px solid ${v.border};border-radius:calc(${v.radius} * .7);box-shadow:${v.shadow}">
            <span style="background:${v.muted};opacity:.5"></span><b style="color:${v.text}">128</b>
          </div>
          <div class="mock-card" style="background:${v.surface};border:1px solid ${v.border};border-radius:calc(${v.radius} * .7);box-shadow:${v.shadow}">
            <span style="background:${v.muted};opacity:.5"></span><b style="color:${v.text}">96%</b>
          </div>
        </div>
        <div class="mock-btn" style="${accentBg};color:${v.accentText};border-radius:calc(${v.radius} * .6)">+ New item</div>
      </div>
    </div>
  </div>`;
}

/** Mini demo of a card treatment, on a colorful backdrop so glass/blur is visible. */
function cardStyleDemo(id: string): string {
  const treatments: Record<string, string> = {
    flat: "background:#eef1f6;border:none;box-shadow:none",
    outlined: "background:#ffffff;border:1.5px solid #cbd5e1;box-shadow:none",
    elevated: "background:#ffffff;border:none;box-shadow:0 10px 24px rgba(51,65,85,.22)",
    glass: "background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7);box-shadow:0 8px 24px rgba(0,0,0,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)",
  };
  return `
  <div class="cardstage">
    <div class="cardstage-bg"></div>
    <div class="democard" style="${treatments[id]}">
      <div class="democard-line" style="width:55%"></div>
      <div class="democard-line" style="width:80%"></div>
      <div class="democard-chip"></div>
    </div>
  </div>`;
}

function backgroundDemo(id: string): string {
  const bgs: Record<string, string> = {
    solid: `<div class="bgdemo" style="background:#f1f5f9"></div>`,
    "subtle-gradient": `<div class="bgdemo" style="background:linear-gradient(180deg,#f8fafc,#e2e8f0)"></div>`,
    "vivid-gradient": `<div class="bgdemo" style="background:linear-gradient(135deg,#6366f1,#ec4899,#f59e0b)"></div>`,
    aurora: `<div class="bgdemo" style="background:#0f172a;overflow:hidden">
      <span class="blob" style="background:#6366f1;left:-20px;top:-20px"></span>
      <span class="blob" style="background:#ec4899;right:-15px;top:40px"></span>
      <span class="blob" style="background:#22d3ee;left:60px;bottom:-30px"></span>
    </div>`,
  };
  return `<div class="bgstage">${bgs[id]}<div class="bgdemo-card">Content stays readable</div></div>`;
}

const LAYOUT_COMPONENTS = [
  "Navbar",
  "Sidebar",
  "Hero",
  "Card Grid",
  "List",
  "Form",
  "Search",
  "Tabs",
  "Chart",
  "Image",
  "Text",
  "Button",
  "Footer",
  "FAB",
];

export function galleryHtml(project: Project): string {
  const fontLinks = FONT_PAIRINGS.map((f) => f.googleQuery).join("&");

  const uiCards = UI_STYLES.map(
    (s) => `
    <div class="card" data-cat="uiStyle" data-id="${s.id}" tabindex="0">
      ${mockup(s, project.name)}
      <div class="card-info"><h3>${esc(s.name)}</h3><p>${esc(s.tagline)}</p><p class="insp">Inspired by ${esc(s.inspiredBy)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const fontCards = FONT_PAIRINGS.map(
    (f) => `
    <div class="card" data-cat="fontPairing" data-id="${f.id}" tabindex="0">
      <div class="specimen">
        <div class="spec-h" style="font-family:'${f.heading}',serif">Plan smarter, ship faster</div>
        <div class="spec-b" style="font-family:'${f.body}',sans-serif">
          The quick brown fox jumps over the lazy dog. 0123456789 &mdash; body text at a comfortable reading size.
        </div>
        <div class="spec-meta">${esc(f.heading)} + ${esc(f.body)}</div>
      </div>
      <div class="card-info"><h3>${esc(f.name)}</h3><p>${esc(f.tagline)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const iconCards = ICON_SETS.map(
    (set) => `
    <div class="card" data-cat="iconSet" data-id="${set.id}" tabindex="0">
      <div class="icon-row">
        ${["home", "search", "user", "heart", "settings"].map((p) => renderIcon(p, set.render, "#334155")).join("")}
      </div>
      <div class="card-info"><h3>${esc(set.name)}</h3><p>${esc(set.tagline)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const animCards = ANIMATION_LEVELS.map(
    (a) => `
    <div class="card" data-cat="animation" data-id="${a.id}" tabindex="0">
      <div class="anim-stage"><div class="anim-demo anim-${a.id}"></div></div>
      <div class="card-info"><h3>${esc(a.name)}</h3><p>${esc(a.tagline)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const cardStyleCards = CARD_STYLES.map(
    (c) => `
    <div class="card" data-cat="cardStyle" data-id="${c.id}" tabindex="0">
      ${cardStyleDemo(c.id)}
      <div class="card-info"><h3>${esc(c.name)}</h3><p>${esc(c.tagline)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const backgroundCards = BACKGROUNDS.map(
    (b) => `
    <div class="card" data-cat="background" data-id="${b.id}" tabindex="0">
      ${backgroundDemo(b.id)}
      <div class="card-info"><h3>${esc(b.name)}</h3><p>${esc(b.tagline)}</p></div>
      <div class="tick">&#10003;</div>
    </div>`,
  ).join("");

  const paletteButtons = LAYOUT_COMPONENTS.map(
    (c) => `<button type="button" class="pal-btn" data-comp="${esc(c)}">${esc(c)}</button>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>App Factory Design Studio - ${esc(project.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontLinks}&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #f4f4f5; color: #18181b; padding-bottom: 96px; }
  header { padding: 32px 24px 8px; max-width: 1100px; margin: 0 auto; }
  header h1 { font-size: 26px; font-weight: 800; }
  header p { color: #71717a; margin-top: 6px; }
  section { max-width: 1100px; margin: 0 auto; padding: 24px; }
  section > h2 { font-size: 18px; margin-bottom: 4px; }
  section > .hint { color: #71717a; font-size: 14px; margin-bottom: 16px; }
  .optional-tag { font-size: 11px; font-weight: 700; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 99px; vertical-align: 2px; margin-left: 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
  .card { position: relative; background: #fff; border: 2px solid #e4e4e7; border-radius: 14px; padding: 12px; cursor: pointer; transition: border-color .15s, transform .15s, box-shadow .15s; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.08); }
  .card.sel { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
  .card .tick { position: absolute; top: 10px; right: 10px; width: 24px; height: 24px; border-radius: 50%; background: #4f46e5; color: #fff; font-size: 13px; display: none; align-items: center; justify-content: center; z-index: 2; }
  .card.sel .tick { display: flex; }
  .card-info { margin-top: 10px; }
  .card-info h3 { font-size: 15px; }
  .card-info p { font-size: 13px; color: #71717a; margin-top: 2px; }
  .card-info .insp { font-size: 11px; color: #a1a1aa; font-style: italic; }

  .mock { overflow: hidden; height: 190px; display: flex; flex-direction: column; }
  .mock-top { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
  .mock-logo { width: 14px; height: 14px; display: inline-block; }
  .mock-title { font-size: 11px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mock-avatar { width: 14px; height: 14px; border-radius: 50%; }
  .mock-body { display: flex; flex: 1; min-height: 0; }
  .mock-side { width: 34px; padding: 8px 7px; display: flex; flex-direction: column; gap: 7px; }
  .mock-nav { height: 8px; border-radius: 4px; display: block; }
  .mock-main { flex: 1; padding: 10px 12px; }
  .mock-h { font-size: 13px; font-weight: 800; }
  .mock-sub { font-size: 9px; margin-top: 2px; }
  .mock-cards { display: flex; gap: 8px; margin-top: 8px; }
  .mock-card { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .mock-card span { height: 6px; width: 60%; border-radius: 3px; display: block; }
  .mock-card b { font-size: 13px; }
  .mock-btn { margin-top: 10px; display: inline-block; font-size: 10px; font-weight: 700; padding: 6px 12px; }

  .specimen { height: 190px; padding: 16px; background: #fafafa; border-radius: 10px; overflow: hidden; }
  .spec-h { font-size: 24px; font-weight: 700; line-height: 1.15; }
  .spec-b { font-size: 13.5px; color: #3f3f46; margin-top: 12px; line-height: 1.55; }
  .spec-meta { font-size: 11px; color: #a1a1aa; margin-top: 14px; font-family: monospace; }

  .icon-row { height: 190px; display: flex; align-items: center; justify-content: center; gap: 14px; background: #fafafa; border-radius: 10px; }

  .anim-stage { height: 190px; background: #fafafa; border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .anim-demo { width: 54px; height: 54px; border-radius: 12px; background: #4f46e5; }
  .anim-subtle { animation: fade 2.4s ease-in-out infinite; }
  .anim-smooth { animation: slide 2.4s ease-in-out infinite; }
  .anim-playful { animation: bounce 1.6s cubic-bezier(.34,1.56,.64,1) infinite; border-radius: 50%; }
  @keyframes fade { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes slide { 0%,100% { transform: translateX(-40px); } 50% { transform: translateX(40px); } }
  @keyframes bounce { 0%,100% { transform: translateY(18px) scale(1,.9); } 40% { transform: translateY(-26px) scale(.95,1.05); } 60% { transform: translateY(-30px) scale(1); } }

  .cardstage { position: relative; height: 190px; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cardstage-bg { position: absolute; inset: 0; background: linear-gradient(135deg,#93c5fd,#c4b5fd 50%,#f9a8d4); }
  .democard { position: relative; width: 150px; padding: 16px; border-radius: 12px; }
  .democard-line { height: 8px; border-radius: 4px; background: #64748b; opacity: .55; margin-bottom: 8px; }
  .democard-chip { width: 56px; height: 18px; border-radius: 9px; background: #4f46e5; margin-top: 4px; }

  .bgstage { position: relative; height: 190px; border-radius: 10px; overflow: hidden; }
  .bgdemo { position: absolute; inset: 0; }
  .blob { position: absolute; width: 110px; height: 110px; border-radius: 50%; filter: blur(34px); opacity: .55; }
  .bgdemo-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); background: rgba(255,255,255,.92); padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; color: #334155; box-shadow: 0 4px 14px rgba(0,0,0,.15); }

  /* Color studio */
  .colorstudio { display: flex; gap: 28px; flex-wrap: wrap; background: #fff; border: 2px solid #e4e4e7; border-radius: 14px; padding: 20px; }
  .colorstudio.active { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
  .wheelwrap { position: relative; width: 200px; height: 200px; }
  #wheel { cursor: crosshair; border-radius: 50%; }
  .color-controls { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; }
  .color-controls label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .swatchrow { display: flex; gap: 10px; align-items: center; }
  .swatch { width: 44px; height: 44px; border-radius: 10px; border: 3px solid #e4e4e7; cursor: pointer; }
  .swatch.active { border-color: #18181b; }
  .swatch-label { font-size: 12px; color: #71717a; text-align: center; margin-top: 4px; }
  .gradpreview { height: 40px; border-radius: 10px; border: 1px solid #e4e4e7; }
  input[type="range"] { width: 100%; accent-color: #4f46e5; }
  .muted { color: #a1a1aa; font-size: 12px; }

  /* Layout designer */
  .designer { background: #fff; border: 2px solid #e4e4e7; border-radius: 14px; padding: 16px; }
  .designer.active { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
  .palette { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .pal-btn { border: 1px solid #d4d4d8; background: #fafafa; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pal-btn:hover { background: #eef2ff; border-color: #4f46e5; }
  #stage { position: relative; width: 100%; aspect-ratio: 3 / 2; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; overflow: hidden;
    background-image: linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px);
    background-size: calc(100% / 12) calc(100% / 8); }
  .item { position: absolute; background: rgba(79,70,229,.12); border: 1.5px solid #4f46e5; border-radius: 6px; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #3730a3; cursor: grab; user-select: none; touch-action: none; }
  .item:active { cursor: grabbing; }
  .item .rs { position: absolute; right: -6px; bottom: -6px; width: 14px; height: 14px; background: #4f46e5; border-radius: 4px; cursor: nwse-resize; }
  .item .del { position: absolute; top: -9px; right: -9px; width: 18px; height: 18px; background: #ef4444; color: #fff; border-radius: 50%; font-size: 11px;
    display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .designer-tools { display: flex; gap: 10px; margin-top: 10px; align-items: center; }
  .designer-tools button { border: 1px solid #d4d4d8; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }

  footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e4e4e7; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; z-index: 5; }
  footer .status { font-size: 14px; color: #71717a; }
  footer button#submit { background: #4f46e5; color: #fff; border: 0; font-size: 15px; font-weight: 700; padding: 12px 28px; border-radius: 10px; cursor: pointer; }
  footer button#submit:disabled { background: #c7c9f4; cursor: not-allowed; }
  .overlay { position: fixed; inset: 0; background: rgba(24,24,27,.92); display: none; align-items: center; justify-content: center; z-index: 10; }
  .overlay.show { display: flex; }
  .overlay .box { text-align: center; color: #fff; padding: 24px; }
  .overlay .box .big { font-size: 44px; }
  .overlay .box h2 { margin-top: 12px; font-size: 22px; }
  .overlay .box p { margin-top: 8px; color: #a1a1aa; }
</style>
</head>
<body>
<header>
  <h1>Design Studio &mdash; ${esc(project.name)}</h1>
  <p>Sections 1&ndash;4 are required. Sections 5&ndash;8 are optional refinements &mdash; skip any and sensible defaults apply.</p>
</header>

<section>
  <h2>1. UI style</h2>
  <div class="hint">Each preview is a live mockup of ${esc(project.name)} in that style.</div>
  <div class="grid">${uiCards}</div>
</section>

<section>
  <h2>2. Font pairing</h2>
  <div class="hint">Real fonts, loaded live from Google Fonts.</div>
  <div class="grid">${fontCards}</div>
</section>

<section>
  <h2>3. Icon set</h2>
  <div class="hint">The same five icons drawn in each library's style.</div>
  <div class="grid">${iconCards}</div>
</section>

<section>
  <h2>4. Animation level</h2>
  <div class="hint">How much motion should the app have?</div>
  <div class="grid">${animCards}</div>
</section>

<section>
  <h2>5. Card style<span class="optional-tag">optional</span></h2>
  <div class="hint">How surfaces are separated: flat color, borders, shadows, or frosted glass blur.</div>
  <div class="grid">${cardStyleCards}</div>
</section>

<section>
  <h2>6. Background treatment<span class="optional-tag">optional</span></h2>
  <div class="hint">What sits behind the content - from calm solid to glowing aurora blur.</div>
  <div class="grid">${backgroundCards}</div>
</section>

<section>
  <h2>7. Colors<span class="optional-tag">optional</span></h2>
  <div class="hint">Override the style's accent with your own colors from the wheel - optionally as a gradient.</div>
  <div class="colorstudio" id="colorstudio">
    <div>
      <div class="wheelwrap"><canvas id="wheel" width="200" height="200"></canvas></div>
      <div style="margin-top:10px">
        <input type="range" id="lightness" min="20" max="80" value="50">
        <div class="muted" style="text-align:center">lightness</div>
      </div>
    </div>
    <div class="color-controls">
      <label><input type="checkbox" id="useCustom"> <b>Use custom colors</b> (otherwise the UI style's accent is used)</label>
      <div class="swatchrow">
        <div>
          <div class="swatch active" id="swA" style="background:#4f46e5"></div>
          <div class="swatch-label">primary<br><span id="hexA">#4f46e5</span></div>
        </div>
        <div id="swBwrap" style="display:none">
          <div class="swatch" id="swB" style="background:#ec4899"></div>
          <div class="swatch-label">second<br><span id="hexB">#ec4899</span></div>
        </div>
      </div>
      <label><input type="checkbox" id="useGradient"> Gradient (pick a second color)</label>
      <div class="gradpreview" id="gradpreview" style="background:#4f46e5"></div>
      <div class="muted">Click a swatch to make it active, then click the wheel to set it.</div>
    </div>
  </div>
</section>

<section>
  <h2>8. Layout designer<span class="optional-tag">optional</span></h2>
  <div class="hint">Design the main screen yourself: click a component to add it, drag to move, drag the corner square to resize, &#215; to remove. The grid is 12 columns &#215; 8 rows.</div>
  <div class="designer" id="designer">
    <div class="palette">${paletteButtons}</div>
    <div id="stage"></div>
    <div class="designer-tools">
      <button type="button" id="clearLayout">Clear layout</button>
      <span class="muted" id="layoutCount">0 components - leave empty to let the agent design the layout</span>
    </div>
  </div>
</section>

<footer>
  <div class="status" id="status">0 of 4 required selected</div>
  <button id="submit" disabled>Send choices to App Factory</button>
</footer>

<div class="overlay" id="overlay">
  <div class="box">
    <div class="big">&#127881;</div>
    <h2>Choices saved</h2>
    <p>Head back to Cursor &mdash; the agent will pick up your selections and continue building.</p>
  </div>
</div>

<script>
  // ----- card selection (required + optional catalog sections) -----
  const chosen = {};
  const REQUIRED = ["uiStyle", "fontPairing", "iconSet", "animation"];
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const cat = card.dataset.cat;
      const wasSelected = card.classList.contains("sel");
      document.querySelectorAll('.card[data-cat="' + cat + '"]').forEach((c) => c.classList.remove("sel"));
      if (wasSelected && !REQUIRED.includes(cat)) {
        delete chosen[cat]; // optional sections can be toggled off
      } else {
        card.classList.add("sel");
        chosen[cat] = card.dataset.id;
      }
      const n = REQUIRED.filter((c) => chosen[c]).length;
      document.getElementById("status").textContent = n + " of 4 required selected";
      document.getElementById("submit").disabled = n < 4;
    });
  });

  // ----- color wheel -----
  const wheel = document.getElementById("wheel");
  const wctx = wheel.getContext("2d");
  const WR = 100;
  let lightness = 50;
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0");
    return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
  }
  function drawWheel() {
    const img = wctx.createImageData(200, 200);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const dx = x - WR, dy = y - WR;
        const d = Math.sqrt(dx * dx + dy * dy);
        const i = (y * 200 + x) * 4;
        if (d > WR) { img.data[i + 3] = 0; continue; }
        const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const sat = Math.min(1, d / WR) * 100;
        const hex = hslToHex(hue, sat, lightness);
        img.data[i] = parseInt(hex.slice(1, 3), 16);
        img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[i + 3] = 255;
      }
    }
    wctx.putImageData(img, 0, 0);
  }
  drawWheel();

  const colors = { primary: "#4f46e5", second: "#ec4899", gradient: false, custom: false };
  let activeSwatch = "primary";
  function refreshColorUI() {
    document.getElementById("swA").style.background = colors.primary;
    document.getElementById("swB").style.background = colors.second;
    document.getElementById("hexA").textContent = colors.primary;
    document.getElementById("hexB").textContent = colors.second;
    document.getElementById("swBwrap").style.display = colors.gradient ? "block" : "none";
    document.getElementById("gradpreview").style.background = colors.gradient
      ? "linear-gradient(135deg," + colors.primary + "," + colors.second + ")"
      : colors.primary;
    document.getElementById("colorstudio").classList.toggle("active", colors.custom);
    document.getElementById("swA").classList.toggle("active", activeSwatch === "primary");
    document.getElementById("swB").classList.toggle("active", activeSwatch === "second");
  }
  function pickFromWheel(e) {
    const rect = wheel.getBoundingClientRect();
    const dx = e.clientX - rect.left - WR, dy = e.clientY - rect.top - WR;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > WR) return;
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const sat = Math.min(1, d / WR) * 100;
    colors[activeSwatch] = hslToHex(hue, sat, lightness);
    colors.custom = true;
    document.getElementById("useCustom").checked = true;
    refreshColorUI();
  }
  wheel.addEventListener("pointerdown", (e) => {
    pickFromWheel(e);
    const move = (ev) => pickFromWheel(ev);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  document.getElementById("lightness").addEventListener("input", (e) => { lightness = +e.target.value; drawWheel(); });
  document.getElementById("useCustom").addEventListener("change", (e) => { colors.custom = e.target.checked; refreshColorUI(); });
  document.getElementById("useGradient").addEventListener("change", (e) => {
    colors.gradient = e.target.checked;
    if (colors.gradient) { activeSwatch = "second"; colors.custom = true; document.getElementById("useCustom").checked = true; }
    refreshColorUI();
  });
  document.getElementById("swA").addEventListener("click", () => { activeSwatch = "primary"; refreshColorUI(); });
  document.getElementById("swB").addEventListener("click", () => { activeSwatch = "second"; refreshColorUI(); });
  refreshColorUI();

  // ----- layout designer -----
  const stage = document.getElementById("stage");
  const GRID_X = 12, GRID_Y = 8;
  let items = []; // {type,x,y,w,h,el}
  const DEFAULT_SIZES = {
    Navbar: [12, 1], Sidebar: [3, 7], Hero: [9, 3], "Card Grid": [9, 3], List: [6, 4], Form: [5, 4],
    Search: [4, 1], Tabs: [6, 1], Chart: [6, 3], Image: [4, 3], Text: [4, 2], Button: [2, 1], Footer: [12, 1], FAB: [1, 1],
  };
  function cell() { const r = stage.getBoundingClientRect(); return [r.width / GRID_X, r.height / GRID_Y]; }
  function place(el, it) {
    const [cw, ch] = cell();
    el.style.left = it.x * cw + "px"; el.style.top = it.y * ch + "px";
    el.style.width = it.w * cw - 2 + "px"; el.style.height = it.h * ch - 2 + "px";
  }
  function refreshCount() {
    document.getElementById("layoutCount").textContent =
      items.length + " component" + (items.length === 1 ? "" : "s") +
      (items.length ? " - included in your design choices" : " - leave empty to let the agent design the layout");
    document.getElementById("designer").classList.toggle("active", items.length > 0);
  }
  function addItem(type) {
    const [w, h] = DEFAULT_SIZES[type] || [3, 2];
    const it = { type, x: 0, y: 0, w, h };
    // find a free-ish spot: first row where nothing overlaps at x=0
    for (let y = 0; y <= GRID_Y - h; y++) {
      if (!items.some((o) => o.x < w && o.x + o.w > 0 && o.y < y + h && o.y + o.h > y)) { it.y = y; break; }
      it.y = Math.min(GRID_Y - h, y);
    }
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = "<span>" + type + "</span><span class='rs'></span><span class='del'>&#215;</span>";
    stage.appendChild(el);
    it.el = el;
    items.push(it);
    place(el, it);
    refreshCount();

    el.querySelector(".del").addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      items = items.filter((o) => o !== it);
      el.remove();
      refreshCount();
    });

    el.querySelector(".rs").addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      const [cw, ch] = cell();
      const startX = e.clientX, startY = e.clientY, w0 = it.w, h0 = it.h;
      const move = (ev) => {
        it.w = Math.max(1, Math.min(GRID_X - it.x, w0 + Math.round((ev.clientX - startX) / cw)));
        it.h = Math.max(1, Math.min(GRID_Y - it.y, h0 + Math.round((ev.clientY - startY) / ch)));
        place(el, it);
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const [cw, ch] = cell();
      const startX = e.clientX, startY = e.clientY, x0 = it.x, y0 = it.y;
      const move = (ev) => {
        it.x = Math.max(0, Math.min(GRID_X - it.w, x0 + Math.round((ev.clientX - startX) / cw)));
        it.y = Math.max(0, Math.min(GRID_Y - it.h, y0 + Math.round((ev.clientY - startY) / ch)));
        place(el, it);
      };
      const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }
  document.querySelectorAll(".pal-btn").forEach((b) => b.addEventListener("click", () => addItem(b.dataset.comp)));
  document.getElementById("clearLayout").addEventListener("click", () => {
    items.forEach((it) => it.el.remove()); items = []; refreshCount();
  });
  window.addEventListener("resize", () => items.forEach((it) => place(it.el, it)));

  // ----- submit -----
  document.getElementById("submit").addEventListener("click", async () => {
    const payload = { ...chosen };
    if (colors.custom) {
      payload.colors = { primary: colors.primary, gradient: colors.gradient, ...(colors.gradient ? { second: colors.second } : {}) };
    }
    if (items.length) {
      payload.layout = { grid: [GRID_X, GRID_Y], screen: "main", items: items.map(({ type, x, y, w, h }) => ({ type, x, y, w, h })) };
    }
    const res = await fetch("/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) document.getElementById("overlay").classList.add("show");
    else alert("Failed to save choices: " + (await res.text()));
  });
</script>
</body>
</html>`;
}
