/**
 * The structured payload that rides the optical channel.
 *
 * One CBOR envelope for every message the protocol carries, so the vault can
 * tell a signing request from a pairing code without guessing at prefixes.
 * See docs/AGQP-SPEC.md §2.
 *
 * Public keys travel as raw 32-byte strings and surface as base58 at the API
 * boundary: the wire stays compact, the types stay readable, and no caller
 * has to remember which representation it is holding.
 *
 * Encoding and decoding are strict. A field of the wrong length or the wrong
 * type is a rejection, never a coercion — this is the last place a malformed
 * order could slip through before it reaches the policy engine.
 */

import { decode as cborDecode, encode as cborEncode } from "cbor-x";
import { base58 } from "@scure/base";
import { SID_BYTES } from "./frame.js";

export const PAYLOAD_VERSION = 1;
export const PUBKEY_BYTES = 32;
export const SIGNATURE_BYTES = 64;

export type PayloadKind = "SIGN" | "SIGR" | "PAIR";

export interface ManifestLeg {
  inMint: string;
  outMint: string;
  inAmount: string;
  expectedOutAmount: string;
  minOutAmount?: string;
  pythFeedId?: number;
}

export interface PayloadManifest {
  kind: "BUY" | "SELL" | "BASKET";
  legs: ManifestLeg[];
  slippageBps: number;
  feePayer: string;
  nonceAccount?: string;
  dapp: string;
  quotedAt: number;
}

export interface SignRequest {
  kind: "SIGN";
  sid: Uint8Array;
  vault: string;
  /** Unsigned v0 messages. One in practice, two when a basket is split. */
  txs: Uint8Array[];
  manifest: PayloadManifest;
  /** Pyth Pro `solana` message. Absent means the price is unattested. */
  price?: Uint8Array;
}

export interface SignResponse {
  kind: "SIGR";
  sid: Uint8Array;
  signatures: Uint8Array[];
}

export interface PairRecord {
  kind: "PAIR";
  vault: string;
  label: string;
  network: "mainnet" | "devnet";
}

export type Payload = SignRequest | SignResponse | PairRecord;

/* ── helpers ──────────────────────────────────────────────────────────── */

function bytes(value: unknown, length: number, field: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`agqp: ${field} is not a byte string`);
  }
  if (value.length !== length) {
    throw new Error(`agqp: ${field} is ${value.length} bytes, expected ${length}`);
  }
  return value;
}

function pubkey(value: unknown, field: string): string {
  return base58.encode(bytes(value, PUBKEY_BYTES, field));
}

function toPubkey(value: string, field: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = base58.decode(value);
  } catch {
    throw new Error(`agqp: ${field} is not base58`);
  }
  if (decoded.length !== PUBKEY_BYTES) {
    throw new Error(`agqp: ${field} decodes to ${decoded.length} bytes, expected ${PUBKEY_BYTES}`);
  }
  return decoded;
}

/** Amounts are u64 on the wire and strings in the API — never a float. */
function amount(value: unknown, field: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }
  throw new Error(`agqp: ${field} is not a whole non-negative amount`);
}

function integer(value: unknown, field: string): number {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) {
    throw new Error(`agqp: ${field} is not a whole non-negative number`);
  }
  return n;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`agqp: ${field} is not a string`);
  return value;
}

/* ── encoding ─────────────────────────────────────────────────────────── */

export function encodePayload(payload: Payload): Uint8Array {
  switch (payload.kind) {
    case "SIGN":
      return cborEncode({
        v: PAYLOAD_VERSION,
        kind: "SIGN",
        sid: bytes(payload.sid, SID_BYTES, "sid"),
        vault: toPubkey(payload.vault, "vault"),
        txs: payload.txs,
        manifest: encodeManifest(payload.manifest),
        ...(payload.price ? { price: payload.price } : {}),
      });

    case "SIGR":
      return cborEncode({
        v: PAYLOAD_VERSION,
        kind: "SIGR",
        sid: bytes(payload.sid, SID_BYTES, "sid"),
        sigs: payload.signatures.map((s, i) => bytes(s, SIGNATURE_BYTES, `signature ${i}`)),
      });

    case "PAIR":
      return cborEncode({
        v: PAYLOAD_VERSION,
        kind: "PAIR",
        vault: toPubkey(payload.vault, "vault"),
        label: payload.label,
        net: payload.network,
      });
  }
}

function encodeManifest(manifest: PayloadManifest) {
  return {
    kind: manifest.kind,
    legs: manifest.legs.map((leg) => ({
      i: toPubkey(leg.inMint, "leg.inMint"),
      o: toPubkey(leg.outMint, "leg.outMint"),
      a: BigInt(leg.inAmount),
      q: BigInt(leg.expectedOutAmount),
      ...(leg.minOutAmount !== undefined ? { m: BigInt(leg.minOutAmount) } : {}),
      ...(leg.pythFeedId !== undefined ? { f: leg.pythFeedId } : {}),
    })),
    slip: manifest.slippageBps,
    payer: toPubkey(manifest.feePayer, "manifest.feePayer"),
    ...(manifest.nonceAccount
      ? { nonce: toPubkey(manifest.nonceAccount, "manifest.nonceAccount") }
      : {}),
    dapp: manifest.dapp,
    at: manifest.quotedAt,
  };
}

