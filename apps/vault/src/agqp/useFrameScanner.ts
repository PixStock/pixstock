import { useCallback, useEffect, useRef, useState } from "react";
import { FrameAssembler, type AssemblerProgress } from "@pixstock/agqp";

export type ScannerState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "scanning"; received: number; total: number; ignored: number }
  | { status: "done"; payload: Uint8Array; sid: string; elapsedMs: number; frames: number }
  | { status: "error"; message: string };

/** No camera, no decode loop — the phone gave up waiting. */
export const SCAN_TIMEOUT_MS = 20_000;

/**
 * Camera → QR decode → AGQP reassembly.
 *
 * Everything here runs on device. `getUserMedia` opens a local camera and
 * `BarcodeDetector` is native: the vault performs no network I/O of any kind,
 * which is the whole promise — see docs/THREAT-MODEL.md.
 */
export function useFrameScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>({ status: "idle" });

  const assembler = useRef(new FrameAssembler());
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);

  const stop = useCallback(() => {
    running.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  /** Feeds one decoded string in. Exposed so the paste channel shares the path. */
  const pushText = useCallback((text: string): AssemblerProgress => {
    const progress = assembler.current.push(text);
    if (progress.done && progress.payload) {
      setState({
        status: "done",
        payload: progress.payload,
        sid: assembler.current.sessionId!,
        elapsedMs: 0,
        frames: progress.total,
      });
    } else {
      setState({
        status: "scanning",
        received: progress.received,
        total: progress.total,
        ignored: assembler.current.ignored,
      });
    }
    return progress;
  }, []);

  const reset = useCallback(() => {
    assembler.current.reset();
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (typeof BarcodeDetector === "undefined") {
      setState({
        status: "error",
        message:
          "This browser has no built-in QR decoder. Use the paste channel below, " +
          "or open the vault in Chrome on Android.",
      });
      return;
    }

    setState({ status: "starting" });
    assembler.current.reset();

    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch (err) {
      setState({ status: "error", message: `Camera unavailable: ${(err as Error).message}` });
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream.current;
    await video.play();

    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const startedAt = performance.now();
    running.current = true;
    setState({ status: "scanning", received: 0, total: 0, ignored: 0 });

    const tick = async () => {
      if (!running.current) return;

      if (performance.now() - startedAt > SCAN_TIMEOUT_MS) {
        stop();
        setState({
          status: "error",
          message: "Nothing decoded for 20 seconds. Move the phone closer, or further away.",
        });
        return;
      }

      try {
        for (const barcode of await detector.detect(video)) {
          const progress = assembler.current.push(barcode.rawValue);
          if (progress.done && progress.payload) {
            stop();
            setState({
              status: "done",
              payload: progress.payload,
              sid: assembler.current.sessionId!,
              elapsedMs: Math.round(performance.now() - startedAt),
              frames: progress.total,
            });
            return;
          }
          setState({
            status: "scanning",
            received: progress.received,
            total: progress.total,
            ignored: assembler.current.ignored,
          });
        }
      } catch {
        // A dropped frame is not an error worth surfacing: the sender cycles.
      }

      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop, reset, pushText };
}
