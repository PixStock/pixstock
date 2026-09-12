import type { Metadata } from "next";
import { SignHarness } from "./SignHarness";

export const metadata: Metadata = {
  title: "Send to vault",
  description: "Animated QR transfer of a Solana order to an offline vault.",
  robots: { index: false, follow: false },
};

/**
 * The optical channel, end to end on the sending side.
 *
 * Until the relayer builds real orders this runs on synthetic payloads sized
 * from the measured budget, which is exactly what the measurement day needs:
 * a rig to sweep frame size against frame rate against phone.
 */
export default function SignPage() {
  return (
    <main id="main" className="band">
      <div className="shell" style={{ display: "grid", gap: 24, maxWidth: 720 }}>
        <header style={{ display: "grid", gap: 8 }}>
          <p className="eyebrow">AGQP v1</p>
          <h1>Send to vault</h1>
          <p className="lede" style={{ margin: 0 }}>
            Point the vault camera at this screen. The frames cycle forever, so
            it can join anywhere — there is nothing to time and nothing to
            click.
          </p>
        </header>

        <SignHarness />
      </div>
    </main>
  );
}
