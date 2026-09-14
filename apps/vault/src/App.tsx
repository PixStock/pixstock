import { useEffect, useState } from "react";
import { encodeSessionId, type SignRequest } from "@pixstock/agqp";
import type { OrderTicket } from "@pixstock/tx-policy";
import type { VaultBlob } from "@pixstock/vault-crypto";
import { base58 } from "@scure/base";
import { Mark } from "./components/Mark";
import { Pair } from "./screens/Pair";
import { Restore } from "./screens/Restore";
import { Review } from "./screens/Review";
import { Scan } from "./screens/Scan";
import { Settings } from "./screens/Settings";
import { Setup } from "./screens/Setup";
import { Sign } from "./screens/Sign";
import { loadBlob } from "./vault/storage";
import { useInstallPrompt } from "./vault/useInstallPrompt";

type Screen =
  | { name: "setup" }
  | { name: "restore" }
  | { name: "scan" }
  | { name: "pair" }
  | { name: "settings" }
  | { name: "review"; payload: Uint8Array; frames: number }
  | { name: "sign"; request: SignRequest; ticket: OrderTicket };

/** Where the crossing has got to. Derived from the screen, never stored. */
type Step = "done" | "current" | "future" | "refused";

const STEPS = ["Scan", "Check", "Return"] as const;

/**
 * Offline signer: onboarding, scan, review, sign.
 *
 * Review is the screen the product exists for. It decodes the order, runs the
 * policy against the transaction itself, and shows amounts read from the
 * instructions rather than from the description that travelled with them.
 *
 * Hard rule for everything under apps/vault: no `fetch`, no `XMLHttpRequest`,
 * no WebSocket, no third-party script. The lint config fails the build on any
 * of them — see docs/THREAT-MODEL.md.
 */
