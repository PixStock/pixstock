import { useState } from "react";
import { encodeSessionId, encodeSignatureResponse, type SignRequest } from "@pixstock/agqp";
import type { OrderTicket } from "@pixstock/tx-policy";
import { signWith, type VaultBlob } from "@pixstock/vault-crypto";
import { QrCode } from "../components/QrCode";
import { confirmBiometric, storedCredential } from "../vault/biometric";

export interface SignProps {
  blob: VaultBlob;
  request: SignRequest;
  ticket: OrderTicket;
  onDone: () => void;
}

/**
 * Step 3: confirm with the master password, then show the reply.
 *
 * The order was read and checked on the previous screen; what is confirmed
 * here is the ticket, not a byte count. The signature covers the transaction
 * message itself — the relayer attaches it to the message it already holds,
 * which is why only sixty-four bytes need to travel back.
 */
export function Sign({ blob, request, ticket, onDone }: SignProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [biometric, setBiometric] = useState<"passed" | "absent" | null>(null);

  const enrolled = storedCredential() !== null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      // The phone's own check, in front of the password and bound to these
      // exact bytes. A refusal stops here: a rejected biometric is not
      // permission to carry on to the key.
      const passed = await confirmBiometric(request.txs[0]!);
      setBiometric(passed ? "passed" : "absent");

      // Signed over the transaction message itself, not over the payload that
      // carried it — the relayer attaches this to the message it already holds.
      const signature = await signWith(blob, password, request.txs[0]!);
      setReply(
        encodeSignatureResponse(request.sid, [signature])
      );
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
            Sixty-four bytes of signature, for session{" "}
            <span className="num">{encodeSessionId(request.sid)}</span>. The
            transaction never comes back — the laptop already has it.
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

      <div className="ticket ticket--compact">
        <p className="ticket-kind">{ticket.kind}</p>
        <dl className="ticket-lines">
          {ticket.lines.map((line, i) => (
            <div key={i} className={`ticket-line ticket-line--${line.direction}`}>
              <dt>{line.direction === "in" ? "You pay" : "You receive"}</dt>
              <dd>
                <span className="num">{line.amount}</span> {line.symbol}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="muted">
        {enrolled
          ? "This phone will ask for your fingerprint or face before it signs, and the check covers these exact bytes."
          : "No biometric is enrolled on this phone, so the master password is the only thing in front of your key."}
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

      {biometric === "absent" && (
        <p className="alert" role="note">
          Signed without a biometric check: none is enrolled on this device.
        </p>
      )}

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
