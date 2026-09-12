import { useMemo } from "react";
import { decodePayload, type SignRequest } from "@pixstock/agqp";
import {
  applyPolicy,
  decompile,
  decodeMessage,
  type OrderTicket,
  type PolicyResult,
} from "@pixstock/tx-policy";
import type { OrderManifest } from "@pixstock/shared";
import { checkAttestation, type AttestationStatus } from "@pixstock/pyth-verify";

export interface ReviewProps {
  payload: Uint8Array;
  /** The vault's own key, from its own storage — never from the payload. */
  vault: string;
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
export function Review({ payload, vault, onApprove, onReject }: ReviewProps) {
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
      };
      const result = applyPolicy({ message, decoded: decompile(message), manifest, vault });
      return { state: "checked", request, result };
    } catch (err) {
      return { state: "unreadable", reason: (err as Error).message };
    }
  }, [payload, vault]);

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

  const { request, result } = verdict;
  const { ticket, violations, unevaluated } = result;
  // What the vault may honestly say about the price. Today: that it cannot
  // check it. See packages/pyth-verify/src/status.ts.
  const price = checkAttestation({ price: request.price });
  const quoteAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - request.manifest.quotedAt);

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

      {price.state !== "verified" && (
        <p className="alert" role="alert">
          <strong>{price.label}.</strong> {price.detail}
        </p>
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

      <div className="row">
        <button
          type="button"
          className="btn btn--solid"
          disabled={violations.length > 0 || !ticket}
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
      </dl>
    </div>
  );
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
