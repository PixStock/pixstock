/**
 * The PixStock mark, ported from apps/web/lib/qr-mark.ts.
 *
 * Copied rather than redrawn: the coordinates are the same 64-unit grid the
 * SVG logo, the hero canvas and the favicon are all laid out on, and a mark
 * redrawn by eye is a mark that drifts. The two apps share no bundler path,
 * so the geometry travels as source.
 *
 * It is a QR code because the QR *is* the product: the only channel this app
 * ever opens is a screen and a camera.
 */

/** Side of the square the mark is laid out in. Every coordinate here is in it. */
const BOX = 64;

/** Grid pitch: centre to centre of two neighbouring modules. */
const CELL = 8;

/** Left/top edge of the grid, leaving a 4-unit quiet zone on every side. */
const ORIGIN = 4;

/** How much smaller than its cell a module is drawn. */
const GAP = 1.4;

/** Side of a drawn module, and the radius its corners are cut at. */
const MODULE = CELL - GAP;
const MODULE_RADIUS = 1.7;

/** Where the module in column (or row) `i` is drawn, in 64-unit space. */
const moduleAt = (i: number) => ORIGIN + i * CELL + GAP / 2;

/**
 * The dark modules, as [column, row]. The alternating runs down column 3 and
 * across row 3 are the timing pattern; the block in the lower right is data.
 */
const MODULES: readonly (readonly [number, number])[] = [
  [3, 0], [3, 2], [3, 4], [3, 6],
  [0, 3], [2, 3], [4, 3], [6, 3],
  [4, 4], [6, 4],
  [4, 5], [5, 5],
  [5, 6], [6, 6],
];

/** Top-left corner of each finder pattern's three-by-three cells. */
const FINDERS: readonly (readonly [number, number])[] = [
  [ORIGIN, ORIGIN],
  [ORIGIN + 4 * CELL, ORIGIN],
  [ORIGIN, ORIGIN + 4 * CELL],
];

const FINDER_RING = { inset: 3, size: 18, radius: 4, stroke: 4.6 };
const FINDER_EYE = { inset: (CELL * 3 - MODULE) / 2, size: MODULE, radius: MODULE_RADIUS };

export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        {MODULES.map(([c, r]) => (
          <rect
            key={`m${c}-${r}`}
            x={moduleAt(c)}
            y={moduleAt(r)}
            width={MODULE}
            height={MODULE}
            rx={MODULE_RADIUS}
          />
        ))}
        {FINDERS.map(([x, y]) => (
          <rect
            key={`e${x}-${y}`}
            x={x + FINDER_EYE.inset}
            y={y + FINDER_EYE.inset}
            width={FINDER_EYE.size}
            height={FINDER_EYE.size}
            rx={FINDER_EYE.radius}
          />
        ))}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth={FINDER_RING.stroke}>
        {FINDERS.map(([x, y]) => (
          <rect
            key={`r${x}-${y}`}
            x={x + FINDER_RING.inset}
            y={y + FINDER_RING.inset}
            width={FINDER_RING.size}
            height={FINDER_RING.size}
            rx={FINDER_RING.radius}
          />
        ))}
      </g>
    </svg>
  );
}
