import { BOX, FINDERS, FINDER_EYE, FINDER_RING, MODULE, MODULES, MODULE_RADIUS, moduleAt } from "@/lib/qr-mark";

/** The mark. Geometry lives in lib/qr-mark.ts — see the note there. */
export function Logo() {
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} aria-hidden="true">
      <g fill="currentColor">
        {MODULES.map(([c, r]) => (
          <rect key={`m${c}-${r}`} x={moduleAt(c)} y={moduleAt(r)} width={MODULE} height={MODULE} rx={MODULE_RADIUS} />
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
