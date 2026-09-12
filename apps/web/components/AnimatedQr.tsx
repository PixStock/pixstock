"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AnimatedQrScheduler,
  CHUNK_SIZES,
  DEFAULT_FPS,
  encodeFrames,
  newSessionId,
  type FrameSize,
} from "@pixstock/agqp";

export interface AnimatedQrProps {
  /** The bytes to send across the gap. */
  payload: Uint8Array;
  size?: FrameSize;
  fps?: number;
  /** Rendered edge length in CSS pixels. 520 keeps a module at ~7px. */
  px?: number;
  onCycle?: (info: { frames: number; index: number }) => void;
}

/**
 * Renders an AGQP payload as continuously cycling QR codes.
 *
 * The cycle never stops: the phone can join at any index, and a frame it
 * missed comes back on the next pass. Error correction is fixed at M, which
 * is what the capacity budget in docs/AGQP-SPEC.md §1 assumes.
 */
export function AnimatedQr({ payload, size = "M", fps = DEFAULT_FPS, px = 520, onCycle }: AnimatedQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Held in a ref so a new callback identity does not restart the cycle.
  const onCycleRef = useRef(onCycle);
  const [index, setIndex] = useState(0);
  const [drawError, setDrawError] = useState<string | null>(null);

  useEffect(() => {
    onCycleRef.current = onCycle;
  }, [onCycle]);

  // Encoding is pure and cheap, so it happens during render rather than in an
  // effect. A new payload is a new session: the id goes in the frames here
  // and, once the CBOR layer lands, inside the payload too, so the vault can
  // check the two agree.
  const encoded = useMemo(() => {
    try {
      return { frames: encodeFrames(payload, { sid: newSessionId(), size }), error: null };
    } catch (err) {
      return { frames: [] as string[], error: (err as Error).message };
    }
  }, [payload, size]);

  const { frames } = encoded;

  useEffect(() => {
    if (frames.length === 0) return;

    const draw = (frame: string, i: number) => {
      setIndex(i);
      onCycleRef.current?.({ frames: frames.length, index: i });

      const canvas = canvasRef.current;
      if (!canvas) return;
      // Alphanumeric mode is picked automatically: every character a frame can
      // contain is inside that set, which is what keeps the QR small.
      QRCode.toCanvas(canvas, frame, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: px,
        color: { dark: "#000000", light: "#ffffff" },
      }).catch((err: Error) => setDrawError(err.message));
    };

    const scheduler = new AnimatedQrScheduler(frames, fps);
    // Deferred so the first frame is not painted synchronously inside the
    // effect, which would set state mid-commit.
    const started = setTimeout(() => scheduler.start(draw), 0);

    return () => {
      clearTimeout(started);
      scheduler.stop();
    };
  }, [frames, fps, px]);

  const error = encoded.error ?? drawError;
  if (error) {
    return (
      <p role="alert" style={{ color: "var(--crit)" }}>
        Cannot display this order: {error}
      </p>
    );
  }

  const cycleMs = frames.length ? Math.round((frames.length / fps) * 1000) : 0;

  return (
    <figure style={{ margin: 0, display: "grid", gap: 12, justifyItems: "center" }}>
      <canvas
        ref={canvasRef}
        width={px}
        height={px}
        style={{ width: "100%", maxWidth: px, height: "auto", borderRadius: 8, background: "#fff" }}
        role="img"
        aria-label={`Order frame ${index + 1} of ${frames.length}. Point the vault camera at this screen.`}
      />
      <figcaption style={{ color: "var(--ink-3)", fontSize: 13 }}>
        Frame <span className="num">{index + 1}</span> of <span className="num">{frames.length}</span>
        {" · "}
        <span className="num">{CHUNK_SIZES[size]}</span> B per frame
        {" · "}
        <span className="num">{fps}</span> FPS
        {" · "}
        cycle <span className="num">{cycleMs}</span> ms
      </figcaption>
    </figure>
  );
}
