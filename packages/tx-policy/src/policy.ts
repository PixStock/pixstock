/**
 * The signing policy: P1 to P11.
 *
 * This is the half that decides. The decoder says what the transaction does;
 * this says whether the vault is allowed to sign it, and produces the ticket
 * the holder actually reads.
 *
 * The manifest is never the source of truth. Every figure on the ticket is
 * taken from the decoded instructions; the manifest is only ever compared
 * against them, and a disagreement is a refusal.
 *
 * Rules that are not implemented yet are reported as `unevaluated` and make
 * the result `ok: false`. A policy that quietly skips half its checks is
 * worse than no policy at all — it produces a green tick the holder trusts.
 */

import {
  PROGRAM_IDS,
  assetByMint,
  factsForMint,
  formatAmount,
  formatScaled,
  isScaledMint,
  multiplierProblem,
  symbolOfMint,
  type MintFacts,
  type OrderManifest,
} from "@pixstock/shared";
import {
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  type DecodedInstruction,
} from "./instructions.js";
import { feePayerOf, type CompiledMessage } from "./message.js";
import { deriveAta } from "./pda.js";

export type PolicyRule =
  | "P1" | "P2" | "P3" | "P4" | "P5"
  | "P6" | "P7" | "P8" | "P9" | "P10" | "P11";

export const POLICY_RULES: Record<PolicyRule, string> = {
  P1: "The vault must not be the fee payer",
  P2: "Every program must be in the allowlist and nameable",
  P3: "No delegation: no approve, revoke or authority change",
  P4: "No closing or burning a vault token account",
  P5: "Swap output must land in an account the vault derives itself",
  P6: "Amounts must match the manifest",
  P7: "Slippage must be within the manifest and the hard cap",
  P8: "At most one nonce advance, and the vault is not its authority",
  P9: "The number of swap legs must match the manifest",
  P10: "No lamports may leave the vault",
  P11: "Scaled mints must declare a plausible multiplier, and only scaled mints may declare one",
};

/** Nothing above this signs, whatever the manifest asks for. */
export const MAX_SLIPPAGE_BPS = 300;

const ALLOWED_PROGRAMS = new Set([
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  PROGRAM_IDS.token,
  PROGRAM_IDS.token2022,
  PROGRAM_IDS.associatedToken,
  PROGRAM_IDS.jupiterV6,
]);

export interface TicketLine {
  symbol: string;
  direction: "in" | "out";
  /**
   * What the holder reads: scaled by the mint's decimals AND by its
   * ScaledUiAmount multiplier. For an xStock the two differ — up to half a
   * percent on the figures measured in September 2026 — and this is the
   * screen on which being wrong matters most.
   */
  amount: string;
  /** The same figure with the multiplier left off. Shown beside it. */
  unscaledAmount: string;
  rawAmount: string;
  /** Applied above. 1 for any mint the vault does not know to be scaled. */
  multiplier: number;
  mint: string;
}

/**
 * Something true about this order that the holder would not otherwise see.
 *
 * Not a policy violation — these are things the product genuinely cannot
 * prevent, only state. Hiding them would make the ticket a nicer lie.
 */
export interface TicketDisclosure {
  severity: "note" | "warn";
  /** The asset it concerns, or `null` when it is about the order as a whole. */
  symbol: string | null;
  text: string;
}

export interface OrderTicket {
  kind: OrderManifest["kind"];
  lines: TicketLine[];
  feePayer: string;
  networkFeePaidBy: "relayer" | "vault";
  slippageBps: number;
  disclosures: TicketDisclosure[];
  /** Oldest `readAt` among the mints applied, unix seconds. */
  mintsReadAt: number | null;
}

export interface PolicyViolation {
  rule: PolicyRule;
  detail: string;
}

export interface PolicyResult {
  ok: boolean;
  /** Rules this build actually checked. */
  evaluated: PolicyRule[];
  /** Rules that exist on paper and are not enforced yet. */
  unevaluated: PolicyRule[];
  violations: PolicyViolation[];
  /** Present when every evaluated rule passed, whatever `ok` says. */
  ticket?: OrderTicket;
}

