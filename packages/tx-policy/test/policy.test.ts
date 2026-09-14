import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ASSETS,
  PROGRAM_IDS,
  USDC_MINT,
  formatScaled,
  type OrderManifest,
} from "@pixstock/shared";
import {
  COMPUTE_BUDGET_PROGRAM,
  MAX_SLIPPAGE_BPS,
  POLICY_RULES,
  SYSTEM_PROGRAM,
  applyPolicy,
  decompile,
  deriveAta,
  parseTransaction,
  type CompiledMessage,
  type DecodedInstruction,
  type PolicyRule,
} from "../src/index.js";

/**
 * The TSLAx multiplier as read from mainnet on 12 Sept 2026.
 *
 * It rides with the order because the vault has no network — see P11. Tests
 * that omit it are testing an order whose ticket would be wrong, which is
 * exactly what P11 exists to catch.
 */
const TSLAX_MULTIPLIER = 1.0;
const BACKED_DELEGATE = "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/jupiter-swap.json", import.meta.url), "utf8")
) as {
  vault: string;
  payer: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  swapTransaction: string;
};

let message: CompiledMessage;
let decoded: DecodedInstruction[];
let manifest: OrderManifest;

beforeAll(() => {
  const tx = parseTransaction(Uint8Array.from(Buffer.from(fixture.swapTransaction, "base64")));
  message = tx.message;
  decoded = decompile(message);
  manifest = {
    kind: "BUY",
    vault: fixture.vault,
    slippageBps: 100,
    createdAt: Math.floor(Date.now() / 1000),
    legs: [
      {
        inMint: fixture.inputMint,
        outMint: fixture.outputMint,
        inAmount: fixture.inAmount,
        expectedOutAmount: fixture.outAmount,
      },
    ],
    mints: [
      {
        mint: fixture.outputMint,
        multiplier: TSLAX_MULTIPLIER,
        permanentDelegate: BACKED_DELEGATE,
        readAt: Math.floor(Date.now() / 1000),
      },
    ],
  };
});

/** The same manifest with its declared mint state replaced. */
const withMints = (mints: OrderManifest["mints"]): OrderManifest => ({ ...manifest, mints });

const evaluate = (over: Partial<Parameters<typeof applyPolicy>[0]> = {}) =>
  applyPolicy({ message, decoded, manifest, vault: fixture.vault, ...over });

/** Replaces one decoded instruction, leaving the rest of the real route alone. */
const withInstruction = (instruction: Partial<DecodedInstruction>): DecodedInstruction[] => [
  ...decoded,
  { programId: PROGRAM_IDS.token2022, kind: "unknown", accounts: [], detail: {}, ...instruction },
];

const ruleFired = (rule: PolicyRule, result: ReturnType<typeof applyPolicy>) =>
  result.violations.some((v) => v.rule === rule);

