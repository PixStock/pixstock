import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createAmountToUiAmountInstruction } from "@solana/spl-token";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { ASSETS, scaleRaw } from "@pixstock/shared";
import { appConfig } from "../src/config";
import { SolanaModule } from "../src/modules/solana/solana.module";
import { MintStateService } from "../src/modules/market/mint-state.service";
import { CAPTURE } from "./mint-state.fixture";

/**
 * The multiplier, checked against the only authority on it: the token program.
 *
 * `AmountToUiAmount` is an instruction. Simulating it makes token-2022 itself
 * compute the answer, clock rule and all. That is worth an RPC round trip,
 * because the mint's `multiplier` field is NOT the multiplier in force — the
 * extension holds two of them and a switchover timestamp, and reading the
 * first one silently returned the superseded value on four of the five
 * xStocks. Every offline test agreed with itself while the figures were wrong
 * by up to 0.18%.
 *
 *   npm run test:live
 */
const ONE_UNIT = 100_000_000n; // 1.0 at eight decimals

/**
 * Mainnet, named here rather than inherited.
 *
 * The relayer's own default is devnet, where these five mint addresses mean
 * nothing — a test about xStocks has to say which chain it is about, and use
 * the same endpoint for the service and for the simulation it checks against.
 */
const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/** A funded mainnet account, used only as a simulated fee payer. */
const SIMULATED_PAYER = new PublicKey("2oQgk1TCCnzR9A8okK9zkuV5wfszX56uChw62qtcSfof");

let mints: MintStateService;
let connection: Connection;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [appConfig, () => ({ solana: { rpcUrl: RPC, cluster: "mainnet-beta" } })],
      }),
      SolanaModule,
    ],
    providers: [MintStateService],
  }).compile();

  mints = moduleRef.get(MintStateService);
  connection = new Connection(RPC, "confirmed");
}, 60_000);

/** What token-2022 says one whole unit of this mint is worth, on screen. */
async function programUiAmount(mint: string): Promise<number> {
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: SIMULATED_PAYER,
    recentBlockhash: blockhash,
    instructions: [
      createAmountToUiAmountInstruction(new PublicKey(mint), ONE_UNIT, TOKEN_2022_PROGRAM_ID),
    ],
  }).compileToV0Message();

  const result = await connection.simulateTransaction(new VersionedTransaction(message), {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  const data = result.value.returnData;
  if (!data) throw new Error(`No return data: ${JSON.stringify(result.value.err)}`);
  return Number(Buffer.from(data.data[0], data.data[1] as BufferEncoding).toString("utf8"));
}

describe("the multiplier in force", () => {
  it.each(ASSETS.map((a) => [a.symbol, a.mint] as const))(
    "%s matches what the token program computes",
    async (symbol, mint) => {
      const [state, fromChain] = await Promise.all([mints.byMint(mint), programUiAmount(mint)]);
      expect(state, symbol).toBeDefined();

      // Compared as the DISPLAYED amount, not as the multiplier: the program
      // truncates at the mint's decimals, and so does `scaleRaw`. Exact
      // equality of what a holder reads is both the sharper assertion and the
      // one that matters — a multiplier is only ever a means to it.
      const ours = Number(scaleRaw(ONE_UNIT, state!.multiplier)) / 10 ** 8;
      expect(ours, symbol).toBe(fromChain);
    },
    60_000,
  );

  it("never reports a pending change whose date has already passed", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const state of await mints.all()) {
      if (state.nextMultiplierEffectiveAt === null) continue;
      expect(state.nextMultiplierEffectiveAt, state.symbol).toBeGreaterThan(now);
      // A pending change that equals the current multiplier is not a change.
      expect(state.nextMultiplier, state.symbol).not.toBe(state.multiplier);
    }
  }, 60_000);

  it("still finds a permanent delegate on every xStock", async () => {
    // The recorded fixture asserts this offline. If the issuer ever removed
    // it, this is where we would find out — and the disclosure copy on the
    // vault ticket and /legal would need revisiting rather than deleting.
    for (const state of await mints.all()) {
      expect(state.permanentDelegate, state.symbol).not.toBeNull();
    }
  }, 60_000);

  it("agrees with the recorded fixture, or says the capture is stale", async () => {
    const live = await mints.all();
    const drifted = live.filter((state) => {
      const captured = CAPTURE.states.find((s) => s.mint === state.mint);
      return captured && Math.abs(captured.nextMultiplier - state.multiplier) > 1e-9;
    });

    // Not a failure in itself — multipliers move, that is their job. It means
    // scripts/capture-mint-state.mjs should be re-run.
    if (drifted.length > 0) {
      console.warn(
        `Recorded mint state is stale for ${drifted.map((s) => s.symbol).join(", ")}. ` +
          `Re-run: node scripts/capture-mint-state.mjs > apps/relayer/test/mint-state.json`,
      );
    }
    expect(live).toHaveLength(ASSETS.length);
  }, 60_000);
});
