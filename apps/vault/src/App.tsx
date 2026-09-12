import { useEffect, useState } from "react";
import type { VaultBlob } from "@pixstock/vault-crypto";
import { Scan } from "./screens/Scan";
import { Setup } from "./screens/Setup";
import { Sign } from "./screens/Sign";
import { loadBlob } from "./vault/storage";

type Screen =
  | { name: "setup" }
  | { name: "scan" }
  | { name: "sign"; payload: Uint8Array; sid: string };

/**
 * Offline signer. The screens in docs/ARCHITECTURE.md land here one by one:
 * onboarding, scan, verification, signing, backup, settings. Verification —
 * the CBOR decode, the Pyth check, the P1..P10 policy and the readable order
 * ticket — is the gap between scan and sign, and it is not built.
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
          />
        ) : screen.name === "scan" ? (
          <Scan onScanned={(payload, sid) => setScreen({ name: "sign", payload, sid })} />
        ) : (
          blob && (
            <Sign
              blob={blob}
              payload={screen.payload}
              sid={screen.sid}
              onDone={() => setScreen({ name: "scan" })}
            />
          )
        )}
      </div>
    </main>
  );
}
