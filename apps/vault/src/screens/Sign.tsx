import { useEffect, useState } from "react";
import { encodeSessionId, encodeSignatureResponse, type SignRequest } from "@pixstock/agqp";
import type { OrderTicket } from "@pixstock/tx-policy";
import { signWith, type VaultBlob } from "@pixstock/vault-crypto";
import { QrCode } from "../components/QrCode";
import { confirmBiometric, storedCredential } from "../vault/biometric";

export interface SignProps {
  blob: VaultBlob;
  request: SignRequest;
  ticket: OrderTicket;
  /** True once the reply QR is up, so the rail can move to step 3. */
  onReplying?: (replying: boolean) => void;
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
export function Sign({ blob, request, ticket, onReplying, onDone }: SignProps) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [biometric, setBiometric] = useState<"passed" | "absent" | null>(null);

  const enrolled = storedCredential() !== null;

  // Told to the chrome rather than read from it: App owns the rail, and the
  // reply only exists once the signature has been produced here.
  useEffect(() => {
    onReplying?.(reply !== null);
  }, [reply, onReplying]);

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
          <h2>Hold this up to the webcam</h2>
        </header>

        <QrCode text={reply} px={480} className="qr qr--full" />

        <dl className="reply-meta">
          <dt>Session</dt>
          <dd>{encodeSessionId(request.sid)}</dd>
        </dl>

        <button type="button" className="btn btn--solid btn--wide" onClick={onDone}>
          The laptop has it — done
        </button>

        <p className="closing">Nothing left this phone but a signature.</p>
      </section>
    );
  }

  const pay = ticket.lines.filter((line) => line.direction === "in");
  const receive = ticket.lines.filter((line) => line.direction === "out");

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <h2>Confirm what you approved</h2>
      </header>

      <dl className="recap">
        {pay.map((line, i) => (
          <div key={`pay-${i}`} className="recap-row">
            <dt>You pay</dt>
            <dd>
              <span className="num">{line.amount}</span> <span className="sym">{line.symbol}</span>
            </dd>
          </div>
        ))}
        {receive.map((line, i) => (
          <div key={`get-${i}`} className="recap-row recap-row--out">
            <dt>You receive</dt>
            <dd>
              <span className="num">{line.amount}</span> <span className="sym">{line.symbol}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className={`biometric${enrolled ? " biometric--on" : ""}`}>
        <span className="biometric-ring" aria-hidden="true">
          {enrolled ? "✓" : "—"}
        </span>
        <p>
          {enrolled
            ? "Your fingerprint is checked first, and the check covers these exact bytes."
            : "No fingerprint on this phone, so the master password stands alone."}
        </p>
      </div>

      <label className="field field--tall">
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

      <div className="stack stack--tight">
        <button
          type="button"
          className="btn btn--solid btn--wide"
          disabled={password.length === 0 || busy}
          onClick={() => void confirm()}
        >
          {busy ? "Signing…" : "Sign this order"}
        </button>
        <div className="btn-pair">
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
