/**
 * Turns compiled instructions into named ones.
 *
 * The rule throughout: decode what the bytes actually say, and mark anything
 * else `unknown`. A plausible-but-wrong label is how blind signing sneaks back
 * in wearing a readable coat.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { PROGRAM_IDS } from "@pixstock/shared";
import type { CompiledInstruction, CompiledMessage } from "./message.js";
import { programIdOf } from "./message.js";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

/** Anchor's discriminator: the first eight bytes of sha256("global:<name>"). */
export function anchorDiscriminator(name: string): Uint8Array {
  return sha256(new TextEncoder().encode(`global:${name}`)).slice(0, 8);
}

const JUPITER_ROUTES = [
  "route",
  "routeWithTokenLedger",
  "sharedAccountsRoute",
  "sharedAccountsRouteWithTokenLedger",
  "exactOutRoute",
  "sharedAccountsExactOutRoute",
] as const;

export type JupiterRouteName = (typeof JUPITER_ROUTES)[number];

const JUPITER_BY_DISCRIMINATOR = new Map<string, JupiterRouteName>(
  JUPITER_ROUTES.map((name) => [
    Array.from(anchorDiscriminator(name), (b) => b.toString(16).padStart(2, "0")).join(""),
    name,
  ])
);

export type InstructionKind =
  | "compute-budget"
  | "create-ata"
  | "token-transfer"
  | "token-approve"
  | "token-authority"
  | "token-close"
  | "token-burn"
  | "advance-nonce"
  | "system-transfer"
  | "jupiter-route"
  | "unknown";

export interface DecodedInstruction {
  programId: string;
  kind: InstructionKind;
  /** Base58 account keys, in the order the instruction lists them. */
  accounts: string[];
  detail: Record<string, unknown>;
  /** Set when the bytes could not be read as the program's own format. */
  undecodable?: string;
}

const u32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

const u64 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);

const u16 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);

function decodeComputeBudget(data: Uint8Array): Partial<DecodedInstruction> {
  const variant = data[0];
  if (variant === 2 && data.length >= 5) {
    return { kind: "compute-budget", detail: { setting: "unitLimit", units: u32(data, 1) } };
  }
  if (variant === 3 && data.length >= 9) {
    return {
      kind: "compute-budget",
      detail: { setting: "unitPrice", microLamports: u64(data, 1).toString() },
    };
  }
  return { kind: "compute-budget", detail: { variant }, undecodable: "unrecognised compute budget instruction" };
}

function decodeAssociatedToken(data: Uint8Array): Partial<DecodedInstruction> {
  const variant = data.length === 0 ? 0 : data[0];
  const names: Record<number, string> = { 0: "create", 1: "createIdempotent", 2: "recoverNested" };
  return { kind: "create-ata", detail: { variant: names[variant!] ?? variant } };
}

/** Token and Token-2022 share their instruction numbering for these. */
function decodeToken(data: Uint8Array): Partial<DecodedInstruction> {
  const variant = data[0];

  switch (variant) {
    case 3: // Transfer
      return data.length >= 9
        ? { kind: "token-transfer", detail: { amount: u64(data, 1).toString(), checked: false } }
        : { kind: "token-transfer", detail: {}, undecodable: "short transfer" };
    case 12: // TransferChecked
      return data.length >= 10
        ? {
            kind: "token-transfer",
            detail: { amount: u64(data, 1).toString(), decimals: data[9], checked: true },
          }
        : { kind: "token-transfer", detail: {}, undecodable: "short transferChecked" };
    case 4: // Approve
    case 13: // ApproveChecked
      return {
        kind: "token-approve",
        detail: { amount: data.length >= 9 ? u64(data, 1).toString() : null, checked: variant === 13 },
      };
    case 5: // Revoke
      return { kind: "token-approve", detail: { revoke: true } };
    case 6: // SetAuthority
      return { kind: "token-authority", detail: { authorityType: data[1] } };
    case 8: // Burn
    case 15: // BurnChecked
      return { kind: "token-burn", detail: { amount: data.length >= 9 ? u64(data, 1).toString() : null } };
    case 9: // CloseAccount
      return { kind: "token-close", detail: {} };
    default:
      return { kind: "unknown", detail: { variant }, undecodable: `token instruction ${variant}` };
  }
}

