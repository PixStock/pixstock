import { describe, expect, it } from "vitest";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import type { AttestationStatus, LegAttestation } from "@pixstock/pyth-verify";
import type { TicketLine } from "@pixstock/tx-policy";
import {
  canAcknowledge,
  mintAgeMinutes,
  nameOf,
  perUnit,
  priceCheckState,
  refusalDetail,
  severityOfWorst,
  totalPaid,
  worstLeg,
} from "../src/screens/ticket.js";

/**
 * What the review screen decides, asserted directly.
 *
 * These ran only inside a browser before, which meant the one-line predicate
 * that governs whether a refusal can be overridden was covered by nothing
 * that would fail if someone widened it.
 */

const TSLA = ASSETS.find((a) => a.symbol === "TSLAx")!;

const leg = (over: Partial<LegAttestation> = {}): LegAttestation => ({
  symbol: "TSLAx",
  feedId: TSLA.pythFeedId,
  implied: 250,
  oracle: 250,
  deviation: 0,
  severity: "ok",
  ...over,
});

const verified = (legs: LegAttestation[], over: Partial<AttestationStatus> = {}) =>
  ({
    state: "verified",
    label: "Price checked",
    detail: "",
    deviation: legs[0]?.deviation ?? 0,
    ageSeconds: 3,
    warn: false,
    legs,
    ...over,
  }) as AttestationStatus;

const plain = (state: "absent" | "unverifiable" | "rejected"): AttestationStatus =>
  ({ state, label: state, detail: "No signed price came with this order." }) as AttestationStatus;

const line = (over: Partial<TicketLine> = {}): TicketLine => ({
  symbol: "USDC",
  direction: "in",
  amount: "500.00",
  unscaledAmount: "500.00",
  rawAmount: "500000000",
  multiplier: 1,
  mint: USDC_MINT,
  ...over,
});

describe("whether the holder may take responsibility for an unchecked price", () => {
  it("allows it only where the vault could not check", () => {
    expect(canAcknowledge(plain("absent"))).toBe(true);
    expect(canAcknowledge(plain("unverifiable"))).toBe(true);
  });

  it("never allows it for a price that was checked and came back wrong", () => {
    // The guard this whole screen exists for. A checked price that failed is
    // not a matter of opinion, and there is no checkbox for it — widening
    // this predicate is the one change that would undo the product quietly.
    expect(canAcknowledge(plain("rejected"))).toBe(false);
    expect(canAcknowledge(verified([leg({ deviation: 0.09, severity: "refuse" })]))).toBe(false);
  });
});

describe("the mark against the price check", () => {
  it("ticks only a price that verified inside tolerance", () => {
    expect(priceCheckState(verified([leg()]))).toBe("ok");
    expect(priceCheckState(verified([leg()], { warn: true }))).toBe("warn");
  });

  it("never ticks an absence", () => {
    // Absent and unverifiable are warnings. A tick would say "checked" about
    // something nobody checked.
    expect(priceCheckState(plain("absent"))).toBe("warn");
    expect(priceCheckState(plain("unverifiable"))).toBe("warn");
    expect(priceCheckState(plain("rejected"))).toBe("bad");
  });
});

describe("which leg the refusal talks about", () => {
  it("picks the one furthest from the oracle, in either direction", () => {
    const worst = worstLeg(
      verified([
        leg({ symbol: "TSLAx", deviation: 0.01 }),
        leg({ symbol: "AAPLx", deviation: -0.04 }),
        leg({ symbol: "NVDAx", deviation: 0.02 }),
      ]),
    );
    expect(worst?.symbol).toBe("AAPLx");
  });

  it("has nothing to say about a price that did not verify", () => {
    expect(worstLeg(plain("absent"))).toBeNull();
    expect(worstLeg(plain("rejected"))).toBeNull();
    expect(worstLeg(verified([]))).toBeNull();
    expect(severityOfWorst(verified([]))).toBe("ok");
    expect(severityOfWorst(verified([leg({ severity: "refuse" })]))).toBe("refuse");
  });
});

