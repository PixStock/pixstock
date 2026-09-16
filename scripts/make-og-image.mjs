/**
 * Draws the Open Graph card — the image every link preview shows.
 *
 *   node scripts/make-og-image.mjs
 *
 * Generated rather than exported from a design file, for the same reason the
 * vault's icons are: an asset nobody in the repository can regenerate is an
 * asset that goes stale the first time a colour or a claim changes. This one
 * had gone worse than stale — it carried another project's branding into
 * every share of this one.
 *
 * Everything it draws comes from the sources of truth already in the tree:
 * the mark from `apps/web/lib/qr-mark.ts`, the palette and the type stack from
 * `apps/web/app/globals.css`, the sentence from `content/site.json`. Change
 * one of those and re-run this; nothing here restates them.
 *
 * Chromium renders it because the card is type on a background and a browser
 * is the thing in this repository that already sets type. Playwright is a
 * development dependency and the browser is the one the system tests install.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const OUT = join(ROOT, "apps/web/public/og.jpg");

/** Open Graph's canonical size. Twitter, Slack and Discord all crop to it. */
const WIDTH = 1200;
const HEIGHT = 630;

/* ── the sources of truth ──────────────────────────────────────────────── */

const css = readFileSync(join(ROOT, "apps/web/app/globals.css"), "utf8");

/**
 * Reads one custom property out of the stylesheet.
 *
 * The first definition wins, which is the dark `:root` block — the card is
 * always dark, because a link preview has no theme to follow.
 */
function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`make-og-image: --${name} is not in globals.css`);
  return match[1].trim();
}

const GROUND = token("ground");
const INK = token("ink");
const INK_3 = token("ink-3");
const OK = token("ok");
const SANS = token("font-sans-stack");
const MONO = token("font-mono-stack");

const site = JSON.parse(readFileSync(join(ROOT, "apps/web/content/site.json"), "utf8"));

/** The sentence the landing page leads with, not a second one written here. */
const STATEMENT = site.home.statement;

/**
 * Three of the hero's four figures.
 *
 * The byte count is left off on purpose: the hero says 943 B and
 * docs/AGQP-SPEC.md measures 910 cold and 816 warm, and a card is the wrong
 * place to settle that. These three are stable and checkable.
 */
const STATS = site.home.hero.stats
  .filter((stat) => /SOL|%|^0$/.test(stat.value))
  .slice(0, 3);

/* ── the mark ──────────────────────────────────────────────────────────── */

/**
 * The mark's geometry, read from the module that defines it.
 *
 * `qr-mark.ts` is TypeScript the web app imports; rather than compile it, the
 * constants are parsed out, so the two cannot drift without this failing
 * loudly.
 */
const markSource = readFileSync(join(ROOT, "apps/web/lib/qr-mark.ts"), "utf8");

function constant(name) {
  const match = markSource.match(new RegExp(`export const ${name} = ([^;]+);`));
  if (!match) throw new Error(`make-og-image: ${name} is not exported by qr-mark.ts`);
  return match[1].trim();
}

const BOX = Number(constant("BOX"));
const CELL = Number(constant("CELL"));
const ORIGIN = Number(constant("ORIGIN"));
const GAP = Number(constant("GAP"));
const MODULE = CELL - GAP;
const MODULE_RADIUS = Number(constant("MODULE_RADIUS"));
const RING = JSON.parse(constant("FINDER_RING").replace(/(\w+):/g, '"$1":'));
const EYE_INSET = (CELL * 3 - MODULE) / 2;

const moduleAt = (i) => ORIGIN + i * CELL + GAP / 2;

const MODULES = [
  [3, 0], [3, 2], [3, 4], [3, 6],
  [0, 3], [2, 3], [4, 3], [6, 3],
  [4, 4], [6, 4],
  [4, 5], [5, 5],
  [5, 6], [6, 6],
];

const FINDERS = [
  [ORIGIN, ORIGIN],
  [ORIGIN + 4 * CELL, ORIGIN],
  [ORIGIN, ORIGIN + 4 * CELL],
];

const rect = (x, y, size, radius) =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/>`;

const mark = `
<svg viewBox="0 0 ${BOX} ${BOX}" width="52" height="52" aria-hidden="true">
  <g fill="${INK}">
    ${MODULES.map(([c, r]) => rect(moduleAt(c), moduleAt(r), MODULE, MODULE_RADIUS)).join("")}
    ${FINDERS.map(([x, y]) => rect(x + EYE_INSET, y + EYE_INSET, MODULE, MODULE_RADIUS)).join("")}
  </g>
  <g fill="none" stroke="${INK}" stroke-width="${RING.stroke}">
    ${FINDERS.map(([x, y]) => rect(x + RING.inset, y + RING.inset, RING.size, RING.radius)).join("")}
  </g>
</svg>`;

/* ── the card ──────────────────────────────────────────────────────────── */

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: ${GROUND};
    color: ${INK};
    font-family: ${SANS};
    -webkit-font-smoothing: antialiased;
    padding: 72px 84px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    /* The same warm lift the hero has, so a share and the page it opens read
       as one surface rather than two. */
    background-image: radial-gradient(
      120% 90% at 78% 8%,
      color-mix(in srgb, ${INK} 7%, transparent) 0%,
      transparent 62%
    );
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand-name { font-size: 34px; font-weight: 640; letter-spacing: -0.018em; }
  /* The headline takes the room between the brand and the rule and centres
     itself in it, rather than being pushed to the top of a gap. */
  .say { flex: 1; display: flex; align-items: center; }
  h1 {
    font-size: 66px;
    line-height: 1.06;
    font-weight: 660;
    letter-spacing: -0.032em;
    max-width: 19ch;
  }
  /* The half of the sentence that is the claim. Everything before it is
     setup, and setting the whole line at one weight buries it. */
  h1 em { font-style: normal; color: ${OK}; }
  .stats {
    display: flex;
    gap: 64px;
    padding-top: 30px;
    border-top: 1px solid color-mix(in srgb, ${INK} 16%, transparent);
  }
  .stat { display: flex; flex-direction: column; gap: 7px; }
  /* Tabular figures, the same rule the product's own amounts follow. */
  .v { font-family: ${MONO}; font-size: 31px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .k { font-size: 16px; color: ${INK_3}; letter-spacing: 0.005em; }
</style>
<div class="brand">${mark}<span class="brand-name">PixStock</span></div>

<div class="say">
  <h1>${STATEMENT.replace(
    "checks the market price",
    "<em>checks the market price</em>",
  )}</h1>
</div>

<div class="stats">
  ${STATS.map(
    (stat) => `<div class="stat"><span class="v">${stat.value}</span><span class="k">${stat.label}</span></div>`,
  ).join("")}
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  // Rendered at 2x and written down to 1200x630, so the type carries the
  // detail a 1x raster loses on the way into a JPEG.
  deviceScaleFactor: 2,
});

await page.setContent(html, { waitUntil: "load" });
const buffer = await page.screenshot({
  type: "jpeg",
  quality: 92,
  clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  scale: "css",
});
await browser.close();

writeFileSync(OUT, buffer);

console.log(`og.jpg  ${WIDTH}x${HEIGHT}  ${(buffer.length / 1024).toFixed(1)} kB  → ${OUT}`);
console.log(`statement  "${STATEMENT}"`);
for (const stat of STATS) console.log(`stat       ${stat.value.padEnd(8)} ${stat.label}`);
