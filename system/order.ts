import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeFrames, encodePayload, newSessionId, type SignRequest } from "@pixstock/agqp";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

/**
 * Builds the frames a system test feeds to the vault.
 *
 * The transaction comes from the recorded basket the relayer really built, so
 * the browser sees the same bytes a live order produces.
 */
// Playwright compiles these files to CommonJS, so no import.meta here. The
// runner always starts at the repository root.
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "packages/tx-policy/test/fixtures/basket-order.json"), "utf8")
) as {
  feePayer: string;
  kind: "BUY" | "SELL" | "BASKET";
  messages: string[];
  legs: Array<{
    inMint: string;
    outMint: string;
    inAmount: string;
    expectedOutAmount: string;
    minOutAmount: string;
  }>;
};

export interface Order {
  frames: string[];
  legCount: number;
}

/** An order addressed to `vault`, which the test reads out of the browser. */
export function orderFor(vault: string): Order {
  const sid = newSessionId();

  const request: SignRequest = {
    kind: "SIGN",
    sid,
    vault,
    txs: fixture.messages.map((m) => Uint8Array.from(Buffer.from(m, "base64"))),
    manifest: {
      kind: fixture.kind,
      legs: fixture.legs.map((leg) => ({
        inMint: leg.inMint,
        outMint: leg.outMint,
        inAmount: leg.inAmount,
        expectedOutAmount: leg.expectedOutAmount,
        minOutAmount: leg.minOutAmount,
      })),
      slippageBps: 100,
      feePayer: fixture.feePayer,
      dapp: "app.pixstock.xyz",
      quotedAt: Math.floor(Date.now() / 1000) - 4,
    },
    price: new Uint8Array(205).fill(9),
  };

  return { frames: encodeFrames(encodePayload(request), { sid }), legCount: fixture.legs.length };
}

/** A throwaway vault, for the "this order is not yours" path. */
export function strangerVault(): string {
  return base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));
}

/** The browser hands back raw bytes; orders are addressed in base58. */
export function toBase58(bytes: number[]): string {
  return base58.encode(Uint8Array.from(bytes));
}

/** The vault the recorded basket was actually built for. */
export const FIXTURE_VAULT = fixture.vault;

/**
 * The fixture's vault, already encrypted, exactly as the browser stores it.
 *
 * A system test cannot create a fresh vault and feed it this order: the token
 * accounts in the recorded transaction belong to the vault it was built for,
 * so the policy rightly refuses it for anyone else. Planting the matching key
 * is what lets the happy path run at all — the refusal has its own test.
 *
 * Locked at capture time rather than here: Playwright compiles to CommonJS
 * and cannot load the ESM package chain.
 */
export const STORED_BLOB = fixture.storedBlob;
export const VAULT_PASSWORD = fixture.testPassword;