/** Implemented today. The rest are listed so nothing looks checked that is not. */
export const EVALUATED_RULES: readonly PolicyRule[] = [
  "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P9", "P10", "P11",
];
export const UNEVALUATED_RULES: readonly PolicyRule[] = ["P8"];

const EVALUATED = EVALUATED_RULES as PolicyRule[];
const UNEVALUATED = UNEVALUATED_RULES as PolicyRule[];

export interface PolicyInput {
  message: CompiledMessage;
  decoded: DecodedInstruction[];
  manifest: OrderManifest;
  /** The vault's own public key, from its own storage — never from the payload. */
  vault: string;
}

export function applyPolicy({ message, decoded, manifest, vault }: PolicyInput): PolicyResult {
  const violations: PolicyViolation[] = [];
  const fail = (rule: PolicyRule, detail: string) => violations.push({ rule, detail });

  // P1 — the vault must not pay. This is the Zero-SOL promise; if it fails,
  // the transaction is draining the vault for fees and rent.
  const feePayer = feePayerOf(message);
  if (feePayer === vault) fail("P1", "The vault is the fee payer");

  // P2 — every program nameable and allowed.
  for (const instruction of decoded) {
    if (instruction.programId.startsWith("lookup:")) {
      fail("P2", `A program comes from a lookup table and cannot be identified (${instruction.programId})`);
    } else if (!ALLOWED_PROGRAMS.has(instruction.programId)) {
      fail("P2", `Program ${instruction.programId} is not in the allowlist`);
    }
    if (instruction.undecodable && instruction.kind === "unknown") {
      fail("P2", `Cannot read an instruction: ${instruction.undecodable}`);
    }
  }

  // P3 — delegation, in any form, is how a single signature becomes a
  // standing permission. There is no legitimate reason for one here.
  for (const instruction of decoded) {
    if (instruction.kind === "token-approve") fail("P3", "The transaction delegates token authority");
    if (instruction.kind === "token-authority") fail("P3", "The transaction changes an account authority");
  }

  // P4 — closing or burning.
  for (const instruction of decoded) {
    if (instruction.kind === "token-close") fail("P4", "The transaction closes a token account");
    if (instruction.kind === "token-burn") fail("P4", "The transaction burns tokens");
  }

  // P10 — bare lamport transfers out of the vault.
  for (const instruction of decoded) {
    if (instruction.kind === "system-transfer" && instruction.accounts[0] === vault) {
      fail("P10", `The transaction moves ${instruction.detail.lamports} lamports out of the vault`);
    }
  }

  const swaps = decoded.filter((instruction) => instruction.kind === "jupiter-route");

  // P9 — one swap per manifest leg, no more and no fewer.
  if (swaps.length !== manifest.legs.length) {
    fail("P9", `The manifest declares ${manifest.legs.length} leg(s), the transaction carries ${swaps.length}`);
  }

  // P5 — the destination must be an account the vault can derive. Being told
  // "this is your token account" is exactly what an attacker would say.
  for (const leg of manifest.legs) {
    const asset = assetByMint(leg.outMint);
    if (!asset) {
      fail("P5", `Unknown output mint ${leg.outMint}`);
      continue;
    }
    const expected = deriveAta(vault, leg.outMint, asset.tokenProgram);
    const present =
      message.staticAccountKeys.includes(expected) ||
      decoded.some((instruction) => instruction.accounts.includes(expected));
    if (!present) {
      fail("P5", `${asset.symbol} would not land in the vault's own account (${expected})`);
    }
  }

  // P6 and P7 — the numbers. Compared leg by leg against what the instruction
  // really carries, in the order the manifest declares them.
  swaps.forEach((swap, i) => {
    const leg = manifest.legs[i];
    if (!leg) return;

    const exactOut = swap.detail.exactOut === true;
    const declared = exactOut ? leg.expectedOutAmount : leg.inAmount;
    const actual = String(exactOut ? swap.detail.outAmount : swap.detail.inAmount);

    if (actual !== declared) {
      fail(
        "P6",
        `Leg ${i + 1}: the manifest says ${declared}, the instruction says ${actual}`
      );
    }

    const slippageBps = Number(swap.detail.slippageBps ?? 0);
    if (slippageBps > manifest.slippageBps) {
      fail("P7", `Leg ${i + 1}: slippage ${slippageBps} bps exceeds the declared ${manifest.slippageBps}`);
    }
    if (slippageBps > MAX_SLIPPAGE_BPS) {
      fail("P7", `Leg ${i + 1}: slippage ${slippageBps} bps is over the hard cap of ${MAX_SLIPPAGE_BPS}`);
    }
  });

  // P11 — the multiplier. It is not on the transaction and an air-gapped
  // vault cannot look it up, so it travels with the order; that makes it the
  // one number on the ticket a sender chooses. Two things are checkable
  // offline and both are done here.
  //
  //   1. A mint the vault KNOWS scales (the table in @pixstock/shared) must
  //      declare one. Silence understates the amount, and a ticket that is
  //      quietly wrong is what this whole product exists to prevent.
  //   2. A mint the vault knows does NOT scale must not declare one, or a
  //      sender could multiply the USDC figure by five and have the vault
  //      render it. `buildTicket` also refuses to apply such a multiplier —
  //      belt and braces, because that one is an outright forgery.
  //
  // Neither proves the value is the value on chain. Nothing offline can. What
  // the ticket does instead is print it, and say where it came from.
  const legMints = [...new Set(manifest.legs.flatMap((leg) => [leg.inMint, leg.outMint]))];
  for (const mint of legMints) {
    const symbol = symbolOfMint(mint);
    const facts = factsForMint(manifest.mints, mint);
    if (isScaledMint(mint)) {
      if (!facts) {
        fail("P11", `${symbol} scales its amounts and this order declares no multiplier, so every ${symbol} figure would be wrong`);
        continue;
      }
      const problem = multiplierProblem(facts.multiplier);
      if (problem) fail("P11", `The ${symbol} multiplier ${problem}`);
      if (facts.nextMultiplier !== undefined) {
        const next = multiplierProblem(facts.nextMultiplier);
        if (next) fail("P11", `The scheduled ${symbol} multiplier ${next}`);
      }
    } else if (facts) {
      fail("P11", `This order declares a multiplier for ${symbol}, which does not scale its amounts`);
    }
  }
  for (const facts of manifest.mints ?? []) {
    if (!legMints.includes(facts.mint)) {
      const symbol = symbolOfMint(facts.mint);
      fail("P11", `This order declares a multiplier for ${symbol}, which no leg touches`);
    }
  }

  const ticket = violations.length === 0 ? buildTicket(manifest, swaps, feePayer, vault) : undefined;

  return {
    // An unimplemented rule is an unchecked rule, and an unchecked rule is not
    // a pass. This stays false until P8 is enforced.
    ok: violations.length === 0 && UNEVALUATED.length === 0,
    evaluated: EVALUATED,
    unevaluated: UNEVALUATED,
    violations,
    ticket,
  };
}

