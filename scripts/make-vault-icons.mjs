/**
 * Draws the vault's PWA icons.
 *
 * Without icons a manifest is not installable: Chrome on Android will not
 * offer "add to home screen", and the whole premise — a spare phone that
 * becomes a signer — stops at a browser tab. So they are generated here,
 * from the same mark the web app draws, rather than pulled from a design
 * file nobody in the repo can regenerate.
 *
 *   node scripts/make-vault-icons.mjs
 *
 * No image library: a PNG is a header, a deflate stream of RGBA rows, and a
 * CRC per chunk. Node has everything needed for that, and one fewer
 * dependency in an app whose whole claim is that nothing reaches the network.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "apps/vault/public");

/** The vault's own palette, from apps/vault/src/styles.css. */
const GROUND = [0x1c, 0x1a, 0x17];
const INK = [0xe8, 0xe6, 0xe3];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = -1;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixel) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * (stride + 1) + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle, for antialiased edges. */
function roundedRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Distance to a horizontal bar with rounded caps. */
function bar(x, y, x0, x1, cy, halfH) {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = Math.abs(y - cy) - halfH;
  return Math.hypot(dx, Math.max(dy, 0)) + Math.min(dy, 0) * (dx === 0 ? 1 : 0);
}

/**
 * The mark: the document outline from apps/web/components/Logo.tsx, with its
 * three lines. Drawn on a 64-unit grid and scaled, so the two apps cannot
 * drift apart.
 *
 * `inset` leaves room for a maskable icon's safe zone: Android crops the
 * outer ~10% to whatever shape the launcher uses.
 */
function mark(size, { inset = 0, background = true } = {}) {
  const scale = (size * (1 - inset * 2)) / 64;
  const offset = size * inset;
  const stroke = 4.5 * scale * 0.5;
  const edge = Math.max(size / 256, 0.75);

  return (px, py) => {
    // Sample in logo units.
    const x = (px + 0.5 - offset) / scale;
    const y = (py + 0.5 - offset) / scale;

    // Outline of the document: a rounded rectangle, stroked not filled.
    const outline = Math.abs(roundedRect(x, y, 32, 32, 19, 19, 11) ) - 2.25;

    const lines = Math.min(
      bar(x, y, 22, 42, 23, 2.25),
      bar(x, y, 22, 35, 32, 2.25),
      bar(x, y, 22, 28, 41, 2.25),
    );

    const distance = Math.min(outline, lines) * scale;
    const coverage = Math.min(1, Math.max(0, 0.5 - distance / (edge * 2)));

    if (!background) return [...INK, Math.round(coverage * 255)];

    const [r, g, b] = INK.map((ink, i) => Math.round(GROUND[i] + (ink - GROUND[i]) * coverage));
    return [r, g, b, 255];
  };
}

mkdirSync(OUT, { recursive: true });

const icons = [
  ["icon-192.png", 192, { inset: 0.14 }],
  ["icon-512.png", 512, { inset: 0.14 }],
  // Maskable: more inset, because the launcher crops to a circle or squircle.
  ["icon-maskable-512.png", 512, { inset: 0.22 }],
  ["apple-touch-icon.png", 180, { inset: 0.12 }],
];

for (const [name, size, options] of icons) {
  writeFileSync(join(OUT, name), png(size, mark(size, options)));
  console.log(`${name} ${size}×${size}`);
}

// A transparent one for the browser tab.
writeFileSync(join(OUT, "favicon.png"), png(64, mark(64, { inset: 0.06, background: false })));
console.log("favicon.png 64×64");
