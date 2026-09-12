/**
 * Program-derived addresses, and the associated token account in particular.
 *
 * The vault has to derive these itself. Being told "this is your token
 * account" is exactly the claim an attacker would make to route a swap's
 * output into their own account.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";
import { PROGRAM_IDS } from "@pixstock/shared";

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

/**
 * A PDA must be off the ed25519 curve — that is what guarantees no private
 * key exists for it.
 */
export function isOnCurve(pubkey: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(pubkey);
    return true;
  } catch {
    return false;
  }
}

export function createProgramAddress(seeds: Uint8Array[], programId: string): Uint8Array | null {
  const program = base58.decode(programId);

  let length = 0;
  for (const seed of seeds) {
    if (seed.length > 32) throw new Error("tx-policy: a PDA seed is at most 32 bytes");
    length += seed.length;
  }

  const buffer = new Uint8Array(length + program.length + PDA_MARKER.length);
  let offset = 0;
  for (const seed of seeds) {
    buffer.set(seed, offset);
    offset += seed.length;
  }
  buffer.set(program, offset);
  offset += program.length;
  buffer.set(PDA_MARKER, offset);

  const candidate = sha256(buffer);
  return isOnCurve(candidate) ? null : candidate;
}

export interface DerivedAddress {
  address: string;
  bump: number;
}

export function findProgramAddress(seeds: Uint8Array[], programId: string): DerivedAddress {
  for (let bump = 255; bump >= 0; bump--) {
    const address = createProgramAddress([...seeds, Uint8Array.of(bump)], programId);
    if (address) return { address: base58.encode(address), bump };
  }
  throw new Error("tx-policy: no off-curve address for these seeds");
}

/**
 * The associated token account for an owner and mint.
 *
 * `tokenProgram` matters: xStocks are Token-2022, and the same owner and mint
 * derive a different address under the legacy Token program.
 */
export function deriveAta(owner: string, mint: string, tokenProgram: string): string {
  return findProgramAddress(
    [base58.decode(owner), base58.decode(tokenProgram), base58.decode(mint)],
    PROGRAM_IDS.associatedToken
  ).address;
}
