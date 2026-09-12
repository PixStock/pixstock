"use client";

import { useMemo, useState } from "react";
import { CHUNK_SIZES, DEFAULT_FPS, encodeSessionId, newSessionId, type FrameSize } from "@pixstock/agqp";
import { AnimatedQr } from "@/components/AnimatedQr";
import { SignatureScanner } from "@/components/SignatureScanner";

/** Measured payload sizes from docs/AGQP-SPEC.md §3. */
const PRESETS = [
  { label: "Single swap", bytes: 800, detail: "USDC → TSLAx, one route" },
  { label: "2-leg basket", bytes: 1130, detail: "two direct routes" },
  { label: "3-leg basket", bytes: 1330, detail: "AAPLx + NVDAx + MSFTx, 7 ix, 3 ALT" },
  { label: "Pyth fallback", bytes: 2400, detail: "if R1 forces Hermes VAAs" },
] as const;

const SIZES: FrameSize[] = ["S", "M", "L"];
const RATES = [6, 8, 10, 12];

/**
 * Stand-in for a real order until the relayer builds one. The bytes are
 * deterministic so two runs produce the same frames — which is what makes the
 * measurement day comparable.
 */
function syntheticPayload(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
}

export function SignHarness() {
  const [bytes, setBytes] = useState<number>(1330);
  const [size, setSize] = useState<FrameSize>("M");
  const [fps, setFps] = useState<number>(DEFAULT_FPS);

  // An order is a payload and its session id, minted together: the vault
  // echoes the id back, and a reply carrying any other one answers a
  // different order and must not be broadcast.
  const order = useMemo(
    () => ({ payload: syntheticPayload(bytes), sid: newSessionId() }),
    [bytes]
  );
  const frameCount = Math.ceil(bytes / CHUNK_SIZES[size]);

  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Field label="Order">
          {PRESETS.map((p) => (
            <Choice key={p.bytes} active={bytes === p.bytes} onClick={() => setBytes(p.bytes)} title={p.detail}>
              {p.label} · <span className="num">{p.bytes}</span> B
            </Choice>
          ))}
        </Field>

        <Field label="Frame size">
          {SIZES.map((s) => (
            <Choice key={s} active={size === s} onClick={() => setSize(s)}>
              {s} · <span className="num">{CHUNK_SIZES[s]}</span> B
            </Choice>
          ))}
        </Field>

        <Field label="Rate">
          {RATES.map((r) => (
            <Choice key={r} active={fps === r} onClick={() => setFps(r)}>
              <span className="num">{r}</span> FPS
            </Choice>
          ))}
        </Field>
      </div>

      <p style={{ color: "var(--ink-2)", margin: 0 }}>
        <span className="num">{frameCount}</span> frames ·
        one full cycle every <span className="num">{Math.round((frameCount / fps) * 1000)}</span> ms ·
        a phone decoding at 15–30 fps captures everything in one or two cycles.
      </p>

      <AnimatedQr payload={order.payload} sid={order.sid} size={size} fps={fps} />

      <div style={{ display: "grid", gap: 12, borderTop: "1px solid var(--rule)", paddingTop: 24 }}>
        <span className="eyebrow">Return channel</span>
        <p style={{ margin: 0, color: "var(--ink-2)" }}>
          The vault answers with a single static QR holding sixty-four bytes.
          Hold it up to the webcam.
        </p>
        <SignatureScanner expectedSid={encodeSessionId(order.sid)} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className="eyebrow">{label}</span>
      <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn${active ? " btn--solid" : ""}`}
      aria-pressed={active}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
