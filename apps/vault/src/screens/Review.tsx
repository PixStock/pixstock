import { useEffect, useMemo, useState } from "react";
import { decodePayload, type SignRequest } from "@pixstock/agqp";
import {
  applyPolicy,
  decompile,
  decodeMessage,
  type OrderTicket,
  type PolicyResult,
} from "@pixstock/tx-policy";
import type { OrderManifest } from "@pixstock/shared";
import {
  checkAttestation,
  formatDeviation,
  permitsSigning,
  type AttestationStatus,
} from "@pixstock/pyth-verify";
import { loadSettings } from "../vault/settings";

export interface ReviewProps {
  payload: Uint8Array;
  /** The vault's own key, from its own storage — never from the payload. */
  vault: string;
  /**
   * True as soon as this screen knows it will not sign.
   *
   * The step rail lives in App and cannot see a policy result, so the screen
   * that reaches the verdict is the one that reports it. Presentation only —
   * nothing here decides anything.
   */
  onVerdict?: (refused: boolean) => void;
  onApprove: (request: SignRequest, ticket: OrderTicket) => void;
  onReject: () => void;
}

type Verdict =
  | { state: "unreadable"; reason: string }
  | { state: "wrong-vault"; addressed: string }
  | { state: "checked"; request: SignRequest; result: PolicyResult };

/**
 * Step 2: read the order, check it, show it.
 *
 * The whole product argument lives in this screen. It decodes the transaction
 * itself, runs the policy against it, and renders amounts taken from the
 * instructions — never from the description that travelled with them.
 */
export function Review({ payload, vault, onVerdict, onApprove, onReject }: ReviewProps) {
  const verdict = useMemo<Verdict>(() => {
    let request: SignRequest;
    try {
      const decoded = decodePayload(payload);
      if (decoded.kind !== "SIGN") {
        return { state: "unreadable", reason: `This is a ${decoded.kind} code, not an order.` };
      }
      request = decoded;
    } catch (err) {
      return { state: "unreadable", reason: (err as Error).message };
    }

    // Before anything else: is this order even addressed to us? A request
    // naming another vault is not ours to read, let alone sign.
    if (request.vault !== vault) {
      return { state: "wrong-vault", addressed: request.vault };
    }

    try {
      const message = decodeMessage(request.txs[0]!);
      const manifest: OrderManifest = {
        kind: request.manifest.kind,
        vault: request.vault,
        legs: request.manifest.legs,
        slippageBps: request.manifest.slippageBps,
        createdAt: request.manifest.quotedAt,
        feePayer: request.manifest.feePayer,
        nonceAccount: request.manifest.nonceAccount,
        dapp: request.manifest.dapp,
        // The multiplier cannot be read from here — no network, by design —
        // so it arrives with the order and P11 decides what may be done
        // with it. Passed on exactly as received, never patched.
        mints: request.manifest.mints,
      };
      const result = applyPolicy({ message, decoded: decompile(message), manifest, vault });
      return { state: "checked", request, result };
    } catch (err) {
      return { state: "unreadable", reason: (err as Error).message };
    }
  }, [payload, vault]);

  // An order that cannot be read, or is not ours, is refused before anything
  // is shown — so the rail is told here rather than inside the checked path.
  const unreadable = verdict.state !== "checked";
  useEffect(() => {
    if (unreadable) onVerdict?.(true);
  }, [unreadable, onVerdict]);

  if (verdict.state === "unreadable") {
    return (
      <Refusal title="This order cannot be read" detail={verdict.reason} onReject={onReject} />
    );
  }

  if (verdict.state === "wrong-vault") {
    return (
      <Refusal
        title="This order is for another vault"
        detail={`It names ${verdict.addressed.slice(0, 8)}…${verdict.addressed.slice(-6)}, which is not this one.`}
        onReject={onReject}
      />
    );
  }

  return (
    <CheckedOrder
      request={verdict.request}
      result={verdict.result}
      {...(onVerdict ? { onVerdict } : {})}
      onApprove={onApprove}
      onReject={onReject}
    />
  );
}

/**
 * An order that decoded, and is addressed to this vault. Everything from here
 * on is about whether it may be signed.
 *
 * Its own component because the two verdicts above return early, and the
 * acknowledgement checkbox and the verdict report both need hooks.
 */