function buildTicket(
  manifest: OrderManifest,
  swaps: DecodedInstruction[],
  feePayer: string,
  vault: string
): OrderTicket {
  const lines: TicketLine[] = [];

  manifest.legs.forEach((leg, i) => {
    const swap = swaps[i];

    // Amounts come from the instruction where there is one, never the manifest.
    const rawIn = swap ? String(swap.detail.inAmount ?? leg.inAmount) : leg.inAmount;

    lines.push(ticketLine(manifest, leg.inMint, "in", rawIn));
    lines.push(ticketLine(manifest, leg.outMint, "out", leg.expectedOutAmount));
  });

  const applied = [...new Set(lines.map((line) => line.mint))]
    .map((mint) => factsForMint(manifest.mints, mint))
    .filter((facts): facts is MintFacts => facts !== undefined);

  return {
    kind: manifest.kind,
    lines,
    feePayer,
    networkFeePaidBy: feePayer === vault ? "vault" : "relayer",
    slippageBps: manifest.slippageBps,
    disclosures: disclose(manifest, lines),
    mintsReadAt: applied.length > 0 ? Math.min(...applied.map((f) => f.readAt)) : null,
  };
}

function ticketLine(
  manifest: OrderManifest,
  mint: string,
  direction: "in" | "out",
  rawAmount: string
): TicketLine {
  const asset = assetByMint(mint);
  const decimals = asset?.decimals ?? 6;
  // A declared multiplier is applied ONLY where the vault's own offline table
  // says the mint scales. Anywhere else it is ignored outright rather than
  // trusted, so a forged entry cannot change a figure on this screen.
  const multiplier = isScaledMint(mint) ? (factsForMint(manifest.mints, mint)?.multiplier ?? 1) : 1;

  return {
    // `symbolOfMint` falls back to a truncated address. Labelling an
    // unrecognised mint "USDC" would be the single worst thing this screen
    // could do, and it is one `??` away.
    symbol: symbolOfMint(mint),
    direction,
    rawAmount,
    multiplier,
    amount: formatScaled(rawAmount, decimals, multiplier),
    unscaledAmount: formatAmount(rawAmount, decimals, 6),
    mint,
  };
}

