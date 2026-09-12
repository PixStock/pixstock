"use client";

import { useCallback, useRef, useState } from "react";
import { parseFrame, parseSignatureResponse } from "@pixstock/agqp";
import { content } from "@/content/site";

type State =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "read"; text: string; recognised: string }
  | { status: "error"; message: string };

/**
 * Reads whatever the vault is showing.
 *
 * Pairing records are part of the structured payload layer, which is not
 * built — so this reports what it recognises rather than pretending to pair.
 * An interface that claimed a vault was paired when nothing was decoded would
 * be the first lie in a product whose whole argument is that it does not lie
 * to you.
 */
export function PairingScanner() {
  const v = content.vault;
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const [state, setState] = useState<State>({ status: "idle" });

  const stop = useCallback(() => {
    running.current = false;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setState((current) => (current.status === "scanning" ? { status: "idle" } : current));
  }, []);

  const recognise = (text: string): string | null => {
    if (parseFrame(text)) return "an order frame (AGQP request)";
    if (parseSignatureResponse(text)) return "a signature reply";
    if (text.startsWith("PVLT:")) return "a Paper-Vault backup — do not scan that here";
    return null;
  };

  const start = useCallback(async () => {
    if (typeof BarcodeDetector === "undefined") {
      setState({
        status: "error",
        message: "This browser has no built-in QR decoder. Open the vault in Chrome on Android.",
      });
      return;
    }

    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
      setState({ status: "error", message: `Webcam unavailable: ${(err as Error).message}` });
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream.current;
    await video.play();

    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    running.current = true;
    setState({ status: "scanning" });

    const tick = async () => {
      if (!running.current) return;
      try {
        for (const barcode of await detector.detect(video)) {
          const recognised = recognise(barcode.rawValue);
          if (recognised) {
            running.current = false;
            stream.current?.getTracks().forEach((t) => t.stop());
            stream.current = null;
            setState({ status: "read", text: barcode.rawValue.slice(0, 40), recognised });
            return;
          }
        }
      } catch {
        // Dropped frame. The vault holds its code up; we try again.
      }
      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, []);

  return (
    <div className="stack-24">
      <div className="notice">
        <h3>{v.pending.title}</h3>
        <p className="copy">{v.pending.body}</p>
      </div>

      {state.status === "scanning" && (
        <video ref={videoRef} playsInline muted className="webcam" />
      )}

      {state.status === "error" && <p className="alert-inline">{state.message}</p>}

      {state.status === "read" && (
        <p className="copy">
          Read {state.recognised}. <span className="muted">{state.text}…</span>
        </p>
      )}

      <div className="row-wrap">
        {state.status === "scanning" ? (
          <button type="button" className="btn" onClick={stop}>
            {v.pairing.stopLabel}
          </button>
        ) : (
          <button type="button" className="btn btn--solid" onClick={() => void start()}>
            {v.pairing.scanLabel}
          </button>
        )}
      </div>
    </div>
  );
}