describe("the total paid", () => {
  it("adds the legs when they are paid in the same thing", () => {
    const total = totalPaid([
      line({ rawAmount: "500000000" }),
      line({ rawAmount: "250000000" }),
    ]);
    // Formatted the way the lines it totals are formatted — trailing zeros
    // trimmed — because a total that reads differently from its parts invites
    // the reader to check whether it is the same quantity.
    expect(total).toEqual({ amount: "750", symbol: "USDC" });
  });

  it("refuses to add two different things, rather than printing a wrong sum", () => {
    expect(totalPaid([line(), line({ mint: TSLA.mint, symbol: "TSLAx" })])).toBeNull();
    expect(totalPaid([line(), line({ multiplier: 1.04 })])).toBeNull();
    expect(totalPaid([])).toBeNull();
  });

  it("falls back rather than throwing on a mint the offline table does not know", () => {
    // A throw here would unmount the review screen mid-render: a blank page
    // with no Reject button, at the moment someone is deciding whether to sign.
    const total = totalPaid([line({ mint: "NotAMintThisBuildHasEverSeen", symbol: "???" })]);
    expect(total).not.toBeNull();
    expect(total!.symbol).toBe("???");
  });
});

describe("the clause under a line", () => {
  it("gives a per-unit price only where one was verified", () => {
    const l = line({ symbol: "TSLAx", direction: "out", mint: TSLA.mint });
    expect(perUnit(l, verified([leg({ implied: 249.5 })]))).toContain("249.50 each");
    expect(perUnit(l, plain("absent"))).toBe("");
    // Verified, but no leg for this symbol: the clause is dropped, not guessed.
    expect(perUnit(l, verified([leg({ symbol: "AAPLx" })]))).toBe("");
  });

  it("says what the scale did, whenever it did anything", () => {
    const scaled = line({ symbol: "TSLAx", mint: TSLA.mint, multiplier: 1.04, unscaledAmount: "1.92" });
    expect(perUnit(scaled, plain("absent"))).toBe("×1.04 scale applied, 1.92 unscaled");
    expect(perUnit(scaled, verified([leg({ implied: 249.5 })]))).toBe(
      "at 249.50 each · ×1.04 scale applied, 1.92 unscaled",
    );
  });
});

describe("the small things", () => {
  it("names the assets it knows and passes the rest through", () => {
    expect(nameOf("TSLAx")).toBe("Tesla");
    expect(nameOf("WIFx")).toBe("WIFx");
  });

  it("reports staleness in whole minutes, never negative", () => {
    expect(mintAgeMinutes(1_000_000, 1_000_000 + 150)).toBe(3);
    expect(mintAgeMinutes(1_000_000, 1_000_000)).toBe(0);
    // A device clock behind the reading is a skew, not a negative age.
    expect(mintAgeMinutes(1_000_000, 1_000_000 - 600)).toBe(0);
  });
});

describe("what the refusal says", () => {
  const violation = [{ rule: "P5", detail: "The output goes to an account that is not yours" }];

  it("leads with the policy violation, whatever the price says", () => {
    const detail = refusalDetail(violation, verified([leg()]), 0.01);
    expect(detail).toContain("not yours");
    expect(detail).toContain("There is no checkbox for this.");
  });

  it("puts both numbers in front of the holder, not just the percentage", () => {
    // "4.20% away" is a statistic. "439.60 against 421.88" is the thing that
    // is wrong.
    const detail = refusalDetail(
      [],
      verified([leg({ symbol: "TSLAx", implied: 439.6, oracle: 421.88, deviation: 0.042 })], {
        ageSeconds: 1,
      }),
      0.01,
    );
    expect(detail).toContain("439.60");
    expect(detail).toContain("421.88");
    expect(detail).toContain("1 second ago");
    expect(detail).toContain("1.0%");
  });

  it("falls back to what the price check itself said", () => {
    expect(refusalDetail([], plain("rejected"), 0.01)).toContain("No signed price");
  });
});
