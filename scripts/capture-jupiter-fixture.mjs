/**
 * Captures a real Jupiter mainnet swap transaction as a test fixture.
 *
 * No funds and no key are needed: Jupiter builds the transaction from public
 * keys alone. What leaves this machine is two mint addresses, an amount and
 * two throwaway public keys — nothing else.
 *
 * Run: node scripts/capture-jupiter-fixture.mjs
 */
import { writeFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { ASSETS, USDC_MINT } from "@pixstock/shared";

const API = process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1";

const throwawayPubkey = () => base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));

const vault = throwawayPubkey();
const payer = throwawayPubkey();

const tesla = ASSETS.find((a) => a.symbol === "TSLAx");

const quoteUrl = new URL(`${API}/quote`);
quoteUrl.search = new URLSearchParams({
  inputMint: USDC_MINT,
  outputMint: tesla.mint,
  amount: "10000000", // 10 USDC
  slippageBps: "100",
  onlyDirectRoutes: "true",
}).toString();

const quote = await fetch(quoteUrl).then((r) => r.json());
if (!quote.outAmount) throw new Error(`quote failed: ${JSON.stringify(quote).slice(0, 300)}`);

const swap = await fetch(`${API}/swap`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    quoteResponse: quote,
    userPublicKey: vault,
    // The whole point: the vault signs, someone else pays.
    payer,
    wrapAndUnwrapSol: false,
    skipUserAccountsRpcCalls: true,
    dynamicComputeUnitLimit: false,
  }),
}).then((r) => r.json());

if (!swap.swapTransaction) throw new Error(`swap failed: ${JSON.stringify(swap).slice(0, 400)}`);

const raw = Buffer.from(swap.swapTransaction, "base64");

const fixture = {
  capturedAt: new Date().toISOString(),
  source: `${API}/swap`,
  note: "Real mainnet route, built with payer != user. No funds involved; both keys are throwaway.",
  vault,
  payer,
  inputMint: USDC_MINT,
  outputMint: tesla.mint,
  inAmount: quote.inAmount,
  outAmount: quote.outAmount,
  otherAmountThreshold: quote.otherAmountThreshold,
  route: quote.routePlan?.map((p) => p.swapInfo.label),
  transactionBytes: raw.length,
  swapTransaction: swap.swapTransaction,
};

const path = new URL("../packages/tx-policy/test/fixtures/jupiter-swap.json", import.meta.url);
writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");

console.log(`captured ${raw.length} bytes · route ${fixture.route?.join(" → ")}`);
console.log(`10 USDC → ${(Number(quote.outAmount) / 1e8).toFixed(6)} TSLAx`);
