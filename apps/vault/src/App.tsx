import { useEffect, useState } from "react";
import { Scan } from "./screens/Scan";

/**
 * Offline signer. The screens in docs/ARCHITECTURE.md land here one by one;
 * today it is the scanner and the air-gap indicator.
 *
 * Hard rule for everything under apps/vault: no `fetch`, no `XMLHttpRequest`,
 * no WebSocket, no third-party script. The lint config fails the build on
 * any of them — see docs/THREAT-MODEL.md.
 */
export function App() {
  const [online, setOnline] = useState(false);

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

        <Scan />
      </div>
    </main>
  );
}
