import { useCallback, useEffect, useRef, useState } from "react";

export type CodeScannerState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "scanning" }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

/** Long enough to line up a printed sheet, short enough not to hang. */
export const CODE_SCAN_TIMEOUT_MS = 30_000;

/**
 * Camera → one QR code. Nothing is reassembled.
 *
 * A Paper-Vault is a single code, not an AGQP stream, so this reads one and
 * stops. Like everything else on this device it runs entirely locally:
 * `getUserMedia` opens a camera, `BarcodeDetector` is native, and no bytes
 * leave — see docs/THREAT-MODEL.md.
 */
export function useCodeScanner(accepts: (text: string) => boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CodeScannerState>({ status: "idle" });

  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const accept = useRef(accepts);
  accept.current = accepts;

  const stop = useCallback(() => {
    running.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    setState({ status: "idle" });
  }, [stop]);

  const start = useCallback(async () => {
    if (typeof BarcodeDetector === "undefined") {
      setState({
        status: "error",
        message:
          "This browser has no built-in QR decoder. Type the code in below, " +
          "or open the vault in Chrome on Android.",
      });
      return;
    }

    setState({ status: "starting" });

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
    setState({ status: "scanning" });

    const tick = async () => {
      if (!running.current) return;

      if (performance.now() - startedAt > CODE_SCAN_TIMEOUT_MS) {
        stop();
        setState({
          status: "error",
          message: "Nothing decoded. Move the phone closer, or type the code in below.",
        });
        return;
      }

      try {
        for (const barcode of await detector.detect(video)) {
          // Anything else in shot is ignored rather than reported: a printed
          // sheet often sits next to other codes.
          if (accept.current(barcode.rawValue)) {
            stop();
            setState({ status: "done", text: barcode.rawValue });
            return;
          }
        }
      } catch {
        // A dropped frame is not worth surfacing.
      }

      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop, reset };
}