describe("an honest order", () => {
  it("raises no violation", () => {
    expect(evaluate().violations).toEqual([]);
  });

  it("produces a readable ticket, in units rather than raw amounts", () => {
    const { ticket } = evaluate();
    expect(ticket).toBeDefined();
    expect(ticket!.lines).toHaveLength(2);
    expect(ticket!.lines[0]).toMatchObject({ symbol: "USDC", direction: "in", amount: "10" });
    expect(ticket!.lines[1]).toMatchObject({ symbol: "TSLAx", direction: "out" });
    expect(ticket!.networkFeePaidBy).toBe("relayer");
  });

  it("discloses the permanent delegate on the ticket, not in a legal page", () => {
    // The issuer can move these tokens without the holder. No signing device
    // changes that, so the only honest thing left is to say it here.
    const { ticket } = evaluate();
    const delegate = ticket!.disclosures.find((d) => d.text.includes("without your signature"));
    expect(delegate).toBeDefined();
    expect(delegate!.severity).toBe("warn");
    expect(delegate!.symbol).toBe("TSLAx");
    // Named, in the words a holder would use, and without an address in the
    // middle of the sentence.
    expect(delegate!.text).toContain("Backed Finance can move TSLAx out of your account");
  });

  it("is ok, with every rule actually evaluated", () => {
    // A policy that reports success while skipping a rule hands the holder a
    // green tick it has not earned, so `ok` is only allowed to be true when
    // `unevaluated` is empty.
    const result = evaluate();
    expect(result.unevaluated).toEqual([]);
    expect(result.evaluated).toHaveLength(Object.keys(POLICY_RULES).length);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("adversarial mutations", () => {
  it("P1 — the vault is made the fee payer", () => {
    const drained: CompiledMessage = {
      ...message,
      staticAccountKeys: [fixture.vault, ...message.staticAccountKeys.slice(1)],
    };
    expect(ruleFired("P1", evaluate({ message: drained }))).toBe(true);
  });

  it("P2 — an unknown program is spliced in", () => {
    const result = evaluate({
      decoded: withInstruction({ programId: "MEMOSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", kind: "unknown" }),
    });
    expect(ruleFired("P2", result)).toBe(true);
  });

  it("P2 — a program hidden behind a lookup table", () => {
    const result = evaluate({
      decoded: withInstruction({ programId: "lookup:42", kind: "unknown" }),
    });
    expect(ruleFired("P2", result)).toBe(true);
  });

  it("P2 — an instruction whose bytes cannot be read", () => {
    const result = evaluate({
      decoded: withInstruction({
        programId: PROGRAM_IDS.jupiterV6,
        kind: "unknown",
        undecodable: "unrecognised Jupiter instruction",
      }),
    });
    expect(ruleFired("P2", result)).toBe(true);
  });

  it("P3 — a hidden approve", () => {
    const result = evaluate({
      decoded: withInstruction({ kind: "token-approve", detail: { amount: "999999999" } }),
    });
    expect(ruleFired("P3", result)).toBe(true);
  });

  it("P3 — an authority change", () => {
    const result = evaluate({
      decoded: withInstruction({ kind: "token-authority", detail: { authorityType: 2 } }),
    });
    expect(ruleFired("P3", result)).toBe(true);
  });

  it("P4 — closing a token account", () => {
    expect(ruleFired("P4", evaluate({ decoded: withInstruction({ kind: "token-close" }) }))).toBe(true);
  });

  it("P4 — burning tokens", () => {
    const result = evaluate({
      decoded: withInstruction({ kind: "token-burn", detail: { amount: "1" } }),
    });
    expect(ruleFired("P4", result)).toBe(true);
  });

  it("P5 — the output is routed to someone else's account", () => {
    const elsewhere: OrderManifest = {
      ...manifest,
      legs: [{ ...manifest.legs[0]!, outMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp" }],
    };
    // A different mint derives a different ATA, which is not in this message.
    expect(ruleFired("P5", evaluate({ manifest: elsewhere }))).toBe(true);
  });

  it("P6 — the manifest understates what is actually being spent", () => {
    const understated: OrderManifest = {
      ...manifest,
      legs: [{ ...manifest.legs[0]!, inAmount: "1000000" }],
    };
    const result = evaluate({ manifest: understated });
    expect(ruleFired("P6", result)).toBe(true);
    expect(result.violations.find((v) => v.rule === "P6")!.detail).toContain(fixture.inAmount);
  });

  it("P6 — the manifest promises more than the swap quotes", () => {
    // The figure the holder actually reads. Checking only what is being spent
    // leaves "you receive" taken on trust, and a relayer that inflates it
    // shows a ticket promising shares the transaction will never deliver.
    const inflated: OrderManifest = {
      ...manifest,
      legs: [
        { ...manifest.legs[0]!, expectedOutAmount: String(BigInt(manifest.legs[0]!.expectedOutAmount) * 2n) },
      ],
    };
    const result = evaluate({ manifest: inflated });
    expect(ruleFired("P6", result)).toBe(true);
    expect(result.violations.find((v) => v.rule === "P6")!.detail).toMatch(/quotes/);
  });

  it("the ticket's receive line comes from the instruction, not the manifest", () => {
    const result = evaluate({});
    const received = result.ticket!.lines.filter((line) => line.direction === "out");
    const quoted = decoded
      .filter((ix) => ix.kind === "jupiter-route")
      .map((ix) => String(ix.detail.quotedOutAmount));

    expect(received.map((line) => line.rawAmount)).toEqual(quoted);
  });

  // P8 — the durable nonce. The recorded basket is blockhash-bound and
  // carries no advance, so each of these adds one.
  const nonceAdvance = (authority: string): DecodedInstruction => ({
    programId: SYSTEM_PROGRAM,
    kind: "advance-nonce",
    // Nonce account, recent blockhashes sysvar, authority.
    accounts: ["NonceAccount1111111111111111111111111111111", "SysvarRecentB1ockHashes11111111111111111111", authority],
    detail: {},
  });

  it("P8 — the vault is made the nonce authority", () => {
    // It would have the vault authorise a state change on an account whose
    // contents it does not control.
    const decodedWith = [nonceAdvance(fixture.vault), ...decoded];
    const result = evaluate({ decoded: decodedWith });
    expect(ruleFired("P8", result)).toBe(true);
    expect(result.violations.find((v) => v.rule === "P8")!.detail).toMatch(/never be/);
  });

  it("P8 — two nonce advances in one transaction", () => {
    const relayer = fixture.payer;
    const decodedWith = [nonceAdvance(relayer), ...decoded, nonceAdvance(relayer)];
    expect(ruleFired("P8", evaluate({ decoded: decodedWith }))).toBe(true);
  });

  it("P8 — the advance is not the first instruction", () => {
    const decodedWith = [...decoded, nonceAdvance(fixture.payer)];
    const result = evaluate({ decoded: decodedWith });
    expect(ruleFired("P8", result)).toBe(true);
    expect(result.violations.find((v) => v.rule === "P8")!.detail).toMatch(/must be the first/);
  });

  it("P8 — the authority hides behind a lookup table", () => {
    // Unreadable is not the same as safe: the vault cannot tell whether that
    // index resolves to itself.
    const decodedWith = [nonceAdvance("lookup:7"), ...decoded];
    expect(ruleFired("P8", evaluate({ decoded: decodedWith }))).toBe(true);
  });

  it("P8 — a relayer-authorised advance, first, is fine", () => {
    const decodedWith = [nonceAdvance(fixture.payer), ...decoded];
    expect(ruleFired("P8", evaluate({ decoded: decodedWith }))).toBe(false);
  });

  it("P12 — the swap is authorised by someone other than the vault", () => {
    // Jupiter moves tokens on one account's authority. If that is not this
    // vault, the transaction is reaching into something else — or is arranged
    // so a second signature could.
    const hijacked = decoded.map((ix) =>
      ix.kind === "jupiter-route"
        ? { ...ix, accounts: [ix.accounts[0]!, "5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq", ...ix.accounts.slice(2)] }
        : ix
    );
    expect(ruleFired("P12", evaluate({ decoded: hijacked }))).toBe(true);
  });

  it("P12 — the authority hides behind a lookup table", () => {
    const hidden = decoded.map((ix) =>
      ix.kind === "jupiter-route"
        ? { ...ix, accounts: [ix.accounts[0]!, "lookup:12", ...ix.accounts.slice(2)] }
        : ix
    );
    expect(ruleFired("P12", evaluate({ decoded: hidden }))).toBe(true);
  });

  it("P12 — a route variant this build has never seen is refused, not skipped", () => {
    // Checking the wrong index is worse than refusing: it would report a
    // green tick for an account nobody looked at.
    const unknown = decoded.map((ix) =>
      ix.kind === "jupiter-route"
        ? { ...ix, detail: { ...ix.detail, route: "someFutureRoute" } }
        : ix
    );
    const result = evaluate({ decoded: unknown });
    expect(ruleFired("P12", result)).toBe(true);
    expect(result.violations.find((v) => v.rule === "P12")!.detail).toMatch(/does not know/);
  });

  it("P7 — slippage wider than the manifest declared", () => {
    const tight: OrderManifest = { ...manifest, slippageBps: 10 };
    expect(ruleFired("P7", evaluate({ manifest: tight }))).toBe(true);
  });

  it("P7 — slippage over the hard cap, whatever the manifest says", () => {
    const wide = decoded.map((ix) =>
      ix.kind === "jupiter-route"
        ? { ...ix, detail: { ...ix.detail, slippageBps: MAX_SLIPPAGE_BPS + 1 } }
        : ix
    );
    const permissive: OrderManifest = { ...manifest, slippageBps: 10_000 };
    expect(ruleFired("P7", evaluate({ decoded: wide, manifest: permissive }))).toBe(true);
  });

  it("P9 — an extra swap leg the manifest never declared", () => {
    const smuggled = evaluate({
      decoded: withInstruction({
        programId: PROGRAM_IDS.jupiterV6,
        kind: "jupiter-route",
        detail: { route: "route", exactOut: false, inAmount: "50000000", slippageBps: 100 },
      }),
    });
    expect(ruleFired("P9", smuggled)).toBe(true);
  });

  it("P10 — lamports drained from the vault", () => {
    const result = evaluate({
      decoded: withInstruction({
        programId: SYSTEM_PROGRAM,
        kind: "system-transfer",
        accounts: [fixture.vault, "SomeoneElse1111111111111111111111111111111"],
        detail: { lamports: "500000000" },
      }),
    });
    expect(ruleFired("P10", result)).toBe(true);
  });

  it("withholds the ticket whenever anything fails", () => {
    expect(evaluate({ decoded: withInstruction({ kind: "token-close" }) }).ticket).toBeUndefined();
  });
});

describe("ATA derivation", () => {
  it("agrees with what Jupiter put in the real transaction", () => {
    const derived = deriveAta(fixture.vault, fixture.outputMint, PROGRAM_IDS.token2022);
    expect(message.staticAccountKeys).toContain(derived);

    const createAta = decoded.find((ix) => ix.kind === "create-ata");
    expect(createAta!.accounts[1]).toBe(derived);
  });

  it("derives a different account under the legacy token program", () => {
    const token2022 = deriveAta(fixture.vault, fixture.outputMint, PROGRAM_IDS.token2022);
    const legacy = deriveAta(fixture.vault, fixture.outputMint, PROGRAM_IDS.token);
    expect(legacy).not.toBe(token2022);
  });

  it("finds the vault's USDC account in the real transaction", () => {
    expect(message.staticAccountKeys).toContain(deriveAta(fixture.vault, USDC_MINT, PROGRAM_IDS.token));
  });
});

describe("instruction decoding on the real route", () => {
  it("reads the compute budget", () => {
    expect(decoded[0]).toMatchObject({
      programId: COMPUTE_BUDGET_PROGRAM,
      kind: "compute-budget",
      detail: { setting: "unitLimit" },
    });
  });

  it("reads the amounts Jupiter quoted", () => {
    const swap = decoded.find((ix) => ix.kind === "jupiter-route")!;
    expect(swap.detail).toMatchObject({
      route: "route",
      exactOut: false,
      inAmount: fixture.inAmount,
      quotedOutAmount: fixture.outAmount,
      slippageBps: 100,
      // The route plan is a moving target; it is left opaque rather than guessed.
      routePlanOpaque: true,
    });
  });
});

/**
 * P11 — the multiplier.
 *
 * Every other figure on the ticket is read out of the transaction. This one
 * cannot be: it lives on the mint, and the vault is in airplane mode. So it
 * travels with the order, which makes it the one number a sender chooses.
 *
 * Two things are checkable without a network, and both are checked: a mint
 * the vault knows scales must declare one, and a mint it knows does not must
 * not. Neither proves the value; the ticket prints it for that.
 */
describe("P11 — the multiplier that has to travel", () => {
  it("refuses an order that omits the multiplier of a scaling mint", () => {
    const result = evaluate({ manifest: withMints(undefined) });
    expect(ruleFired("P11", result)).toBe(true);
    expect(result.violations[0]!.detail).toContain("TSLAx");
    // No ticket at all, rather than a ticket with a quietly wrong amount.
    expect(result.ticket).toBeUndefined();
  });

  it("refuses a multiplier declared for a mint that does not scale", () => {
    // The attack this closes: declare USDC ×5 and have the vault render
    // "You pay 50 USDC" over a transaction that spends 10.
    const result = evaluate({
      manifest: withMints([
        ...manifest.mints!,
        { mint: USDC_MINT, multiplier: 5, readAt: manifest.mints![0]!.readAt },
      ]),
    });
    expect(ruleFired("P11", result)).toBe(true);
    expect(result.violations.some((v) => v.detail.includes("USDC"))).toBe(true);
  });

  it("refuses a multiplier outside the plausible band", () => {
    const result = evaluate({
      manifest: withMints([{ ...manifest.mints![0]!, multiplier: 1e6 }]),
    });
    expect(ruleFired("P11", result)).toBe(true);
  });

  it("refuses a scheduled multiplier that is not plausible either", () => {
    const result = evaluate({
      manifest: withMints([{ ...manifest.mints![0]!, nextMultiplier: 0 }]),
    });
    expect(ruleFired("P11", result)).toBe(true);
  });

  it("refuses mint state for a mint no leg touches", () => {
    const result = evaluate({
      manifest: withMints([
        ...manifest.mints!,
        {
          mint: ASSETS.find((a) => a.symbol === "AAPLx")!.mint,
          multiplier: 1.00266,
          readAt: manifest.mints![0]!.readAt,
        },
      ]),
    });
    expect(ruleFired("P11", result)).toBe(true);
    expect(result.violations.some((v) => v.detail.includes("no leg touches"))).toBe(true);
  });

  it("never applies a multiplier to a mint the vault knows does not scale", () => {
    // USDC is in the legs and has no entry: its line must read exactly 1.
    const { ticket } = evaluate();
    const usdc = ticket!.lines.find((line) => line.symbol === "USDC")!;
    expect(usdc.multiplier).toBe(1);
    expect(usdc.amount).toBe(usdc.unscaledAmount);
  });

  it("applies a declared multiplier to the amount the holder reads", () => {
    const scaled = 1.00266;
    const { ticket } = evaluate({
      manifest: withMints([{ ...manifest.mints![0]!, multiplier: scaled }]),
    });
    const out = ticket!.lines.find((line) => line.direction === "out")!;

    expect(out.multiplier).toBe(scaled);
    // The raw amount is untouched — only the presentation moves.
    expect(out.rawAmount).toBe(fixture.outAmount);
    expect(out.amount).not.toBe(out.unscaledAmount);
    // Compared against the shared scaler rather than against the other
    // displayed string: both are truncated for display, and multiplying one
    // truncation by the multiplier is not the same number.
    expect(out.amount).toBe(formatScaled(fixture.outAmount, 8, scaled));
  });

  it("says where the multiplier came from, and what it would read without it", () => {
    const { ticket } = evaluate({
      manifest: withMints([{ ...manifest.mints![0]!, multiplier: 1.00266 }]),
    });
    const note = ticket!.disclosures.find((d) => d.text.includes("scaled by"))!;
    expect(note).toBeDefined();
    expect(note.text).toContain("not verifiable offline");
    expect(note.text).toContain(
      ticket!.lines.find((line) => line.direction === "out")!.unscaledAmount,
    );
  });

  it("announces a scheduled change with the date it lands", () => {
    const { ticket } = evaluate({
      manifest: withMints([
        { ...manifest.mints![0]!, nextMultiplier: 1.05, nextMultiplierAt: 1_789_300_000 },
      ]),
    });
    const note = ticket!.disclosures.find((d) => d.text.includes("takes effect"))!;
    expect(note).toBeDefined();
    // A date the holder can act on, not just "a change is coming".
    expect(note.text).toContain("2026-09-13");
    expect(note.text).toContain("×1.05");
  });

  it("warns about the permanent delegate even when the order omits it", () => {
    // The address travels with the order, so a sender could drop it. The flag
    // that drives this warning does not travel: it is in the vault's own
    // table, and suppressing the address now only costs the attacker the name.
    const { ticket } = evaluate({
      manifest: withMints([{ mint: fixture.outputMint, multiplier: 1, readAt: 1 }]),
    });
    const delegate = ticket!.disclosures.find((d) => d.text.includes("without your signature"))!;
    expect(delegate).toBeDefined();
    expect(delegate.severity).toBe("warn");
    expect(delegate.text).toContain("does not say which address");
  });

  it("dates the reading, because a multiplier is a moving number", () => {
    const { ticket } = evaluate();
    expect(ticket!.mintsReadAt).toBe(manifest.mints![0]!.readAt);
  });
});