function CheckedOrder({
  request,
  result,
  onVerdict,
  onApprove,
  onReject,
}: {
  request: SignRequest;
  result: PolicyResult;
  onVerdict?: (refused: boolean) => void;
  onApprove: (request: SignRequest, ticket: OrderTicket) => void;
  onReject: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { ticket, violations, unevaluated } = result;

  // The price check, against the ticket's own amounts — the ones read out of
  // the compiled instructions, never the manifest's. Pyth's signature is
  // verified here, on this device, with no network.
  const price = checkAttestation({
    ...(request.price ? { price: request.price } : {}),
    lines: (ticket?.lines ?? []).map((line) => ({
      mint: line.mint,
      rawAmount: line.rawAmount,
      multiplier: line.multiplier,
      direction: line.direction,
    })),
  });
  // Three outcomes, not two.
  //
  //   A price that verifies and holds  → sign.
  //   A price that is forged, stale or off the market → never sign. There is
  //     no checkbox for this, and there should not be: the vault knows the
  //     order is wrong, and a confirmation dialog would only be a way of
  //     talking someone into it.
  //   No price at all → the holder decides, once, in the open. Pyth does not
  //     cover every asset and a grant does not cover every feed; refusing
  //     outright would make the vault useless for those, and pretending would
  //     be worse. So it says what it could not check, and asks.
  //
  // The holder's own tolerance rides on top and can only tighten — see
  // vault/settings.ts — so choosing a stricter number can never turn a
  // refusal into an approval.
  const tolerance = loadSettings().maxDeviation;
  const priceVerified =
    permitsSigning(price, true) &&
    (price.state !== "verified" || Math.abs(price.deviation) <= tolerance);
  const priceRefuses = !priceVerified && !canAcknowledge(price);
  const priceAllowsSigning = priceVerified || (canAcknowledge(price) && acknowledged);
  const quoteAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - request.manifest.quotedAt);

  // Refused means there is nothing to approve: a policy violation, a price
  // that came back wrong, or no ticket at all. Not "not yet acknowledged" —
  // that one is still a decision the holder can make.
  const refused = violations.length > 0 || !ticket || priceRefuses;
  useEffect(() => {
    onVerdict?.(refused);
  }, [refused, onVerdict]);

  return (
    <section className="stack">
      <header className="stack stack--tight">
        <p className="eyebrow">Step 2</p>
        <h2>Check this order</h2>
      </header>

      <ol className="checks">
        <Check state="ok" label="Frames assembled" />
        <Check state={priceCheckState(price)} label={price.label} />
        <Check
          state={violations.length === 0 ? "ok" : "bad"}
          label={`Policy (${result.evaluated.length} rules)`}
        />
      </ol>

      {(price.state !== "verified" || !priceAllowsSigning || price.warn) && (
        <p className="alert" role="alert">
          <strong>{price.label}.</strong> {price.detail}
        </p>
      )}

      {price.state === "verified" && (
        <dl className="ticket-meta">
          {price.legs.map((leg) => (
            <div key={leg.feedId}>
              <dt>{leg.symbol} vs Pyth</dt>
              <dd className={`dev dev--${leg.severity}`}>
                <span className="num">{formatDeviation(leg.deviation)}</span>{" "}
                <span className="muted">
                  (<span className="num">{leg.oracle.toFixed(2)}</span> quoted,{" "}
                  <span className="num">{leg.implied.toFixed(2)}</span> here)
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {violations.length > 0 && (
        <div className="alert" role="alert">
          <strong>Refused.</strong>
          <ul className="violations">
            {violations.map((v, i) => (
              <li key={i}>
                <code>{v.rule}</code> {v.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ticket && <Ticket ticket={ticket} dapp={request.manifest.dapp} ageSeconds={quoteAgeSeconds} />}

      {unevaluated.length > 0 && (
        <p className="alert" role="note">
          <strong>{unevaluated.join(", ")} not enforced.</strong> This build does not check
          everything it should. Do not use it with a funded vault.
        </p>
      )}

      {canAcknowledge(price) && violations.length === 0 && ticket && (
        <label className="ack">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>
            Sign without a verified price. Nothing on this screen has been checked against the
            market.
          </span>
        </label>
      )}

      {priceRefuses && (
        <p className="alert" role="alert">
          <strong>This order cannot be signed.</strong> The price it carries did not verify, so
          there is nothing to approve.
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className="btn btn--solid"
          disabled={violations.length > 0 || !ticket || !priceAllowsSigning}
          onClick={() => ticket && onApprove(request, ticket)}
        >
          Approve
        </button>
        <button type="button" className="btn" onClick={onReject}>
          Reject
        </button>
      </div>
    </section>
  );
}

function Ticket({
  ticket,
  dapp,
  ageSeconds,
}: {
  ticket: OrderTicket;
  dapp: string;
  ageSeconds: number;
}) {
  return (
    <div className="ticket">
      <p className="ticket-kind">{ticket.kind}</p>

      <dl className="ticket-lines">
        {ticket.lines.map((line, i) => (
          <div key={i} className={`ticket-line ticket-line--${line.direction}`}>
            <dt>{line.direction === "in" ? "You pay" : "You receive"}</dt>
            <dd>
              <span className="num">{line.amount}</span> {line.symbol}
              {line.multiplier !== 1 && (
                // The scaled figure is the real one, so it is the large one.
                // The unscaled figure is shown too: it is what every other
                // wallet displays, and a holder comparing the two screens
                // should find the difference explained rather than alarming.
                <span className="ticket-scale">
                  ×<span className="num">{line.multiplier}</span> applied ·{" "}
                  <span className="num">{line.unscaledAmount}</span> unscaled
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="ticket-meta">
        <div>
          <dt>Network fee</dt>
          <dd>{ticket.networkFeePaidBy === "relayer" ? "paid by the relayer" : "paid by you"}</dd>
        </div>
        <div>
          <dt>Max slippage</dt>
          <dd className="num">{(ticket.slippageBps / 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Quoted</dt>
          <dd>
            <span className="num">{ageSeconds}</span>s ago by {dapp}
          </dd>
        </div>
        {ticket.mintsReadAt !== null && (
          <div>
            <dt>Mint read</dt>
            <dd>
              <span className="num">{mintAgeMinutes(ticket.mintsReadAt)}</span> min ago by the
              relayer
            </dd>
          </div>
        )}
      </dl>

      {ticket.disclosures.length > 0 && (
        <ul className="disclosures">
          {ticket.disclosures.map((disclosure, i) => (
            <li key={i} className={`disclosure disclosure--${disclosure.severity}`}>
              {disclosure.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How stale the mint reading is. Multipliers change; this says when. */
function mintAgeMinutes(readAt: number): number {
  return Math.max(0, Math.round((Date.now() / 1000 - readAt) / 60));
}

/**
 * Whether the holder may take responsibility for an unchecked price.
 *
 * Only where the vault could not check: no attestation, or one that is
 * genuine but carries no price for this asset. A price that was checked and
 * came back wrong is not on this list, and adding it later would quietly undo
 * the guard.
 */
function canAcknowledge(status: AttestationStatus): boolean {
  return status.state === "absent" || status.state === "unverifiable";
}

type CheckState = "ok" | "warn" | "bad";

const MARKS: Record<CheckState, string> = { ok: "✓", warn: "!", bad: "✕" };

function priceCheckState(status: AttestationStatus): CheckState {
  if (status.state === "verified") return status.warn ? "warn" : "ok";
  if (status.state === "rejected") return "bad";
  // Absent or unverifiable: a warning, never a tick.
  return "warn";
}

function Check({ state, label }: { state: CheckState; label: string }) {
  return (
    <li className={`check check--${state}`}>
      <span aria-hidden="true">{MARKS[state]}</span>
      {label}
    </li>
  );
}

function Refusal({
  title,
  detail,
  onReject,
}: {
  title: string;
  detail: string;
  onReject: () => void;
}) {
  return (
    <section className="stack">
      <div className="alert" role="alert">
        <strong>{title}</strong>
        <p style={{ margin: "6px 0 0" }}>{detail}</p>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={onReject}>
          Back
        </button>
      </div>
    </section>
  );
}
