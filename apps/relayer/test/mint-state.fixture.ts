import { readFileSync } from "node:fs";
import { normaliseMultiplier } from "@pixstock/shared";
import type { MintState } from "../src/modules/market/mint-state.service";

/**
 * Mint state as recorded from mainnet by scripts/capture-mint-state.mjs.
 *
 * Recorded rather than fetched, because an offline suite that quietly reaches
 * the internet fails on a plane, fails in CI without egress, and hides real
 * breakage behind a network error. The live read is covered by
 * `mint-state.live.test.ts`, which asks the token program itself — and which
 * is the only thing that could have caught the relayer reading the superseded
 * multiplier.
 */
interface Captured {
  capturedAt: number;
  states: Array<{
    symbol: string;
    mint: string;
    multiplier: number;
    nextMultiplier: number;
    newMultiplierEffectiveTimestamp: number | null;
    permanentDelegate: string | null;
    paused: boolean;
  }>;
}

export const CAPTURE = JSON.parse(
  readFileSync(new URL("./mint-state.json", import.meta.url), "utf8"),
) as Captured;

export const BACKED_DELEGATE = "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq";

/** The same clock rule the service applies, over the recorded fields. */
function inForce(state: Captured["states"][number], now: number) {
  const at = state.newMultiplierEffectiveTimestamp ?? 0;
  const pending = now < at;
  return {
    multiplier: normaliseMultiplier(pending ? state.multiplier : state.nextMultiplier),
    nextMultiplier: normaliseMultiplier(state.nextMultiplier),
    nextMultiplierEffectiveAt: pending ? at : null,
  };
}

export const RECORDED_MINT_STATE: MintState[] = CAPTURE.states.map((state) => ({
  symbol: state.symbol,
  mint: state.mint,
  ...inForce(state, CAPTURE.capturedAt),
  permanentDelegate: state.permanentDelegate,
  paused: state.paused,
  readAt: CAPTURE.capturedAt,
}));

/** Stands in for the service, without the five RPC calls it makes. */
export class RecordedMintState {
  async all(): Promise<MintState[]> {
    return RECORDED_MINT_STATE;
  }

  async bySymbol(symbol: string) {
    return RECORDED_MINT_STATE.find((state) => state.symbol === symbol);
  }

  async byMint(mint: string) {
    return RECORDED_MINT_STATE.find((state) => state.mint === mint);
  }

  async factsFor(mints: readonly string[]) {
    const { isScaledMint } = await import("@pixstock/shared");
    return [...new Set(mints)]
      .filter((mint) => isScaledMint(mint))
      .map((mint) => {
        const state = RECORDED_MINT_STATE.find((s) => s.mint === mint)!;
        return {
          mint,
          multiplier: state.multiplier,
          ...(state.nextMultiplierEffectiveAt !== null &&
          state.nextMultiplier !== state.multiplier
            ? {
                nextMultiplier: state.nextMultiplier,
                nextMultiplierAt: state.nextMultiplierEffectiveAt,
              }
            : {}),
          ...(state.permanentDelegate ? { permanentDelegate: state.permanentDelegate } : {}),
          readAt: state.readAt,
        };
      });
  }
}