function decodeSystem(data: Uint8Array): Partial<DecodedInstruction> {
  if (data.length < 4) return { kind: "unknown", detail: {}, undecodable: "short system instruction" };
  const variant = u32(data, 0);

  if (variant === 4) return { kind: "advance-nonce", detail: {} };
  if (variant === 2 && data.length >= 12) {
    return { kind: "system-transfer", detail: { lamports: u64(data, 4).toString() } };
  }
  return { kind: "unknown", detail: { variant }, undecodable: `system instruction ${variant}` };
}

/**
 * Jupiter's route instructions.
 *
 * The route plan is a variable-length list of swap variants that changes with
 * every AMM Jupiter adds — parsing it would be guessing at a moving target.
 * The arguments that matter are fixed width and sit at the tail, whichever
 * route variant is used: in amount, quoted out amount, slippage, platform fee.
 * Those are read; the plan itself is left opaque and reported as such.
 */
const JUPITER_TAIL_BYTES = 8 + 8 + 2 + 1;

function decodeJupiter(data: Uint8Array): Partial<DecodedInstruction> {
  if (data.length < 8 + JUPITER_TAIL_BYTES) {
    return { kind: "unknown", detail: {}, undecodable: "instruction too short for a Jupiter route" };
  }

  const discriminator = Array.from(data.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  const route = JUPITER_BY_DISCRIMINATOR.get(discriminator);
  if (!route) {
    return {
      kind: "unknown",
      detail: { discriminator },
      undecodable: "unrecognised Jupiter instruction",
    };
  }

  const tail = data.length - JUPITER_TAIL_BYTES;
  const exactOut = route === "exactOutRoute" || route === "sharedAccountsExactOutRoute";

  return {
    kind: "jupiter-route",
    detail: {
      route,
      exactOut,
      // On an exact-out route the first argument is the amount received and
      // the second the amount quoted to pay. Naming them by role rather than
      // by position is what keeps the ticket honest.
      [exactOut ? "outAmount" : "inAmount"]: u64(data, tail).toString(),
      [exactOut ? "quotedInAmount" : "quotedOutAmount"]: u64(data, tail + 8).toString(),
      slippageBps: u16(data, tail + 16),
      platformFeeBps: data[tail + 18],
      routePlanOpaque: true,
    },
  };
}

export function decodeInstruction(
  message: CompiledMessage,
  instruction: CompiledInstruction,
  resolveAccount: (index: number) => string
): DecodedInstruction {
  const programId = programIdOf(message, instruction);
  const accounts = instruction.accountKeyIndexes.map(resolveAccount);
  const data = instruction.data;

  let decoded: Partial<DecodedInstruction>;
  switch (programId) {
    case COMPUTE_BUDGET_PROGRAM:
      decoded = decodeComputeBudget(data);
      break;
    case PROGRAM_IDS.associatedToken:
      decoded = decodeAssociatedToken(data);
      break;
    case PROGRAM_IDS.token:
    case PROGRAM_IDS.token2022:
      decoded = decodeToken(data);
      break;
    case SYSTEM_PROGRAM:
      decoded = decodeSystem(data);
      break;
    case PROGRAM_IDS.jupiterV6:
      decoded = decodeJupiter(data);
      break;
    default:
      decoded = {
        kind: "unknown",
        detail: {},
        undecodable: programId.startsWith("lookup:")
          ? "program address comes from a lookup table and cannot be named here"
          : "program not in the allowlist",
      };
  }

  return { programId, accounts, kind: "unknown", detail: {}, ...decoded };
}

/**
 * Decompiles every instruction in a message.
 *
 * Accounts pulled in through an address lookup table cannot be named from the
 * message alone, so they are reported as `lookup:<index>` rather than guessed.
 */
export function decompile(message: CompiledMessage): DecodedInstruction[] {
  const resolveAccount = (index: number) => message.staticAccountKeys[index] ?? `lookup:${index}`;
  return message.instructions.map((instruction) =>
    decodeInstruction(message, instruction, resolveAccount)
  );
}
