"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  AnimatedQrScheduler,
  DEFAULT_FPS,
  encodeFrames,
  type FrameSize,
} from "@pixstock/agqp";

export interface AnimatedQrProps {
  /** The bytes to send across the gap. */
  payload: Uint8Array;
  /** Session id these frames belong to. The reply carries it back. */
  sid: Uint8Array;
  size?: FrameSize;
  fps?: number;
  /** Rendered edge length in CSS pixels. 520 keeps a module at ~7px. */
  px?: number;
  onCycle?: (info: { frames: number; index: number }) => void;
  /** Class on the canvas. /sign wants the 16px radius and 540px cap. */
  className?: string;
}

/**
 * Renders an AGQP payload as continuously cycling QR codes.
 *
 * The cycle never stops: the phone can join at any index, and a frame it
 * missed comes back on the next pass. Error correction is fixed at M, which
 * is what the capacity budget in docs/AGQP-SPEC.md §1 assumes.
 */
export function AnimatedQr({
  payload,
  sid,
  size = "M",
  fps = DEFAULT_FPS,
  px = 520,
  onCycle,
  className,
}: AnimatedQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Held in a ref so a new callback identity does not restart the cycle.
  const onCycleRef = useRef(onCycle);
  const [index, setIndex] = useState(0);
  const [drawError, setDrawError] = useState<string | null>(null);

  useEffect(() => {
    onCycleRef.current = onCycle;
  }, [onCycle]);

  // Encoding is pure and cheap, so it happens during render rather than in an
  // effect. The same session id goes inside the CBOR payload as well as into
  // every frame header, and the vault compares the two — see AGQP-SPEC.md
  // section 2. Both copies come from this one `sid`, so they agree here by
  // construction; the point of the check is the case where they do not.
  const encoded = useMemo(() => {
    try {
      return { frames: encodeFrames(payload, { sid, size }), error: null };
    } catch (err) {
      return { frames: [] as string[], error: (err as Error).message };
    }
  }, [payload, sid, size]);

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

  // The frame index is the page's to caption. /sign draws a segmented bar
  // from the same onCycle, and a figcaption under it would be the same fact
  // twice in two shapes.
  return (
    <canvas
      ref={canvasRef}
      width={px}
      height={px}
      className={className}
      {...(className
        ? {}
        : {
            style: {
              width: "100%",
              maxWidth: px,
              height: "auto",
              borderRadius: 8,
              background: "#fff",
            },
          })}
      role="img"
      aria-label={`Order frame ${index + 1} of ${frames.length}. Point the vault camera at this screen.`}
    />
  );
}
