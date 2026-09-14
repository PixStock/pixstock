"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseSignatureResponse, type SignatureResponse } from "@pixstock/agqp";
import { makeDecoder } from "@/lib/qr-decoder";
import { openCamera } from "@/lib/camera";

type State =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "scanning" }
  | { status: "done"; response: SignatureResponse }
  | { status: "error"; message: string };

/** Nothing decoded for this long and the scan gives up, saying so. */
const SCAN_TIMEOUT_MS = 20_000;

/**
 * Reads the vault's reply off the webcam. Sixty-four bytes come back, not the
 * transaction — this side still holds the message it sent.
 *
 * Same fallback ladder as the vault: the native BarcodeDetector where it
 * exists, and a paste box everywhere else, which is also how the end-to-end
 * test runs without a camera.
 */
export function SignatureScanner({
  expectedSid,
  onSignatures,
  busy,
}: {
  expectedSid?: string;
  /** Called once a reply for this session is read. */
  onSignatures?: (signatures: Uint8Array[]) => void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const running = useRef(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const [pasted, setPasted] = useState("");
  // Held in a ref so a new callback identity does not restart the scan loop.
  const onSignaturesRef = useRef(onSignatures);
  useEffect(() => {
    onSignaturesRef.current = onSignatures;
  }, [onSignatures]);

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
      onSignaturesRef.current?.(response.signatures);
      return true;
    },
    [expectedSid]
  );

  const start = useCallback(async () => {
    setState({ status: "starting" });

    try {
      stream.current = await openCamera();
    } catch (err) {
      setState({ status: "error", message: `Webcam unavailable: ${(err as Error).message}` });
      return;
    }

    // The element is rendered unconditionally, so this ref is populated
    // whatever the state. It was once mounted only while `scanning`, which
    // made it null at exactly this line — and the early return below fired
    // silently, after the camera had already been granted and switched on.
    // The symptom was a button that did nothing, with the webcam light lit.
    const video = videoRef.current;
    if (!video) {
      stop();
      setState({ status: "error", message: "The video element is missing; reload the page." });
      return;
    }
    video.srcObject = stream.current;
    await video.play();

    const decode = makeDecoder();
    const startedAt = performance.now();
    running.current = true;
    setState({ status: "scanning" });

    const tick = async () => {
      if (!running.current) return;

      if (performance.now() - startedAt > SCAN_TIMEOUT_MS) {
        stop();
        setState({
          status: "error",
          message: "Nothing decoded for 20 seconds. Hold the phone steady, and fill the frame.",
        });
        return;
      }

      try {
        for (const text of await decode(video)) {
          if (accept(text)) {
            stop();
            return;
          }
        }
      } catch {
        // A dropped frame is not worth surfacing: the vault holds the code up
        // on screen until we read it.
      }
      requestAnimationFrame(() => void tick());
    };

    void tick();
  }, [accept, stop]);

  const scanning = state.status === "scanning" || state.status === "starting";

  return (
    <div className="wayback">
      <div className="wayback-head">
        <span className="eyebrow">The way back</span>
        <span className={`wayback-state${scanning ? " wayback-state--on" : ""}`}>
          {scanning ? "webcam open" : "webcam off"}
        </span>
      </div>

      {/*
        Always mounted, never conditional. The ref has to exist before
        `start()` reads it, and rendering this only while scanning is the bug
        that made the button appear dead.
      */}
      <video ref={videoRef} playsInline muted className="webcam-box" />

      {state.status === "starting" && (
        <p style={{ color: "var(--ink-3)", margin: 0, fontSize: 13 }}>Opening the webcam…</p>
      )}

      {state.status === "error" && (
        <p role="alert" style={{ color: "var(--crit)", margin: 0, fontSize: 13.5 }}>
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
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
            {busy ? "Sending it to the relayer…" : "Next: co-sign as fee payer, then broadcast."}
          </p>
        </div>
      )}

      {scanning ? (
        <button
          type="button"
          className="btn cta cta--wayback"
          onClick={() => {
            stop();
            setState({ status: "idle" });
          }}
        >
          Stop watching
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--solid cta cta--wayback"
          onClick={() => void start()}
        >
          Open the webcam and watch for the signature
        </button>
      )}

      <p className="cta-note">Or paste the reply text if this machine has no camera.</p>

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
