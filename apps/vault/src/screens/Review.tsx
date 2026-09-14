import { useEffect, useMemo, useState } from "react";
import { decodePayload, type SignRequest } from "@pixstock/agqp";
import {
  applyPolicy,
  decompile,
  decodeMessage,
  type OrderTicket,
  type PolicyResult,
  type TicketLine,
} from "@pixstock/tx-policy";
import { assetByMint, formatScaled, type OrderManifest } from "@pixstock/shared";
import {
  checkAttestation,
  formatDeviation,
  permitsSigning,
  type AttestationStatus,
  type LegAttestation,
} from "@pixstock/pyth-verify";
import { loadSettings } from "../vault/settings";

export interface ReviewProps {
  payload: Uint8Array;
  /** How many frames the assembler put together to make this payload. */
  frames: number;
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
 *
 * It is laid out in the order a person reads it: the outcome in words, then
 * the one figure the decision turns on, then the three checks behind it, then
 * what cannot be hidden, then everything else folded away. The two buttons
 * are sticky, because Approve used to sit below a disclosure list a screen
 * tall and "scroll past the warning to reach the button" is not a design.
 */
export function Review({ payload, frames, vault, onVerdict, onApprove, onReject }: ReviewProps) {
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
      frames={frames}
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
  frames,
  onVerdict,
  onApprove,
  onReject,
}: {
  request: SignRequest;
  result: PolicyResult;
  frames: number;
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

  const pay = ticket?.lines.filter((line) => line.direction === "in") ?? [];
  const receive = ticket?.lines.filter((line) => line.direction === "out") ?? [];
  const paid = totalPaid(pay);
  const warnings = ticket?.disclosures.filter((d) => d.severity === "warn") ?? [];
  const notes = ticket?.disclosures.filter((d) => d.severity === "note") ?? [];

  return (
    <section className="stack">
      {/*
        Above the verdict, deliberately: a build that does not run every rule
        outranks anything the rules it did run have to say.
      */}
      {unevaluated.length > 0 && (
        <p className="alert" role="alert">
          <strong>{unevaluated.join(", ")} not enforced.</strong> This build does not check
          everything it should. Do not use it with a funded vault.
        </p>
      )}

      <VerdictStrip
        refused={refused}
        violations={violations}
        price={price}
        priceAllowsSigning={priceAllowsSigning}
        tolerance={tolerance}
      />

      {ticket && (
        <div className={`amounts${refused ? " amounts--refused" : ""}`}>
          {/*
            A basket pays for every leg out of the same USDC, so the three
            rows that used to say "You pay" one after another were one fact
            written three times. Totalled only where the mint and the scale
            agree — otherwise each line stands on its own, because adding
            amounts of different things is how a ticket starts lying.
          */}
          {paid ? (
            <div className="amount-pay">
              <p className="amount-label">You pay</p>
              <span className="v">
                <span className="num">{paid.amount}</span>{" "}
                <span className="sym">{paid.symbol}</span>
              </span>
            </div>
          ) : (
            pay.map((line, i) => (
              <div key={`pay-${i}`} className="amount-pay">
                <p className="amount-label">{i === 0 ? "You pay" : ""}</p>
                <span className="v">
                  <span className="num">{line.amount}</span>{" "}
                  <span className="sym">{line.symbol}</span>
                </span>
              </div>
            ))
          )}

          <div className="amount-rule" aria-hidden="true" />

          {/*
            One dominant number where there is one. Three positions are three
            decisions, and printing all three at 40px makes none of them the
            answer — so a basket steps them down and keeps the label once.
          */}
          <div className={`amount-get${receive.length > 1 ? " amount-get--many" : ""}`}>
            <p className="amount-label">You receive</p>
            {receive.map((line, i) => (
              <div key={`get-${i}`} className="amount-line">
                <span className="v num">{line.amount}</span>
                <span className="sym">
                  {line.symbol} · {nameOf(line.symbol)}
                </span>
                <span className="per">{perUnit(line, price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ul className="checkrows">
        <CheckRow state="ok" label="Frames assembled" value={`${frames} / ${frames}`} />
        <CheckRow
          state={priceCheckState(price)}
          label="Price against Pyth"
          value={
            price.state === "verified" ? (
              <span className={`dev--${severityOfWorst(price)}`}>
                {formatDeviation(price.deviation)}
              </span>
            ) : (
              "not signed"
            )
          }
        />
        <CheckRow
          state={violations.length === 0 ? "ok" : "bad"}
          label="Signing rules"
          value={`${result.evaluated.length} / ${result.evaluated.length + unevaluated.length}`}
        />
      </ul>

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

      {/* Never folded away: these are the things no signing device can undo. */}
      {warnings.length > 0 && (
        <div className="warnbox">
          <span className="mark" aria-hidden="true">
            !
          </span>
          <ul className="warnbox-list">
            {warnings.map((disclosure, i) => (
              <li key={i}>{disclosure.text}</li>
            ))}
          </ul>
        </div>
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

      {ticket && (
        <details className="more">
          <summary>Order details, fees and one more note</summary>

          <dl className="ticket-meta">
            <div>
              <dt>Network fee</dt>
              <dd>
                {ticket.networkFeePaidBy === "relayer" ? "paid by the relayer, not you" : "paid by you"}
              </dd>
            </div>
            <div>
              <dt>Most you can lose to slippage</dt>
              <dd className="num">{(ticket.slippageBps / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Quoted</dt>
              <dd>
                <span className="num">{quoteAgeSeconds}</span>s ago by {request.manifest.dapp}
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

          {notes.length > 0 && (
            <ul className="disclosures" style={{ paddingTop: 0, borderTop: 0 }}>
              {notes.map((disclosure, i) => (
                <li key={i} className="disclosure disclosure--note">
                  {disclosure.text}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {/*
        On a refusal there is no Approve button at all — not a disabled one.
        A greyed-out control is an invitation to find the way around it, and
        there is no way around this one.
      */}
      <div className="actionbar">
        {refused ? (
          <button type="button" className="btn btn--only" onClick={onReject}>
            Reject and go back
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--reject" onClick={onReject}>
              Reject
            </button>
            <button
              type="button"
              className="btn btn--solid btn--approve"
              disabled={!priceAllowsSigning}
              onClick={() => ticket && onApprove(request, ticket)}
            >
              Approve
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The outcome, in words, before any figure.
 *
 * Everything it says is composed from what the check already returned — the
 * oracle price, the implied price, the deviation and the age. Nothing here is
 * a second opinion.
 */
function VerdictStrip({
  refused,
  violations,
  price,
  priceAllowsSigning,
  tolerance,
}: {
  refused: boolean;
  violations: PolicyResult["violations"];
  price: AttestationStatus;
  priceAllowsSigning: boolean;
  tolerance: number;
}) {
  if (refused) {
    return (
      <div className="verdict verdict--crit" role="alert">
        <span className="verdict-badge" aria-hidden="true">
          ✕
        </span>
        <div className="verdict-body">
          <p className="verdict-head">This phone will not sign</p>
          <p className="verdict-detail">{refusalDetail(violations, price, tolerance)}</p>
        </div>
      </div>
    );
  }

  if (price.state === "verified") {
    const worst = worstLeg(price);
    return (
      <div className={`verdict verdict--${price.warn ? "warn" : "ok"}`}>
        <span className="verdict-badge" aria-hidden="true">
          {price.warn ? "!" : "✓"}
        </span>
        <div className="verdict-body">
          <p className="verdict-head">Safe to sign</p>
          <p className="verdict-detail">
            Pyth signed this price <span className="num">{price.ageSeconds}</span> second
            {price.ageSeconds === 1 ? "" : "s"} ago and the order sits{" "}
            <span className="num">{formatDeviation(price.deviation)}</span> from it
            {worst ? ` on ${worst.symbol}` : ""}. Checked on this phone, with no network.
          </p>
        </div>
      </div>
    );
  }

  // Genuine but silent: no signed price exists for this order today. The
  // holder can take that on, once, in the open — and until they do, the
  // headline says what is missing rather than implying it is fine.
  return (
    <div className="verdict verdict--warn">
      <span className="verdict-badge" aria-hidden="true">
        !
      </span>
      <div className="verdict-body">
        <p className="verdict-head">No signed price for this order</p>
        <p className="verdict-detail">
          {price.detail}
          {priceAllowsSigning ? " You have taken that on." : ""}
        </p>
      </div>
    </div>
  );
}

/** Why it refuses, in the same order the checks run. */
function refusalDetail(
  violations: PolicyResult["violations"],
  price: AttestationStatus,
  tolerance: number,
): string {
  if (violations.length > 0) {
    return `${violations[0]!.detail}. There is no checkbox for this.`;
  }

  if (price.state === "verified") {
    const worst = worstLeg(price);
    if (worst) {
      // The two numbers side by side, because "4.20% away" on its own is a
      // statistic and "439.60 against 421.88" is the thing that is wrong.
      return (
        `The order prices ${worst.symbol} at ${worst.implied.toFixed(2)}. ` +
        `Pyth signed ${worst.oracle.toFixed(2)} ${price.ageSeconds} second` +
        `${price.ageSeconds === 1 ? "" : "s"} ago — ${formatDeviation(worst.deviation)} away, ` +
        `past the ${(tolerance * 100).toFixed(1)}% you allow. There is no checkbox for this.`
      );
    }
  }

  return `${price.detail} There is no checkbox for this.`;
}

function worstLeg(price: AttestationStatus): LegAttestation | null {
  if (price.state !== "verified" || price.legs.length === 0) return null;
  return price.legs.reduce((a, b) => (Math.abs(b.deviation) > Math.abs(a.deviation) ? b : a));
}

function severityOfWorst(price: AttestationStatus): "ok" | "warn" | "refuse" {
  return worstLeg(price)?.severity ?? "ok";
}

/**
 * The legs' pay lines as one figure, when that is exactly true.
 *
 * Every leg of a basket spends the same USDC, so three rows saying "You pay"
 * are one fact written three times. Returns null the moment the mints or the
 * multipliers differ: a total across different things is not a total.
 */
function totalPaid(pay: TicketLine[]): { amount: string; symbol: string } | null {
  if (pay.length === 0) return null;

  const first = pay[0]!;
  if (pay.some((l) => l.mint !== first.mint || l.multiplier !== first.multiplier)) return null;

  const raw = pay.reduce((sum, l) => sum + BigInt(l.rawAmount), 0n);
  return {
    // The same fallback buildTicket uses, and for the same two reasons: a
    // ticket may legitimately carry a mint the offline table does not know,
    // and `decimalsOfMint` throws on one. A throw here would unmount the
    // review screen mid-render — a blank page, with no Reject button, at the
    // exact moment someone is deciding whether to sign.
    //
    // Sharing the expression also keeps the total formatted like the lines
    // it totals.
    amount: formatScaled(raw, assetByMint(first.mint)?.decimals ?? 6, first.multiplier),
    symbol: first.symbol,
  };
}

/**
 * What one unit costs, and what the scale did to the figure above.
 *
 * The per-unit price is the one the vault derived from the transaction's own
 * amounts, so it only exists where a price verified. Where it does not, the
 * clause is dropped rather than filled with the manifest's claim.
 */
function perUnit(line: TicketLine, price: AttestationStatus): string {
  const parts: string[] = [];

  if (price.state === "verified") {
    const leg = price.legs.find((l) => l.symbol === line.symbol);
    if (leg) parts.push(`at ${leg.implied.toFixed(2)} each`);
  }

  if (line.multiplier !== 1) {
    parts.push(
      `×${Number(line.multiplier.toFixed(6))} scale applied, ${line.unscaledAmount} unscaled`,
    );
  }

  return parts.join(" · ");
}

/** The asset's name, for the line under the figure. */
function nameOf(symbol: string): string {
  return NAMES[symbol] ?? symbol;
}

const NAMES: Record<string, string> = {
  TSLAx: "Tesla",
  NVDAx: "NVIDIA",
  AAPLx: "Apple",
  MSFTx: "Microsoft",
  SPYx: "S&P 500 ETF",
  USDC: "USD Coin",
};

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

function CheckRow({
  state,
  label,
  value,
}: {
  state: CheckState;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className={`checkrow checkrow--${state}`}>
      <span className="mark" aria-hidden="true">
        {MARKS[state]}
      </span>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
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
      <div className="verdict verdict--crit" role="alert">
        <span className="verdict-badge" aria-hidden="true">
          ✕
        </span>
        <div className="verdict-body">
          <p className="verdict-head">{title}</p>
          <p className="verdict-detail">{detail}</p>
        </div>
      </div>
      <div className="actionbar">
        <button type="button" className="btn btn--only" onClick={onReject}>
          Reject and go back
        </button>
      </div>
    </section>
  );
}
