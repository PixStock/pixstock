import { describe, expect, it } from "vitest";
import { ASSETS, formatAmount, formatScaled, scaledUiAmount } from "../src/index.js";

/**
 * Token-2022's ScaledUiAmount, which every xStock uses.
 *
 * The multipliers measured on mainnet on 12 Sept 2026. None is 1, and each
 * mint already has a higher one scheduled — showing `raw / 10^decimals` is
 * wrong by up to half a percent on the very screen that claims to show real
 * amounts.
 */
const MEASURED = {
  TSLAx: 1,
  NVDAx: 1.0009180758490996,
  AAPLx: 1.0026642075893797,
  MSFTx: 1.0045820905025638,
  SPYx: 1.003909240011759,
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
    // 0.598686 raw becomes 0.600281 once scaled. Showing the former on a
    // signing screen is showing the wrong number.
    expect(scaledUiAmount(59868600n, 8, MEASURED.AAPLx)).toBeCloseTo(0.6002810, 6);
  });

  it("is a no-op at a multiplier of one", () => {
    expect(scaledUiAmount(100000000n, 8, 1)).toBe(1);
  });

  it("accepts a raw amount as a string, because it is a u64", () => {
    expect(scaledUiAmount("100000000", 8, 1)).toBe(1);
  });

  it("formats with the decimals the interface uses", () => {
    expect(formatScaled(59868600n, 8, MEASURED.AAPLx)).toBe("0.600281");
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
});
