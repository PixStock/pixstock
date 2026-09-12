/**
 * One AGQP frame: build it, parse it, reject it.
 *
 * Format is frozen in docs/AGQP-SPEC.md §1. The header is fixed width and
 * read by offset — never split on `:`, it belongs to the Base45 alphabet and
 * a chunk can contain it.
 */

import { crc32 } from "./crc32.js";
import { toBase45, fromBase45 } from "./base45.js";

export const PROTOCOL_MAGIC = "PS1";

/** Byte length of a session id, before Base45. */
export const SID_BYTES = 3;
/** Base45 length of a session id. 3 bytes → 5 characters. */
export const SID_CHARS = 5;

export const HEADER_CHARS = 25;
export const MAX_FRAMES = 99;

/** Chunk size preset. See docs/AGQP-SPEC.md §1. */
export type FrameSize = "S" | "M" | "L";

export const CHUNK_SIZES: Record<FrameSize, number> = { S: 200, M: 300, L: 400 };

export interface Frame {
  sid: string;
  index: number;
  total: number;
  chunk: Uint8Array;
}

function hex8(value: number): string {
  return value.toString(16).toUpperCase().padStart(8, "0");
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Encodes a session id as its 5-character Base45 form. */
export function encodeSessionId(sid: Uint8Array): string {
  if (sid.length !== SID_BYTES) {
    throw new Error(`agqp: a session id is ${SID_BYTES} bytes, got ${sid.length}`);
  }
  return toBase45(sid);
}

/** Decodes a session id from its 5-character Base45 form. */
export function decodeSessionId(sid: string): Uint8Array {
  if (sid.length !== SID_CHARS) {
    throw new Error(`agqp: a session id is ${SID_CHARS} characters, got ${sid.length}`);
  }
  const bytes = fromBase45(sid);
  if (bytes.length !== SID_BYTES) {
    throw new Error(`agqp: a session id decodes to ${SID_BYTES} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** A fresh random session id. */
export function newSessionId(): Uint8Array {
  const sid = new Uint8Array(SID_BYTES);
  crypto.getRandomValues(sid);
  return sid;
}

export function buildFrame(sid: string, index: number, total: number, chunk: Uint8Array): string {
  if (sid.length !== SID_CHARS) {
    throw new Error(`agqp: a session id is ${SID_CHARS} characters, got ${sid.length}`);
  }
  if (index < 1 || index > total || total < 1 || total > MAX_FRAMES) {
    throw new Error(`agqp: frame ${index}/${total} is out of bounds`);
  }
  return (
    `${PROTOCOL_MAGIC}:${sid}:${twoDigits(index)}:${twoDigits(total)}:` +
    `${hex8(crc32(chunk))}:${toBase45(chunk)}`
  );
}

/**
 * Parses one decoded QR string.
 *
 * Returns `null` for anything that is not a valid frame — wrong magic, short
 * header, non-numeric counters, bad Base45, CRC mismatch. A camera sees a lot
 * of garbage and a lot of other people's QR codes; none of it is an error
 * worth surfacing, so the caller just keeps scanning.
 */
export function parseFrame(text: string): Frame | null {
  if (text.length <= HEADER_CHARS) return null;
  if (text.slice(0, 3) !== PROTOCOL_MAGIC) return null;
  if (text[3] !== ":" || text[9] !== ":" || text[12] !== ":" || text[15] !== ":" || text[24] !== ":") {
    return null;
  }

  const sid = text.slice(4, 9);
  const indexText = text.slice(10, 12);
  const totalText = text.slice(13, 15);
  const crcText = text.slice(16, 24);
  const chunkText = text.slice(25);

  if (!/^\d{2}$/.test(indexText) || !/^\d{2}$/.test(totalText)) return null;
  if (!/^[0-9A-F]{8}$/.test(crcText)) return null;

  const index = Number(indexText);
  const total = Number(totalText);
  if (total < 1 || total > MAX_FRAMES) return null;
  if (index < 1 || index > total) return null;

  let chunk: Uint8Array;
  try {
    chunk = fromBase45(chunkText);
  } catch {
    return null;
  }

  if (hex8(crc32(chunk)) !== crcText) return null;

  return { sid, index, total, chunk };
}
