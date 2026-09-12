/**
 * The return leg: vault → webcam.
 *
 * Only the signatures travel back, never the transaction. The web side still
 * holds the message it sent, so returning 64 bytes instead of a kilobyte
 * turns the reply into a single static QR that reads instantly — decision D5.
 *
 * ```
 * SIGR:<BASE45( sid(3) | count(1) | signature(64) * count )>
 * ```
 */

import { toBase45, fromBase45 } from "./base45.js";
import { SID_BYTES, encodeSessionId } from "./frame.js";

export const RESPONSE_MAGIC = "SIGR";
export const SIGNATURE_BYTES = 64;
/** One transaction in practice, two when a basket has to be split. */
export const MAX_SIGNATURES = 4;

export interface SignatureResponse {
  /** Base45 session id, matching the frames that carried the request. */
  sid: string;
  signatures: Uint8Array[];
}

export function encodeSignatureResponse(sid: Uint8Array, signatures: Uint8Array[]): string {
  if (signatures.length < 1 || signatures.length > MAX_SIGNATURES) {
    throw new Error(`agqp: expected 1 to ${MAX_SIGNATURES} signatures, got ${signatures.length}`);
  }
  for (const signature of signatures) {
    if (signature.length !== SIGNATURE_BYTES) {
      throw new Error(`agqp: a signature is ${SIGNATURE_BYTES} bytes, got ${signature.length}`);
    }
  }

  const body = new Uint8Array(SID_BYTES + 1 + signatures.length * SIGNATURE_BYTES);
  body.set(sid, 0);
  body[SID_BYTES] = signatures.length;
  signatures.forEach((signature, i) => body.set(signature, SID_BYTES + 1 + i * SIGNATURE_BYTES));

  return `${RESPONSE_MAGIC}:${toBase45(body)}`;
}

/**
 * Parses a reply. Returns `null` for anything that is not one — the webcam
 * sees the room, and none of it is worth an error.
 */
export function parseSignatureResponse(text: string): SignatureResponse | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${RESPONSE_MAGIC}:`)) return null;

  let body: Uint8Array;
  try {
    body = fromBase45(trimmed.slice(RESPONSE_MAGIC.length + 1));
  } catch {
    return null;
  }

  if (body.length < SID_BYTES + 1) return null;

  const count = body[SID_BYTES]!;
  if (count < 1 || count > MAX_SIGNATURES) return null;
  if (body.length !== SID_BYTES + 1 + count * SIGNATURE_BYTES) return null;

  const signatures: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const start = SID_BYTES + 1 + i * SIGNATURE_BYTES;
    signatures.push(body.slice(start, start + SIGNATURE_BYTES));
  }

  return { sid: encodeSessionId(body.slice(0, SID_BYTES)), signatures };
}
