/**
 * Decompiles a Solana transaction message.
 *
 * This is the first half of refusing to sign blind: opaque bytes become named
 * accounts and instructions, which the policy engine can then check and the
 * vault can render. Nothing here trusts the manifest — the manifest is
 * compared against *this*, never the other way round.
 *
 * Wire format: https://solana.com/docs/core/transactions
 */

import { base58 } from "@scure/base";
import { decodeShortVec } from "./shortvec.js";

export const PUBKEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;
export const BLOCKHASH_BYTES = 32;

/** High bit set marks a versioned message; the low bits carry the version. */
const VERSION_MASK = 0x80;

export interface CompiledInstruction {
  programIdIndex: number;
  accountKeyIndexes: number[];
  data: Uint8Array;
}

export interface AddressTableLookup {
  accountKey: string;
  writableIndexes: number[];
  readonlyIndexes: number[];
}

export interface CompiledMessage {
  /** `null` for a legacy message, 0 for v0. */
  version: number | null;
  header: {
    numRequiredSignatures: number;
    numReadonlySignedAccounts: number;
    numReadonlyUnsignedAccounts: number;
  };
  /** Base58, in the canonical order. Index 0 is the fee payer. */
  staticAccountKeys: string[];
  recentBlockhash: string;
  instructions: CompiledInstruction[];
  addressTableLookups: AddressTableLookup[];
}

export interface ParsedTransaction {
  /** Base58 signatures, empty ones left as all-zero. */
  signatures: string[];
  message: CompiledMessage;
  /** The exact bytes that were signed. */
  messageBytes: Uint8Array;
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    if (this.remaining < 1) throw new Error("tx-policy: unexpected end of message");
    return this.bytes[this.offset++]!;
  }

  take(length: number): Uint8Array {
    if (this.remaining < length) {
      throw new Error(`tx-policy: wanted ${length} bytes, ${this.remaining} left`);
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  length(): number {
    const { value, bytesRead } = decodeShortVec(this.bytes, this.offset);
    this.offset += bytesRead;
    return value;
  }

  pubkey(): string {
    return base58.encode(this.take(PUBKEY_BYTES));
  }
}

export function decodeMessage(bytes: Uint8Array): CompiledMessage {
  const reader = new Reader(bytes);

  const first = reader.u8();
  let version: number | null = null;
  let numRequiredSignatures: number;

  if ((first & VERSION_MASK) !== 0) {
    version = first & 0x7f;
    if (version !== 0) {
      throw new Error(`tx-policy: unsupported message version ${version}`);
    }
    numRequiredSignatures = reader.u8();
  } else {
    // Legacy: the byte we just read was already the first header field.
    numRequiredSignatures = first;
  }

  const header = {
    numRequiredSignatures,
    numReadonlySignedAccounts: reader.u8(),
    numReadonlyUnsignedAccounts: reader.u8(),
  };

  const staticAccountKeys: string[] = [];
  const keyCount = reader.length();
  for (let i = 0; i < keyCount; i++) staticAccountKeys.push(reader.pubkey());

  const recentBlockhash = base58.encode(reader.take(BLOCKHASH_BYTES));

  const instructions: CompiledInstruction[] = [];
  const instructionCount = reader.length();
  for (let i = 0; i < instructionCount; i++) {
    const programIdIndex = reader.u8();
    const accountCount = reader.length();
    const accountKeyIndexes: number[] = [];
    for (let a = 0; a < accountCount; a++) accountKeyIndexes.push(reader.u8());
    const dataLength = reader.length();
    instructions.push({
      programIdIndex,
      accountKeyIndexes,
      data: reader.take(dataLength).slice(),
    });
  }

  const addressTableLookups: AddressTableLookup[] = [];
  if (version === 0) {
    const lookupCount = reader.length();
    for (let i = 0; i < lookupCount; i++) {
      const accountKey = reader.pubkey();
      const writableCount = reader.length();
      const writableIndexes: number[] = [];
      for (let w = 0; w < writableCount; w++) writableIndexes.push(reader.u8());
      const readonlyCount = reader.length();
      const readonlyIndexes: number[] = [];
      for (let r = 0; r < readonlyCount; r++) readonlyIndexes.push(reader.u8());
      addressTableLookups.push({ accountKey, writableIndexes, readonlyIndexes });
    }
  }

  return {
    version,
    header,
    staticAccountKeys,
    recentBlockhash,
    instructions,
    addressTableLookups,
  };
}

/** Splits a serialized transaction into its signatures and its message. */
export function parseTransaction(bytes: Uint8Array): ParsedTransaction {
  const { value: signatureCount, bytesRead } = decodeShortVec(bytes, 0);

  const signatures: string[] = [];
  let offset = bytesRead;
  for (let i = 0; i < signatureCount; i++) {
    signatures.push(base58.encode(bytes.subarray(offset, offset + SIGNATURE_BYTES)));
    offset += SIGNATURE_BYTES;
  }

  const messageBytes = bytes.slice(offset);
  return { signatures, message: decodeMessage(messageBytes), messageBytes };
}

/**
 * The fee payer: the first account key, always. This is the account the
 * vault must NOT be — if it is, the transaction is draining the vault's SOL
 * for fees and rent, and the whole Zero-SOL promise is gone.
 */
export function feePayerOf(message: CompiledMessage): string {
  const payer = message.staticAccountKeys[0];
  if (!payer) throw new Error("tx-policy: message has no account keys");
  return payer;
}

/** Whether an account index must sign. */
export function isSigner(message: CompiledMessage, index: number): boolean {
  return index < message.header.numRequiredSignatures;
}

/**
 * Whether an account index is writable. Only meaningful for static keys —
 * accounts pulled in through an address lookup table have their writability
 * decided by which of the two index lists they came from.
 */
export function isWritable(message: CompiledMessage, index: number): boolean {
  const { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts } =
    message.header;

  if (index < numRequiredSignatures) {
    return index < numRequiredSignatures - numReadonlySignedAccounts;
  }
  const unsignedIndex = index - numRequiredSignatures;
  const unsignedCount = message.staticAccountKeys.length - numRequiredSignatures;
  return unsignedIndex < unsignedCount - numReadonlyUnsignedAccounts;
}

export function programIdOf(message: CompiledMessage, instruction: CompiledInstruction): string {
  const key = message.staticAccountKeys[instruction.programIdIndex];
  if (key) return key;
  // A program invoked through a lookup table: we cannot name it from the
  // message alone, and the policy must treat that as unresolvable rather than
  // guess.
  return `lookup:${instruction.programIdIndex}`;
}
