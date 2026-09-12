/**
 * Decompiles a Solana v0 message and decides whether the vault may sign it.
 *
 * Two jobs, in order:
 *   1. turn opaque bytes into named instructions (Jupiter, Token-2022, ATA,
 *      Nonce) so the vault can render a readable order ticket — no blind
 *      signing, ever;
 *   2. run the P1..P11 policy against the manifest and refuse anything that
 *      does not match.
 *
 * The manifest is never trusted on its own. Rules live in docs/SECURITY.md.
 */

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
export {
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  anchorDiscriminator,
  decodeInstruction,
  decompile,
  type DecodedInstruction,
  type InstructionKind,
  type JupiterRouteName,
} from "./instructions.js";
export {
  createProgramAddress,
  deriveAta,
  findProgramAddress,
  isOnCurve,
  type DerivedAddress,
} from "./pda.js";

export {
  EVALUATED_RULES,
  MAX_SLIPPAGE_BPS,
  POLICY_RULES,
  UNEVALUATED_RULES,
  applyPolicy,
  type OrderTicket,
  type PolicyInput,
  type PolicyResult,
  type PolicyRule,
  type PolicyViolation,
  type TicketDisclosure,
  type TicketLine,
} from "./policy.js";
