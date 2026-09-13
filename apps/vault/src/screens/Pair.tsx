import { useMemo } from "react";
import { encodeFrames, encodePayload, newSessionId } from "@pixstock/agqp";
import { base58 } from "@scure/base";
import type { VaultBlob } from "@pixstock/vault-crypto";
import { QrCode } from "../components/QrCode";

/**
 * Handing the laptop this vault's address, by showing it.
 *
 * A public key is not a secret, so nothing here is protected — what it saves
 * is the transcription of forty-four base58 characters by hand, which is
 * where a holder sends money to the wrong place. The record travels as one
 * AGQP frame, the same envelope orders use, so the web app has one decoder
 * rather than two.
 *
 * What it deliberately does not do is prove anything. A scanned address is
 * still just an address: the vault checks that an order names its own key
 * before it reads a single amount, which is where that guarantee belongs.
 */
export function Pair({ blob, onDone }: { blob: VaultBlob; onDone: () => void }) {
  const vault = base58.encode(blob.publicKey);

  const frame = useMemo(() => {
    const payload = encodePayload({
      kind: "PAIR",
      vault,
      label: "PixStock Vault",
      network: "mainnet",
    });
    return encodeFrames(payload, { sid: newSessionId() })[0]!;
  }, [vault]);

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Pairing</p>
        <h2>Show this to the laptop</h2>
        <p className="lede">
          Your vault&rsquo;s address, so the web app can build orders for it. A public key: it
          cannot spend anything, and nothing secret is on this screen.
        </p>
      </header>

      <QrCode text={frame} px={280} />

      <p className="muted num" style={{ wordBreak: "break-all" }}>
        {vault}
      </p>

      <div className="row">
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}
