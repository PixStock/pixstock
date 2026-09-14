import { useState } from "react";
import { base58 } from "@scure/base";
import {
  MIN_PASSWORD_LENGTH,
  encodePaperVault,
  generateVault,
  lock,
  wipe,
} from "@pixstock/vault-crypto";
import { enrolBiometric } from "../vault/biometric";
import { saveBlob } from "../vault/storage";
import { QrCode } from "../components/QrCode";

/**
 * First run, in three steps: pick a password, print the way back, then scan.
 *
 * No Argon2, no AES, no PBKDF on screen. Naming the algorithm tells someone
 * who already knows nothing they need and someone who does not that this is
 * not for them. What both need to know is that there is no reset link.
 *
 * Step three is the scan screen itself, which is why this component only
 * renders two: finishing here lands on it.
 */
export function Setup({ onReady, onRestore }: { onReady: () => void; onRestore: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<{ code: string; publicKey: Uint8Array } | null>(null);
  const [biometric, setBiometric] = useState<"enrolled" | "unavailable" | null>(null);
  const [printed, setPrinted] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  async function create() {
    setBusy(true);
    setError(null);
    const { seed, publicKey } = generateVault();
    try {
      const blob = await lock(seed, password);
      saveBlob(blob);

      // Enrol the phone's own biometric, if it has one. A failure here is not
      // a failure to create a vault: a spare phone with no screen lock is
      // still a perfectly good air-gapped signer, and the signing screen says
      // which of the two it is rather than implying a check that never runs.
      try {
        setBiometric((await enrolBiometric(publicKey)) ? "enrolled" : "unavailable");
      } catch {
        setBiometric("unavailable");
      }

      setPaper({ code: encodePaperVault(blob), publicKey });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      // The seed is locked, or it failed. Either way it stops existing here.
      wipe(seed);
      setBusy(false);
    }
  }

  if (paper) {
    return (
      <section className="stack">
        <Head step={1} />

        <header className="stack stack--tight">
          <h2 className="onboard">Print this. It is the way back.</h2>
          <p className="lede">
            Lose the phone and this sheet is what restores your account. It is
            encrypted with the password you just chose, so a photo of it on its
            own spends nothing.
          </p>
        </header>

        <QrCode text={paper.code} px={480} className="qr qr--full" />

        <dl className="reply-meta">
          <dt>Vault</dt>
          <dd>{short(paper.publicKey)}</dd>
        </dl>

        <p className="muted">
          {biometric === "enrolled"
            ? "This phone will ask for your fingerprint before it signs."
            : "No fingerprint on this phone, so the master password stands alone."}
        </p>

        <label className="gate">
          <input
            type="checkbox"
            checked={printed}
            onChange={(event) => setPrinted(event.target.checked)}
          />
          <span>
            It is printed and somewhere safe. I understand nobody can recover
            this for me.
          </span>
        </label>

        <div className="btn-split">
          <button type="button" className="btn btn--minor" onClick={() => print()}>
            Print
          </button>
          <button
            type="button"
            className="btn btn--solid btn--major"
            disabled={!printed}
            onClick={onReady}
          >
            Continue
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <Head step={0} />

      <header className="stack stack--tight">
        <h2 className="onboard">Pick a password only you know</h2>
        <p className="lede">
          It encrypts the key on this phone. There is no reset link, no support
          desk and no copy anywhere else. Write it down somewhere real before
          you continue.
        </p>
      </header>

      <div className="field field--tall">
        <label htmlFor="master">Master password</label>
        <input
          id="master"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <Strength length={password.length} />
        <small className="muted">
          {tooShort
            ? `${MIN_PASSWORD_LENGTH - password.length} more character${
                MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"
              }.`
            : verdict(password.length)}
        </small>
      </div>

      <div className="field field--tall">
        <label htmlFor="confirm">Confirm</label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && <small className="muted">These do not match.</small>}
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="stack stack--tight">
        <button
          type="button"
          className="btn btn--solid btn--wide"
          disabled={!ready || busy}
          onClick={() => void create()}
        >
          {busy ? "Locking it up…" : "Create my vault"}
        </button>
        <div className="btn-pair">
          <button type="button" className="btn" onClick={onRestore}>
            I already have a printed sheet
          </button>
        </div>
      </div>
    </section>
  );
}

/** Three bars. Step three is the scan screen, which has the rail instead. */
function Head({ step }: { step: 0 | 1 | 2 }) {
  return (
    <div className="onboard-head">
      <p className="onboard-title">Set up your vault</p>
      <div className="dots" role="list" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            role="listitem"
            className={`dot-bar${i < step ? " dot-bar--done" : i === step ? " dot-bar--current" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Length, in four segments.
 *
 * Length is the only thing a browser can judge honestly without shipping a
 * dictionary, so it is the only thing this claims to measure.
 */
function Strength({ length }: { length: number }) {
  const filled = length === 0 ? 0 : length < MIN_PASSWORD_LENGTH ? 1 : length < 16 ? 2 : length < 24 ? 3 : 4;
  return (
    <span className="strength" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={i < filled ? "on" : ""} />
      ))}
    </span>
  );
}

function verdict(length: number): string {
  if (length === 0) return `At least ${MIN_PASSWORD_LENGTH} characters.`;
  if (length < 16) return `${words(length)} characters. It will do.`;
  if (length < 24) return `${words(length)} characters. Good.`;
  return `${words(length)} characters. Nobody is guessing that.`;
}

const NUMBERS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen", "Twenty",
];

/** Spelled out up to twenty, as anyone counting out loud would. */
function words(n: number): string {
  return NUMBERS[n] ?? String(n);
}

function short(publicKey: Uint8Array): string {
  const address = base58.encode(publicKey);
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}