/**
 * What the holder is not being told anywhere else.
 *
 * Three of these are properties of xStocks that no amount of careful signing
 * can undo, and the honest thing is to put them on the screen where the
 * decision is made rather than in a legal page nobody opens.
 */
function disclose(manifest: OrderManifest, lines: TicketLine[]): TicketDisclosure[] {
  const disclosures: TicketDisclosure[] = [];

  for (const mint of [...new Set(lines.map((line) => line.mint))]) {
    const facts = factsForMint(manifest.mints, mint);
    const symbol = symbolOfMint(mint);

    // Driven by the vault's own table, not by what arrived: the address
    // travels with the order, so a sender who left it out would otherwise
    // silence this. Omitting it now only costs them the name.
    if (assetByMint(mint)?.hasPermanentDelegate || facts?.permanentDelegate) {
      const named = facts?.permanentDelegate
        ? `(${short(facts.permanentDelegate)})`
        : "(this order does not say which)";
      disclosures.push({
        severity: "warn",
        symbol,
        text: `${symbol} has a permanent delegate ${named}. The issuer can move it out of your account without your signature — this order does not change that, and no signing device can.`,
      });
    }

    if (!facts) continue;
    if (facts.paused) {
      disclosures.push({
        severity: "warn",
        symbol,
        text: `Transfers of ${symbol} are paused by the issuer. This order will not execute while that holds.`,
      });
    }
    if (isScaledMint(mint) && facts.multiplier !== 1) {
      disclosures.push({
        severity: "note",
        symbol,
        text: `${symbol} amounts are scaled by ×${facts.multiplier}, read from the mint by the relayer and not verifiable offline. Without it the figure above would read ${lines.find((l) => l.mint === mint)?.unscaledAmount ?? "differently"}.`,
      });
    }
    if (facts.nextMultiplier !== undefined && facts.nextMultiplier !== facts.multiplier) {
      // Named with its date. Once it lands the figure above changes, and a
      // holder who signs shortly before should know which side of it they are
      // on rather than discover the difference in their balance.
      const when = facts.nextMultiplierAt
        ? ` on ${new Date(facts.nextMultiplierAt * 1000).toISOString().slice(0, 10)}`
        : "";
      disclosures.push({
        severity: "note",
        symbol,
        text: `A new ${symbol} multiplier takes effect${when}: ×${facts.multiplier} becomes ×${facts.nextMultiplier}. Amounts change with it.`,
      });
    }
  }

  return disclosures;
}

function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
