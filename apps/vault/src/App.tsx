import { ASSETS } from "@pixstock/shared";

/**
 * Scaffold only. The screens listed in docs/ARCHITECTURE.md go here:
 * onboarding, home (pubkey + PAIR QR), scanner, verification, signing,
 * backup, settings.
 *
 * Hard rule for everything under apps/vault: no `fetch`, no `XMLHttpRequest`,
 * no WebSocket, no third-party script. The lint config enforces it.
 */
export function App() {
  return (
    <main>
      <h1>PixStock Vault</h1>
      <p>Offline signer. This app never connects to anything.</p>
      <p>{ASSETS.length} assets known.</p>
    </main>
  );
}
