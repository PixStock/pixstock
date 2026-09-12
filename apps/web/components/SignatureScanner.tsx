"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSignatureResponse, type SignatureResponse } from "@pixstock/agqp";

type State =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "done"; response: SignatureResponse }
  | { status: "error"; message: string };

/**
 * Reads the vault's reply off the webcam. Sixty-four bytes come back, not the
 * transaction — this side still holds the message it sent.
 *
 * Same fallback ladder as the vault: the native BarcodeDetector where it
 * exists, and a paste box everywhere else, which is also how the end-to-end
 * test runs without a camera.
 */
export function SignatureScanner({ expectedSid }: { expectedSid?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const [pasted, setPasted] = useState("");

  const stop = useCallback(() => {
    running.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const accept = useCallback(
    (text: string): boolean => {
      const response = parseSignatureResponse(text);
      if (!response) return false;

      // A reply from another session is a reply to another order. Refusing it
      // is what stops a stale QR still on screen from being broadcast.
      if (expectedSid && response.sid !== expectedSid) {
        setState({
          status: "error",
          message: `This signature answers session ${response.sid}, not ${expectedSid}.`,
        });
        return true;
      }

      setState({ status: "done", response });
      return true;
    },
    [expectedSid]
  );

  const start = useCallback(async () => {
    if (typeof BarcodeDetector === "undefined") {
      setState({
        status: "error",
        message: "This browser has no built-in QR decoder. Paste the reply instead.",
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
          if (accept(barcode.rawValue)) {
            stop();
            return;
          }
        }
      } catch {
        // Dropped frame; the vault holds the code up until we read it.
      }
      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, [accept, stop]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {state.status === "scanning" && (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", maxWidth: 420, borderRadius: 10, background: "#000" }}
        />
      )}

      {state.status === "error" && (
        <p role="alert" style={{ color: "var(--crit)", margin: 0 }}>
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>
            <strong>Signature received.</strong>{" "}
            <span className="num">{state.response.signatures.length}</span> signature
            {state.response.signatures.length === 1 ? "" : "s"}, session{" "}
            <span className="num">{state.response.sid}</span>.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--rule)",
              fontFamily: "var(--mono)",
              fontSize: 12.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {Array.from(state.response.signatures[0]!.slice(0, 24), (b) =>
              b.toString(16).padStart(2, "0")
            ).join(" ")}{" "}
            …
          </pre>
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
            Next: attach it to the message, co-sign as fee payer, broadcast.
          </p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state.status === "scanning" ? (
          <button type="button" className="btn" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => void start()}>
            Scan with webcam
          </button>
        )}
      </div>

      <details>
        <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontSize: 14 }}>
          Glued channel
        </summary>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="SIGR:..."
            rows={3}
            spellCheck={false}
            style={{
              width: "100%",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--ink)",
              background: "var(--surface)",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              padding: 10,
            }}
          />
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (!accept(pasted.trim())) {
                  setState({ status: "error", message: "That is not a signature reply." });
                }
                setPasted("");
              }}
            >
              Read reply
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}
