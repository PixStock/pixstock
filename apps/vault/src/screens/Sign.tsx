import { useState } from "react";
import { decodeSessionId, encodeSignatureResponse } from "@pixstock/agqp";
import { signWith, type VaultBlob } from "@pixstock/vault-crypto";
import { QrCode } from "../components/QrCode";

export interface SignProps {
  blob: VaultBlob;
  payload: Uint8Array;
  /** Session id of the frames that carried this order, echoed in the reply. */
  sid: string;
  onDone: () => void;
}

/**
 * Step 3: confirm, sign, show the reply.
 *
 * What is missing before this is honest: the payload is still opaque bytes.
 * The CBOR decode, the Pyth verification and the P1..P10 policy all belong
 * between the scan and this screen, and the order ticket they produce is
 * what the holder should be confirming — not a byte count. Until then this
 * screen says plainly that it is signing something it cannot read, which is
 * exactly the blind signing the product exists to abolish.
 */
export function Sign({ blob, payload, sid, onDone }: SignProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const signature = await signWith(blob, password, payload);
      setReply(encodeSignatureResponse(decodeSessionId(sid), [signature]));
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (reply) {
    return (
      <section className="stack">
        <header className="stack stack--tight">
          <p className="eyebrow">Step 3</p>
          <h2>Show this to the webcam</h2>
          <p className="lede">
            Sixty-four bytes of signature. The transaction never comes back —
            the laptop already has it.
          </p>
        </header>

        <QrCode text={reply} px={320} />

        <div className="row">
          <button type="button" className="btn" onClick={onDone}>
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Step 2</p>
        <h2>Confirm and sign</h2>
      </header>

      <p className="alert" role="note">
        <strong>This order is not readable yet.</strong> The decoder, the Pyth
        price check and the signing policy are not built, so the vault cannot
        tell you what it is about to sign. Do not use this with a funded
        vault.
      </p>

      <p className="muted">
        Payload <span className="num">{payload.length}</span> bytes.
      </p>

      <label className="field">
        <span>Master password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className="btn btn--solid"
          disabled={password.length === 0 || busy}
          onClick={() => void confirm()}
        >
          {busy ? "Signing…" : "Sign"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </section>
  );
}
