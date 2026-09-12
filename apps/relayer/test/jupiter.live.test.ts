import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import { decodeMessage, decompile, feePayerOf } from "@pixstock/tx-policy";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { JupiterService } from "../src/modules/quotes/jupiter.service";
import { SolanaService } from "../src/modules/solana/solana.service";
import { MAX_TRANSACTION_BYTES, TxBuilderService } from "../src/modules/tx-builder/tx-builder.service";

/**
 * Against the real Jupiter API and a real RPC node.
 *
 * These are the tests that catch what offline tests structurally cannot: a
 * change in Jupiter's response shape, a route that stops being direct, and
 * above all the transaction sizes — which are the whole reason the optical
 * channel is dimensioned the way it is.
 *
 * The lookup-table bug lived here. Every offline test passed while a single
 * swap was 955 bytes instead of 581 and a two-leg basket would not fit,
 * because nothing offline knows how big a real route is.
 */
const config = new ConfigService({
  relayer: {
    jupiterApiUrl: process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1",
    jupiterApiKey: process.env.JUPITER_API_KEY ?? "",
  },
  solana: { rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com" },
});

const jupiter = new JupiterService(config);
const builder = new TxBuilderService(jupiter, new SolanaService(config));

const throwaway = () => base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));
const vault = throwaway();
const feePayer = throwaway();
const mint = (symbol: string) => ASSETS.find((a) => a.symbol === symbol)!.mint;
const leg = (symbol: string, usdc: number) => ({
  inMint: USDC_MINT,
  outMint: mint(symbol),
  inAmount: String(usdc * 1e6),
});

describe("quoting against the real Jupiter", () => {
  it("still answers the shape the relayer reads", async () => {
    const quote = await jupiter.quote({
      inputMint: USDC_MINT,
      outputMint: mint("TSLAx"),
      amount: "10000000",
      slippageBps: 100,
    });

    expect(quote.inAmount).toBe("10000000");
    expect(BigInt(quote.outAmount)).toBeGreaterThan(0n);
    // The floor the vault checks the swap cannot fill below.
    expect(BigInt(quote.otherAmountThreshold)).toBeLessThan(BigInt(quote.outAmount));
    expect(quote.route.length).toBeGreaterThan(0);
  });

  it("still returns lookup table addresses with their contents empty", async () => {
    // The exact shape that caused the bug: named but not inlined. If Jupiter
    // ever starts inlining them, the on-chain fetch becomes redundant rather
    // than load-bearing, and this test is where that shows up.
    const quote = await jupiter.quote({
      inputMint: USDC_MINT,
      outputMint: mint("TSLAx"),
      amount: "10000000",
      slippageBps: 100,
    });
    const swap = await jupiter.swapInstructions(quote, vault, feePayer);

    expect(swap.addressLookupTableAddresses.length).toBeGreaterThan(0);
    expect(Object.keys(swap.addressesByLookupTableAddress ?? {})).toHaveLength(0);
  });
});

describe("building against real routes", () => {
  it("puts a single swap inside the transaction limit", async () => {
    const built = await builder.build({ vault, feePayer, legs: [leg("TSLAx", 10)], slippageBps: 100 });

    expect(built.messages).toHaveLength(1);
    expect(built.sizes[0]).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
  });

  it("puts a three-leg basket in ONE transaction", async () => {
    // Feature C in a single assertion: one scan, one signature.
    const built = await builder.build({
      vault,
      feePayer,
      legs: [leg("AAPLx", 200), leg("NVDAx", 150), leg("MSFTx", 150)],
      slippageBps: 100,
    });

    expect(built.messages).toHaveLength(1);
    expect(built.kind).toBe("BASKET");
    expect(built.sizes[0]).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
    expect(built.legs).toHaveLength(3);
  });

  it("uses the lookup tables, so accounts do not sit inline", async () => {
    // This is the regression guard for the bug that made every transaction
    // roughly 350 bytes too big: Jupiter names the tables its route uses but
    // returns their contents empty, and dropping them leaves a dozen accounts
    // inline at 32 bytes each.
    //
    // Asserted as a property, not a byte count. Jupiter picks a different
    // route minute to minute — a two-hop route is legitimately larger than a
    // one-hop one, and an absolute size here fails for the wrong reason.
    const built = await builder.build({ vault, feePayer, legs: [leg("TSLAx", 10)], slippageBps: 100 });
    const message = decodeMessage(built.messages[0]!);

    expect(message.addressTableLookups.length).toBeGreaterThan(0);

    const movedOut = message.addressTableLookups.reduce(
      (sum, lookup) => sum + lookup.writableIndexes.length + lookup.readonlyIndexes.length,
      0,
    );
    // Each of those would otherwise be 32 bytes of static key.
    expect(movedOut).toBeGreaterThanOrEqual(8);
    expect(message.staticAccountKeys.length).toBeLessThan(movedOut + 12);
  });

  it("never makes the vault the fee payer", async () => {
    const built = await builder.build({ vault, feePayer, legs: [leg("TSLAx", 10)], slippageBps: 100 });
    const message = decodeMessage(built.messages[0]!);

    expect(feePayerOf(message)).toBe(feePayer);
    expect(feePayerOf(message)).not.toBe(vault);
  });

  it("emits only instructions the policy allows", async () => {
    const built = await builder.build({
      vault,
      feePayer,
      legs: [leg("AAPLx", 200), leg("NVDAx", 150)],
      slippageBps: 100,
    });
    const kinds = decompile(decodeMessage(built.messages[0]!)).map((ix) => ix.kind);

    expect(kinds).toContain("jupiter-route");
    // Anything the vault refuses outright would make the order unsignable.
    expect(kinds).not.toContain("token-approve");
    expect(kinds).not.toContain("token-close");
    expect(kinds).not.toContain("unknown");
  });

  it("refuses to build an order the vault would pay for", async () => {
    await expect(
      builder.build({ vault, feePayer: vault, legs: [leg("TSLAx", 10)], slippageBps: 100 }),
    ).rejects.toThrow(/cannot be the fee payer/);
  });
});
