import { useEffect, useState } from "react";
import { useFrameScanner } from "../agqp/useFrameScanner";

const hex = (bytes: Uint8Array, limit = 32) =>
  Array.from(bytes.slice(0, limit), (b) => b.toString(16).padStart(2, "0")).join(" ") +
  (bytes.length > limit ? " …" : "");

/**
 * Step 1: read the order off the laptop.
 *
 * There is no Continue button. A scan that completed is a scan that completed;
 * asking for a click to confirm it made the crossing look like it had two
 * steps when it has one, and put a press between the holder and the screen
 * they actually need to read.
 */
export function Scan({
  onScanned,
  onPair,
  onSettings,
}: {
  /**
   * The bytes, how many frames they arrived in — the ticket says so — and the
   * session id those frames carried, which Review compares against the one
   * inside the payload.
   */
  onScanned: (payload: Uint8Array, frames: number, sid: string) => void;
  onPair: () => void;
  onSettings: () => void;
}) {
  const { videoRef, state, start, stop, reset, pushText } = useFrameScanner();
  const [pasted, setPasted] = useState("");

  const scanning = state.status === "scanning";
  const running = scanning || state.status === "starting";

  // Straight through to Review. In an effect rather than in the assembler's
  // callback: the payload arrives mid-render otherwise.
  const done = state.status === "done" ? state : null;
  useEffect(() => {
    if (done) onScanned(done.payload, done.frames, done.sid);
  }, [done, onScanned]);

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <h2>Point at the laptop</h2>
        <p className="lede">
          The frames repeat forever. There is nothing to time and nothing to
          press over there.
        </p>
      </header>

      <div className="viewport">
        <video ref={videoRef} playsInline muted className="viewport-video" />
        {!scanning && <div className="viewport-idle">Camera off</div>}
        <span className="bracket bracket--tl" aria-hidden="true" />
        <span className="bracket bracket--tr" aria-hidden="true" />
        <span className="bracket bracket--bl" aria-hidden="true" />
        <span className="bracket bracket--br" aria-hidden="true" />
      </div>

      {scanning && (
        <div className="stack stack--tight" role="status" aria-live="polite">
          {/*
            The total is only known once a frame has been read, so until then
            there is nothing to divide the bar into and the count says so.
          */}
          {state.total > 0 && (
            <div className="frames" aria-hidden="true">
              {Array.from({ length: state.total }, (_, i) => (
                <span key={i} className={`frame-seg${i < state.received ? " frame-seg--got" : ""}`} />
              ))}
            </div>
          )}
          <div className="frames-line">
            <p className="frames-count">
              <span className="num">{state.received}</span> of{" "}
              <span className="num">{state.total || "?"}</span> frames
            </p>
            {state.ignored > 0 && (
              <p className="frames-drop">
                <span className="num">{state.ignored}</span> discarded
              </p>
            )}
          </div>
        </div>
      )}

      {state.status === "error" && (
        <p className="alert" role="alert">
          {state.message}
        </p>
      )}

      <div className="stack stack--tight">
        {running ? (
          <button type="button" className="btn btn--wide" onClick={stop}>
            Stop the camera
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--solid btn--wide"
            onClick={() => void start()}
          >
            Start camera
          </button>
        )}

        {/* Only while there is something to abandon. */}
        {running && (
          <div className="btn-pair">
            <button type="button" className="btn" onClick={reset}>
              Reset
            </button>
          </div>
        )}

        <div className="btn-pair">
          <button
            type="button"
            className="btn"
            onClick={() => {
              stop();
              onPair();
            }}
          >
            My address
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              stop();
              onSettings();
            }}
          >
            Settings
          </button>
        </div>
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

        {/* The bytes themselves. A debugging aid, which is why it lives here
            and not on the path a holder walks. */}
        {done && (
          <div className="result">
            <p>
              <strong>Order received.</strong>{" "}
              <span className="num">{done.payload.length}</span> bytes
              {done.elapsedMs > 0 && (
                <>
                  {" in "}
                  <span className="num">{done.elapsedMs}</span> ms
                </>
              )}
              .
            </p>
            <pre className="bytes">{hex(done.payload)}</pre>
          </div>
        )}
      </details>
    </section>
  );
}
