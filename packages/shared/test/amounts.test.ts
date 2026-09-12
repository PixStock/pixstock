import { describe, expect, it } from "vitest";
import {
  ASSETS,
  formatAmount,
  formatScaled,
  normaliseMultiplier,
  scaleRaw,
  scaledUiAmount,
} from "../src/index.js";

/**
 * Token-2022's ScaledUiAmount, which every xStock uses.
 *
 * The multipliers IN FORCE on mainnet on 12 Sept 2026, as the token program
 * itself reports them when asked (`AmountToUiAmount`), normalised to the
 * twelve places this product carries.
 *
 * They are not the mint's `multiplier` field. The extension holds two
 * multipliers and a switchover timestamp, and by then the scheduled one had
 * taken over on four of the five — so reading the first field understated
 * every balance by up to 0.18%. Showing `raw / 10^decimals` is wrong by more
 * again, on the very screen that claims to show real amounts.
 */
const MEASURED = {
  TSLAx: 1,
  NVDAx: 1.001701196801,
  AAPLx: 1.00326901254,
  MSFTx: 1.005903390479,
  SPYx: 1.005714560286,
} as const;

describe("scaled amounts", () => {
  it("differs from the unscaled amount for every mint that has a multiplier", () => {
    const raw = 59868600n; // 0.598686 at eight decimals
    for (const [symbol, multiplier] of Object.entries(MEASURED)) {
      const plain = Number(raw) / 1e8;
      const scaled = scaledUiAmount(raw, 8, multiplier);
      if (multiplier === 1) {
        expect(scaled, symbol).toBeCloseTo(plain, 10);
      } else {
        expect(scaled, symbol).toBeGreaterThan(plain);
      }
    }
  });

  it("applies the measured AAPLx multiplier", () => {
    // 0.598686 raw becomes 0.600643 once scaled. Showing the former on a
    // signing screen is showing the wrong number.
    expect(scaledUiAmount(59868600n, 8, MEASURED.AAPLx)).toBeCloseTo(0.600643, 6);
  });

  it("is a no-op at a multiplier of one", () => {
    expect(scaledUiAmount(100000000n, 8, 1)).toBe(1);
  });

  it("accepts a raw amount as a string, because it is a u64", () => {
    expect(scaledUiAmount("100000000", 8, 1)).toBe(1);
  });

  it("formats with the decimals the interface uses", () => {
    expect(formatScaled(59868600n, 8, MEASURED.AAPLx)).toBe("0.600643");
  });

  it("stays distinct from the unscaled formatter", () => {
    const raw = 59868600n;
    expect(formatScaled(raw, 8, MEASURED.AAPLx)).not.toBe(formatAmount(raw, 8, 6));
  });

  it("covers every asset the product lists", () => {
    for (const asset of ASSETS) {
      expect(Object.keys(MEASURED)).toContain(asset.symbol);
    }
  });

  it("carries a multiplier at a precision that survives the journey", () => {
    // A raw f64 from the mint has seventeen significant digits and comes back
    // from the database with sixteen — a value that changes on the way is a
    // value nothing can be checked against. Normalised, it does not move.
    const fromMint = 1.0032690125398187;
    const carried = normaliseMultiplier(fromMint);

    expect(carried).not.toBe(fromMint);
    expect(Number(carried.toPrecision(16))).toBe(carried);
    expect(JSON.parse(JSON.stringify({ m: carried })).m).toBe(carried);
    // And it is close enough that no displayed amount moves.
    expect(carried).toBeCloseTo(fromMint, 11);
  });

  it("prints the multiplier it actually applies", () => {
    // The ticket shows "×1.00326901254" beside the amount. If scaleRaw used a
    // different value the two would disagree, which is the one thing this
    // screen may not do.
    const carried = normaliseMultiplier(1.0032690125398187);
    expect(scaleRaw(100_000_000n, carried)).toBe(100_326_901n);
  });
});
