import { useEffect, useState } from "react";
import type { SignRequest } from "@pixstock/agqp";
import type { OrderTicket } from "@pixstock/tx-policy";
import type { VaultBlob } from "@pixstock/vault-crypto";
import { base58 } from "@scure/base";
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
  | { name: "review"; payload: Uint8Array }
  | { name: "sign"; request: SignRequest; ticket: OrderTicket };

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

  return (
    <main>
      <div className="stack">
        <header className="stack stack--tight">
          <h1>PixStock Vault</h1>
          <p className="lede">This app never connects to anything.</p>
        </header>

        <p className={`airgap ${online ? "airgap--online" : "airgap--offline"}`}>
          <span className="dot" aria-hidden="true" />
          {online
            ? "This device has a network. Turn on airplane mode before signing."
            : "Offline. Nothing can leave this device."}
        </p>

        {/*
          Offered rather than left to Chrome's own menu. A tab is not a signer:
          it closes by accident, has no icon to open, and on a phone with no
          network it reads as a broken website. Installed, everything is
          precached and the app runs with the radios off.
        */}
        {install.status === "ready" && (
          <div className="notice">
            <h3>Install this on the phone</h3>
            <p className="copy">
              It runs from the home screen with no network at all. That is the point:
              turn on airplane mode afterwards and nothing here stops working.
            </p>
            <div className="row">
              <button type="button" className="btn btn--solid" onClick={() => void install.install()}>
                Install
              </button>
            </div>
          </div>
        )}

        {install.status === "manual" && (
          <p className="muted">Install it on the home screen: {install.how}</p>
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
            onScanned={(payload) => setScreen({ name: "review", payload })}
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
              vault={base58.encode(blob.publicKey)}
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
              onDone={() => setScreen({ name: "scan" })}
            />
          )
        )}
      </div>
    </main>
  );
}
