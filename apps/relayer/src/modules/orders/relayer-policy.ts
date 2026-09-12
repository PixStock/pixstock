import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import {
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  decodeMessage,
  decompile,
  feePayerOf,
} from '@pixstock/tx-policy';

/**
 * What the relayer checks before it spends its own SOL on someone's
 * transaction.
 *
 * The mirror image of the vault's P1..P10. The vault protects its holder from
 * the relayer; these protect the relayer from whoever is talking to it. It
 * holds a hot key that pays fees and rent, so every rule here exists to stop
 * that key funding something it did not build.
 *
 * Statements live in docs/THREAT-MODEL.md.
 */
export type RelayerRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

export const RELAYER_RULES: Record<RelayerRule, string> = {
  R1: 'The transaction is one this relayer built, still awaiting its signature',
  R2: "The vault's signature is valid over the message it was given",
  R3: 'The relayer key appears only as fee payer and nonce authority',
  R4: 'No lamports leave the relayer beyond capped token-account rent',
  R5: 'The compute unit price is within the configured cap',
  R6: 'The transaction simulates successfully',
  R7: 'The vault is within its order quota and the relayer has balance',
  R8: 'An order is co-signed at most once',
};

/** Enforced today. R6 and R7 need a funded key and an RPC budget. */
export const ENFORCED_RULES: readonly RelayerRule[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R8'];
export const UNENFORCED_RULES: readonly RelayerRule[] = ['R6', 'R7'];

/** Creating a token account costs rent; nothing else may drain the key. */
export const MAX_RENT_LAMPORTS = 10_000_000;

export interface RelayerViolation {
  rule: RelayerRule;
  detail: string;
}

export interface CheckInput {
  /** Unsigned v0 message, as stored when the order was built. */
  messageBytes: Uint8Array;
  /** sha256 of that message, recorded at build time. */
  expectedHash: string;
  /** Base58 signature offered by the vault. */
  signature: Uint8Array;
  vault: string;
  relayer: string;
  status: string;
  alreadySigned: boolean;
  maxComputeUnitPrice: bigint;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function checkRelayerPolicy(input: CheckInput): RelayerViolation[] {
  const violations: RelayerViolation[] = [];
  const fail = (rule: RelayerRule, detail: string) => violations.push({ rule, detail });

  // R8 first: a replay must be refused before anything is recomputed.
  if (input.alreadySigned) {
    fail('R8', 'This order already carries a relayer signature');
  }

  // R1 — ours, and at the right point in its life.
  if (sha256Hex(input.messageBytes) !== input.expectedHash) {
    fail('R1', 'The message does not match the one this relayer built');
  }
  if (input.status !== 'AWAITING_SIGNATURE') {
    fail('R1', `An order in ${input.status} is not awaiting a signature`);
  }

  // R2 — the signature really is the vault's, over this exact message.
  try {
    const valid = ed25519.verify(input.signature, input.messageBytes, base58.decode(input.vault));
    if (!valid) fail('R2', "The signature is not the vault's, or not over this message");
  } catch (err) {
    fail('R2', `The signature could not be checked: ${(err as Error).message}`);
  }

  let decoded;
  try {
    const message = decodeMessage(input.messageBytes);
    decoded = { message, instructions: decompile(message) };
  } catch (err) {
    fail('R1', `The stored message cannot be read: ${(err as Error).message}`);
    return violations;
  }

  // R3 — the relayer pays, and advances a nonce. It authorises nothing else.
  if (feePayerOf(decoded.message) !== input.relayer) {
    fail('R3', 'This relayer is not the fee payer of that transaction');
  }
  for (const instruction of decoded.instructions) {
    if (instruction.kind === 'token-approve' || instruction.kind === 'token-authority') {
      fail('R3', 'The transaction would delegate authority');
    }
  }

  // R4 — rent for a token account is the only lamport outflow allowed.
  let lamportsOut = 0n;
  for (const instruction of decoded.instructions) {
    if (instruction.kind !== 'system-transfer') continue;
    if (instruction.accounts[0] !== input.relayer) continue;
    lamportsOut += BigInt(String(instruction.detail.lamports ?? 0));
  }
  if (lamportsOut > BigInt(MAX_RENT_LAMPORTS)) {
    fail('R4', `The transaction moves ${lamportsOut} lamports out of the relayer`);
  }

  // R5 — a priority fee is the other way to drain a fee payer.
  for (const instruction of decoded.instructions) {
    if (instruction.programId !== COMPUTE_BUDGET_PROGRAM) continue;
    if (instruction.detail.setting !== 'unitPrice') continue;
    const price = BigInt(String(instruction.detail.microLamports ?? 0));
    if (price > input.maxComputeUnitPrice) {
      fail('R5', `Compute unit price ${price} exceeds the cap of ${input.maxComputeUnitPrice}`);
    }
  }

  // The only System instruction the relayer signs for is the nonce advance.
  for (const instruction of decoded.instructions) {
    if (instruction.programId !== SYSTEM_PROGRAM) continue;
    if (instruction.kind !== 'advance-nonce' && instruction.kind !== 'system-transfer') {
      fail('R3', `Unexpected System instruction: ${instruction.undecodable ?? instruction.kind}`);
    }
  }

  return violations;
}