/* ── decoding ─────────────────────────────────────────────────────────── */

/**
 * Reads a payload off the wire.
 *
 * Throws on anything it cannot read as one of the three shapes. The caller —
 * the vault's scanner — turns that into a refusal on screen, never a partial
 * order.
 */
export function decodePayload(input: Uint8Array): Payload {
  let raw: Record<string, unknown>;
  try {
    raw = cborDecode(input) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`agqp: payload is not valid CBOR (${(err as Error).message})`);
  }

  if (raw === null || typeof raw !== "object") {
    throw new Error("agqp: payload is not a map");
  }

  const version = integer(raw.v, "v");
  if (version !== PAYLOAD_VERSION) {
    throw new Error(`agqp: unsupported payload version ${version}`);
  }

  switch (raw.kind) {
    case "SIGN":
      return decodeSignRequest(raw);
    case "SIGR":
      return decodeSignResponse(raw);
    case "PAIR":
      return decodePairRecord(raw);
    default:
      throw new Error(`agqp: unknown payload kind ${JSON.stringify(raw.kind)}`);
  }
}

function decodeSignRequest(raw: Record<string, unknown>): SignRequest {
  if (!Array.isArray(raw.txs) || raw.txs.length === 0) {
    throw new Error("agqp: a signing request carries no transaction");
  }

  const txs = raw.txs.map((tx, i) => {
    if (!(tx instanceof Uint8Array)) throw new Error(`agqp: transaction ${i} is not a byte string`);
    return tx;
  });

  if (raw.price !== undefined && !(raw.price instanceof Uint8Array)) {
    throw new Error("agqp: price attestation is not a byte string");
  }

  return {
    kind: "SIGN",
    sid: bytes(raw.sid, SID_BYTES, "sid"),
    vault: pubkey(raw.vault, "vault"),
    txs,
    manifest: decodeManifest(raw.manifest),
    ...(raw.price ? { price: raw.price as Uint8Array } : {}),
  };
}

function decodeManifest(value: unknown): PayloadManifest {
  if (value === null || typeof value !== "object") {
    throw new Error("agqp: manifest is not a map");
  }
  const m = value as Record<string, unknown>;

  if (m.kind !== "BUY" && m.kind !== "SELL" && m.kind !== "BASKET") {
    throw new Error(`agqp: unknown order kind ${JSON.stringify(m.kind)}`);
  }
  if (!Array.isArray(m.legs) || m.legs.length === 0) {
    throw new Error("agqp: manifest declares no legs");
  }

  return {
    kind: m.kind,
    legs: m.legs.map((value, i) => {
      if (value === null || typeof value !== "object") {
        throw new Error(`agqp: leg ${i} is not a map`);
      }
      const leg = value as Record<string, unknown>;
      return {
        inMint: pubkey(leg.i, `leg ${i} inMint`),
        outMint: pubkey(leg.o, `leg ${i} outMint`),
        inAmount: amount(leg.a, `leg ${i} inAmount`),
        expectedOutAmount: amount(leg.q, `leg ${i} expectedOutAmount`),
        ...(leg.m !== undefined ? { minOutAmount: amount(leg.m, `leg ${i} minOutAmount`) } : {}),
        ...(leg.f !== undefined ? { pythFeedId: integer(leg.f, `leg ${i} pythFeedId`) } : {}),
      };
    }),
    slippageBps: integer(m.slip, "manifest.slippageBps"),
    feePayer: pubkey(m.payer, "manifest.feePayer"),
    ...(m.nonce !== undefined
      ? { nonceAccount: pubkey(m.nonce, "manifest.nonceAccount") }
      : {}),
    dapp: text(m.dapp, "manifest.dapp"),
    quotedAt: integer(m.at, "manifest.quotedAt"),
  };
}

function decodeSignResponse(raw: Record<string, unknown>): SignResponse {
  if (!Array.isArray(raw.sigs) || raw.sigs.length === 0) {
    throw new Error("agqp: a signing response carries no signature");
  }
  return {
    kind: "SIGR",
    sid: bytes(raw.sid, SID_BYTES, "sid"),
    signatures: raw.sigs.map((s, i) => bytes(s, SIGNATURE_BYTES, `signature ${i}`)),
  };
}

function decodePairRecord(raw: Record<string, unknown>): PairRecord {
  if (raw.net !== "mainnet" && raw.net !== "devnet") {
    throw new Error(`agqp: unknown network ${JSON.stringify(raw.net)}`);
  }
  return {
    kind: "PAIR",
    vault: pubkey(raw.vault, "vault"),
    label: text(raw.label, "label"),
    network: raw.net,
  };
}
