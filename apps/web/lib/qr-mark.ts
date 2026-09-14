/**
 * The PixStock mark, as geometry on the 64-unit grid every copy of it is drawn
 * at. It is a QR code because the QR *is* the product: the only channel the
 * vault ever opens to the network is a screen and a camera.
 *
 * Three renderers read from here — <Logo /> (SVG), HeroCanvas (2D canvas,
 * sampled into particles) and the favicon data URI in app/layout.tsx. Keeping
 * the coordinates in one place is what stops the three drifting apart.
 */

/** Side of the square the mark is laid out in. Every coordinate here is in it. */
export const BOX = 64;

/** Grid pitch: centre to centre of two neighbouring modules. */
export const CELL = 8;

/** Left/top edge of the grid, leaving a 4-unit quiet zone on every side. */
export const ORIGIN = 4;

/** Side of the grid, quiet zone excluded. */
export const INK = BOX - ORIGIN * 2;

/**
 * How much smaller than its cell a module is drawn. A real QR tiles its
 * modules edge to edge; this one cannot, because the hero blooms every lit
 * pixel outwards and a zero-width gap closes — the timing pattern fuses into
 * the finder next to it and the mark stops reading as a code.
 */
export const GAP = 1.4;

/** Side of a drawn module, and the radius its corners are cut at. */
export const MODULE = CELL - GAP;
export const MODULE_RADIUS = 1.7;

/** Where the module in column (or row) `i` is drawn, in 64-unit space. */
export function moduleAt(i: number): number {
  return ORIGIN + i * CELL + GAP / 2;
}

/**
 * The dark modules, as [column, row]. The alternating runs down column 3 and
 * across row 3 are the timing pattern; the block in the lower right is data.
 * `F` is the area a finder pattern covers.
 *
 *     F F F # F F F
 *     F F F . F F F
 *     F F F # F F F
 *     # . # . # . #
 *     F F F # # . #
 *     F F F . # # .
 *     F F F # . # #
 */
export const MODULES: readonly (readonly [number, number])[] = [
  [3, 0], [3, 2], [3, 4], [3, 6],
  [0, 3], [2, 3], [4, 3], [6, 3],
  [4, 4], [6, 4],
  [4, 5], [5, 5],
  [5, 6], [6, 6],
];

/** Top-left corner of each finder pattern's three-by-three cells. */
export const FINDERS: readonly (readonly [number, number])[] = [
  [ORIGIN, ORIGIN],
  [ORIGIN + 4 * CELL, ORIGIN],
  [ORIGIN, ORIGIN + 4 * CELL],
];

/**
 * A finder's ring, stroked along the centreline of a rounded square. The inset
 * is the half-gap plus half the stroke, so the ring's outer edge lands exactly
 * where a module in those cells would have been drawn.
 */
export const FINDER_RING = { inset: 3, size: 18, radius: 4, stroke: 4.6 };

/** The filled square at the centre of a finder — one module, centred. */
export const FINDER_EYE = { inset: (CELL * 3 - MODULE) / 2, size: MODULE, radius: MODULE_RADIUS };

/**
 * The mark as a standalone SVG document, for the one place that needs a string
 * instead of JSX: the favicon data URI. `background` is optional — without it
 * the mark sits on whatever is behind it.
 */
export function markSvgDocument({ ink, background }: { ink: string; background?: string }): string {
  const rect = (x: number, y: number, size: number, radius: number) =>
    `<rect x='${x}' y='${y}' width='${size}' height='${size}' rx='${radius}'/>`;

  const filled = [
    ...MODULES.map(([c, r]) => rect(moduleAt(c), moduleAt(r), MODULE, MODULE_RADIUS)),
    ...FINDERS.map(([x, y]) => rect(x + FINDER_EYE.inset, y + FINDER_EYE.inset, FINDER_EYE.size, FINDER_EYE.radius)),
  ].join("");

  const rings = FINDERS.map(([x, y]) =>
    rect(x + FINDER_RING.inset, y + FINDER_RING.inset, FINDER_RING.size, FINDER_RING.radius),
  ).join("");

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${BOX} ${BOX}'>` +
    (background ? `<rect width='${BOX}' height='${BOX}' rx='16' fill='${background}'/>` : "") +
    `<g fill='${ink}'>${filled}</g>` +
    `<g fill='none' stroke='${ink}' stroke-width='${FINDER_RING.stroke}'>${rings}</g>` +
    `</svg>`
  );
}
