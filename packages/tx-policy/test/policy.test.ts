import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PROGRAM_IDS, USDC_MINT, type OrderManifest } from "@pixstock/shared";
import {
  COMPUTE_BUDGET_PROGRAM,
  MAX_SLIPPAGE_BPS,
  SYSTEM_PROGRAM,
  applyPolicy,
  decompile,
  deriveAta,
  parseTransaction,
  type CompiledMessage,
  type DecodedInstruction,
  type PolicyRule,
} from "../src/index.js";

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
  };
});

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

  it("is still not ok, because P8 is not enforced yet", () => {
    // A policy that reports success while skipping a rule hands the holder a
    // green tick it has not earned.
    const result = evaluate();
    expect(result.unevaluated).toContain("P8");
    expect(result.ok).toBe(false);
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
