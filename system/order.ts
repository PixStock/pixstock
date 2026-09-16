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

/**
 * Mint state as the relayer read it, recorded alongside the transaction.
 *
 * The vault refuses an order that omits it (rule P11): these mints scale
 * their amounts, and a ticket without the multiplier shows the wrong figure.
 */
const mintState = JSON.parse(
  readFileSync(join(process.cwd(), "apps/relayer/test/mint-state.json"), "utf8"),
) as {
  capturedAt: number;
  states: Array<{
    mint: string;
    multiplier: number;
    nextMultiplier: number;
    newMultiplierEffectiveTimestamp: number | null;
    permanentDelegate: string | null;
  }>;
};

/** The multiplier in force, by the same clock rule the relayer applies. */
function factsFor(mint: string) {
  const state = mintState.states.find((s) => s.mint === mint)!;
  const at = state.newMultiplierEffectiveTimestamp ?? 0;
  const pending = mintState.capturedAt < at;
  return {
    mint,
    multiplier: pending ? state.multiplier : state.nextMultiplier,
    ...(pending ? { nextMultiplier: state.nextMultiplier, nextMultiplierAt: at } : {}),
    ...(state.permanentDelegate ? { permanentDelegate: state.permanentDelegate } : {}),
    readAt: mintState.capturedAt,
  };
}

export interface Order {
  frames: string[];
  legCount: number;
  /** What the ticket should read for each leg's output, scaled. */
  expectedOut: Array<{ mint: string; multiplier: number }>;
}

export interface OrderOptions {
  /**
   * What price travels with the order.
   *
   * `none` is the honest default for this fixture: our Pyth grant does not
   * cover Apple, Nvidia or Microsoft, so a real order for them arrives
   * unattested and the vault asks the holder to say so out loud.
   *
   * `forged` is 205 bytes of noise — what a relayer that wanted a green tick
   * would attach if attaching bytes were enough.
   */
  attestation?: "none" | "forged";
  /**
   * How many transactions the order carries.
   *
   * The relayer really does split a basket that overflows 1,232 bytes, and
   * then it wants a signature per message. The vault reviews and signs the
   * first one only, so anything above 1 has to be refused out loud rather
   * than half-signed — see tx-builder.service.ts.
   */
  txCount?: number;
  /**
   * Wraps the payload in the frames of a different session.
   *
   * The session id travels twice, in the frame headers and inside the CBOR.
   * This is the attack the second copy exists to stop: a payload captured
   * from one session, re-wrapped and replayed in another's headers.
   */
  wrongSession?: boolean;
}

/** An order addressed to `vault`, which the test reads out of the browser. */
export function orderFor(vault: string, options: OrderOptions = {}): Order {
  const sid = newSessionId();
  const attestation = options.attestation ?? "none";

  const request: SignRequest = {
    kind: "SIGN",
    sid,
    vault,
    txs: Array.from({ length: options.txCount ?? 1 }, () =>
      Uint8Array.from(Buffer.from(fixture.messages[0]!, "base64")),
    ),
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
      mints: fixture.legs.map((leg) => factsFor(leg.outMint)),
    },
    ...(attestation === "forged" ? { price: new Uint8Array(205).fill(9) } : {}),
  };

  return {
    frames: encodeFrames(encodePayload(request), {
      sid: options.wrongSession ? newSessionId() : sid,
    }),
    legCount: fixture.legs.length,
    expectedOut: fixture.legs.map((leg) => ({
      mint: leg.outMint,
      multiplier: factsFor(leg.outMint).multiplier,
    })),
  };
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

/**
 * A Paper-Vault sheet, exactly as the export prints one.
 *
 * Recorded rather than computed here: Playwright compiles these files to
 * CommonJS and cannot load the vault's crypto chain. Regenerate with
 *
 *   node -e "import('./packages/vault-crypto/dist/index.js').then(async v => {
 *     const b = await v.lock(new Uint8Array(32), 'a recorded paper vault');
 *     console.log(v.encodePaperVault(b));
 *   })"
 */
export const PAPER_VAULT = {
  code:
    "PVLT:W503H0000000V50KA0N65/I3O3EZNGYSK6ESGZCS+CSLH7C5DTHNS19XI5GCKUD9I5-%KZSCH14E/7:89TQEWG7O9QZUHJMOCHQW1WHJV$SS59SA0PT9JE/0/$L2YRPXH8RI+K2I7JQLNJRS-G4/XJ5MHCDU1GUENGRQSKG2%68S-0NP4Q73NWN1ID00000",
  publicKey: "3mLxV9ce1EE77Ac7DVw7NgHo8UTcmBvdsD3tMH2PgcTr",
  password: "a recorded paper vault",
} as const;