export function App() {
  const [online, setOnline] = useState(false);
  const [blob, setBlob] = useState<VaultBlob | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "setup" });
  const [fatal, setFatal] = useState<string | null>(null);
  const install = useInstallPrompt();
  const [showHow, setShowHow] = useState(false);
  // Set by Review when it will not sign, and by Sign once the reply is up.
  // Both are facts about the crossing that only the child screen knows.
  const [refused, setRefused] = useState(false);
  const [replying, setReplying] = useState(false);

  // Reported, never relied upon. A phone in airplane mode is the real control;
  // this only tells the holder when it is not.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = loadBlob();
      if (stored) {
        setBlob(stored);
        setScreen({ name: "scan" });
      }
    } catch (err) {
      setFatal((err as Error).message);
    }
  }, []);

  // Onboarding has a header of its own, and a rail that says "1 Scan" above a
  // password field would be describing a crossing that has not started.
  const chrome = screen.name !== "setup" && screen.name !== "restore";

  const steps = railFor(screen, { refused, replying });
  const counterpart = counterpartFor(screen, { refused, replying });

  return (
    <main>
      {chrome && (
        <div className="chrome">
          <div className="chrome-bar">
            <Mark size={20} />
            <p className="chrome-title">Vault</p>
            <span className={`chip chip--${online ? "warn" : "ok"}`}>
              <span className="dot" aria-hidden="true" />
              {online ? "Radios on" : "Airplane mode"}
            </span>
          </div>

          <div className="rail" role="list" aria-label="Progress">
            {STEPS.map((label, i) => (
              <div key={label} className={`rail-step rail-step--${steps[i]}`} role="listitem">
                <span className="rail-bar" aria-hidden="true" />
                <span className="rail-label">
                  {i + 1} {label}
                </span>
              </div>
            ))}
          </div>

          {counterpart && <p className="counterpart">{counterpart}</p>}

          {/*
            The sentence in full, and only when it is true. As a permanent
            banner it taught everyone to stop reading the one line that would
            have mattered on the one day it did.
          */}
          {online && (
            <p className="alert" role="alert">
              This device has a network. Turn on airplane mode before signing.
            </p>
          )}
        </div>
      )}

      <div className="screen stack">
        {/*
          Shown on the scan screen, with a button either way. A tab is not a
          signer: it closes by accident, has no icon to open, and on a phone
          with the radios off it reads as a broken website rather than one
          working exactly as designed.

          Kept off Review and Sign deliberately — nothing competes with the
          screen where a signature is decided.
        */}
        {install.status !== "installed" && screen.name === "scan" && (
          <div className="notice">
            <h3>Install this on the phone</h3>
            <p className="copy">
              It runs from the home screen with no network at all. That is the point:
              turn on airplane mode afterwards and nothing here stops working.
            </p>
            {install.status === "ready" ? (
              <div className="row">
                <button
                  type="button"
                  className="btn btn--solid"
                  onClick={() => void install.install()}
                >
                  Install
                </button>
              </div>
            ) : (
              <>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--solid"
                    onClick={() => setShowHow(true)}
                  >
                    Install
                  </button>
                </div>
                {showHow && <p className="muted">{install.how}</p>}
              </>
            )}
          </div>
        )}

        {fatal ? (
          <p className="alert" role="alert">
            {fatal}
          </p>
        ) : screen.name === "setup" ? (
          <Setup
            onReady={() => {
              setBlob(loadBlob());
              setScreen({ name: "scan" });
            }}
            onRestore={() => setScreen({ name: "restore" })}
          />
        ) : screen.name === "restore" ? (
          <Restore
            onRestored={() => {
              setBlob(loadBlob());
              setScreen({ name: "scan" });
            }}
            onCancel={() => setScreen({ name: "setup" })}
          />
        ) : screen.name === "scan" ? (
          <Scan
            onScanned={(payload, frames) => {
              setRefused(false);
              setReplying(false);
              setScreen({ name: "review", payload, frames });
            }}
            onPair={() => setScreen({ name: "pair" })}
            onSettings={() => setScreen({ name: "settings" })}
          />
        ) : screen.name === "pair" ? (
          blob && <Pair blob={blob} onDone={() => setScreen({ name: "scan" })} />
        ) : screen.name === "settings" ? (
          blob && <Settings blob={blob} onDone={() => setScreen({ name: "scan" })} />
        ) : screen.name === "review" ? (
          blob && (
            <Review
              payload={screen.payload}
              frames={screen.frames}
              vault={base58.encode(blob.publicKey)}
              onVerdict={setRefused}
              onApprove={(request, ticket) => setScreen({ name: "sign", request, ticket })}
              onReject={() => setScreen({ name: "scan" })}
            />
          )
        ) : (
          blob && (
            <Sign
              blob={blob}
              request={screen.request}
              ticket={screen.ticket}
              onReplying={setReplying}
              onDone={() => {
                setReplying(false);
                setScreen({ name: "scan" });
              }}
            />
          )
        )}
      </div>
    </main>
  );
}

/**
 * The three bars, from the screen alone.
 *
 * Pair and Settings are side trips off the scan screen rather than points in
 * the crossing, so they read as step one: nothing has been scanned, and
 * nothing is owed to the laptop.
 */
function railFor(
  screen: Screen,
  flags: { refused: boolean; replying: boolean },
): [Step, Step, Step] {
  switch (screen.name) {
    case "review":
      return flags.refused
        ? ["done", "refused", "future"]
        : ["done", "current", "future"];
    case "sign":
      return flags.replying ? ["done", "done", "current"] : ["done", "current", "future"];
    default:
      return ["current", "future", "future"];
  }
}

/** What the other screen is doing. The phone is the one that can say it. */
function counterpartFor(
  screen: Screen,
  flags: { refused: boolean; replying: boolean },
): string | null {
  switch (screen.name) {
    case "scan":
      return "laptop → showing the order on /sign";
    case "review":
      return flags.refused
        ? "laptop → still waiting. Ask it for a fresh quote."
        : "laptop → waiting for your signature";
    case "sign":
      return flags.replying
        ? `laptop → webcam is open, looking for session ${encodeSessionId(screen.request.sid)}`
        : "laptop → waiting for your signature";
    default:
      return null;
  }
}
