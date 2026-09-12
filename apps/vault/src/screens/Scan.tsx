import { useState } from "react";
import { useFrameScanner } from "../agqp/useFrameScanner";

const hex = (bytes: Uint8Array, limit = 32) =>
  Array.from(bytes.slice(0, limit), (b) => b.toString(16).padStart(2, "0")).join(" ") +
  (bytes.length > limit ? " …" : "");

export function Scan({ onScanned }: { onScanned: (payload: Uint8Array, sid: string) => void }) {
  const { videoRef, state, start, stop, reset, pushText } = useFrameScanner();
  const [pasted, setPasted] = useState("");

  const scanning = state.status === "scanning";
  const progress = scanning ? state : null;

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Step 1</p>
        <h2>Scan the order</h2>
        <p className="lede">
          Point the camera at the laptop screen. The frames cycle, so there is
          nothing to time.
        </p>
      </header>

      <div className="viewport">
        <video ref={videoRef} playsInline muted className="viewport-video" />
        {!scanning && <div className="viewport-idle">Camera off</div>}
      </div>

      {progress && (
        <p className="progress" role="status" aria-live="polite">
          <strong className="num">{progress.received}</strong>
          <span> / </span>
          <span className="num">{progress.total || "?"}</span>
          <span> frames</span>
          {progress.ignored > 0 && (
            <span className="muted"> · {progress.ignored} discarded</span>
          )}
        </p>
      )}

      {state.status === "error" && (
        <p className="alert" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="result">
          <p>
            <strong>Order received.</strong>{" "}
            <span className="num">{state.payload.length}</span> bytes
            {state.elapsedMs > 0 && (
              <>
                {" in "}
                <span className="num">{state.elapsedMs}</span> ms
              </>
            )}
            .
          </p>
          <pre className="bytes">{hex(state.payload)}</pre>
          <div className="row">
            <button
              type="button"
              className="btn btn--solid"
              onClick={() => onScanned(state.payload, state.sid)}
            >
              Continue
            </button>
          </div>
          <p className="muted">
            The CBOR decode, the Pyth check and the signing policy belong here,
            between the scan and the signature — see docs/ARCHITECTURE.md.
          </p>
        </div>
      )}

      <div className="row">
        {scanning || state.status === "starting" ? (
          <button type="button" className="btn" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" className="btn btn--solid" onClick={() => void start()}>
            Start camera
          </button>
        )}
        {state.status !== "idle" && (
          <button type="button" className="btn" onClick={reset}>
            Reset
          </button>
        )}
      </div>

      <details className="glued">
        <summary>Glued channel</summary>
        <p className="muted">
          Paste frame text instead of scanning it. Same code path as the camera
          — it is how the end-to-end test runs in CI, and how someone with a
          single device can still follow the flow.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="PS1:..."
          rows={3}
          spellCheck={false}
        />
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              for (const line of pasted.split("\n").map((l) => l.trim()).filter(Boolean)) {
                pushText(line);
              }
              setPasted("");
            }}
          >
            Feed frames
          </button>
        </div>
      </details>
    </section>
  );
}
