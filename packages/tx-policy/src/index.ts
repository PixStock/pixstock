/**
 * Decompiles a Solana v0 message and decides whether the vault may sign it.
 *
 * Two jobs, in order:
 *   1. turn opaque bytes into named instructions (Jupiter, Token-2022, ATA,
 *      Nonce) so the vault can render a readable order ticket — no blind
 *      signing, ever;
 *   2. run the P1..P10 policy against the manifest and refuse anything that
 *      does not match.
 *
 * The manifest is never trusted on its own. Rules live in docs/SECURITY.md.
 */

import type { OrderManifest } from "@pixstock/shared";

export {
  BLOCKHASH_BYTES,
  PUBKEY_BYTES,
  SIGNATURE_BYTES,
  decodeMessage,
  feePayerOf,
  isSigner,
  isWritable,
  parseTransaction,
  programIdOf,
  type AddressTableLookup,
  type CompiledInstruction,
  type CompiledMessage,
  type ParsedTransaction,
} from "./message.js";
export { decodeShortVec, encodeShortVec, type ShortVec } from "./shortvec.js";

export interface DecodedInstruction {
  programId: string;
  kind: "jupiter-swap" | "token-transfer" | "create-ata" | "advance-nonce" | "compute-budget" | "unknown";
  accounts: string[];
  detail: Record<string, unknown>;
}

export interface OrderTicket {
  kind: OrderManifest["kind"];
  lines: Array<{ symbol: string; direction: "in" | "out"; amount: string }>;
  counterparty: string;
  feePayer: string;
  networkFeePaidBy: "relayer" | "vault";
}

export type PolicyResult =
  | { ok: true; ticket: OrderTicket }
  | { ok: false; rule: PolicyRule; detail: string };

/** See docs/SECURITY.md for the full statement of each rule. */
export type PolicyRule = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8" | "P9" | "P10";

export function decompile(_messageBytes: Uint8Array): DecodedInstruction[] {
  throw new Error("tx-policy: decompile is not implemented yet");
}

export function decodeJupiter(_instruction: DecodedInstruction): DecodedInstruction {
  throw new Error("tx-policy: decodeJupiter is not implemented yet");
}

export function deriveAta(_owner: string, _mint: string, _tokenProgram: string): string {
  throw new Error("tx-policy: deriveAta is not implemented yet");
}

export function applyPolicy(
  _decoded: DecodedInstruction[],
  _manifest: OrderManifest,
  _vault: string
): PolicyResult {
  throw new Error("tx-policy: applyPolicy is not implemented yet");
}
