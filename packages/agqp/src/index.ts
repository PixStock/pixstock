/**
 * AGQP v1 — Air-Gap QR Protocol.
 *
 * Splits a payload (a Solana transaction, its Pyth attestation and a readable
 * manifest) into animated QR frames the offline vault reads with a camera,
 * and reassembles what comes back.
 *
 * The format is frozen in docs/AGQP-SPEC.md. Both sides of the optical
 * channel must read it identically, so any change to the envelope is
 * breaking and touches the encoder, the assembler and the test vectors in
 * one commit.
 */

export { crc32 } from "./crc32.js";
export { toBase45, fromBase45 } from "./base45.js";

export {
  PROTOCOL_MAGIC,
  SID_BYTES,
  SID_CHARS,
  HEADER_CHARS,
  MAX_FRAMES,
  CHUNK_SIZES,
  buildFrame,
  parseFrame,
  encodeSessionId,
  newSessionId,
  type Frame,
  type FrameSize,
} from "./frame.js";

export { FrameAssembler, type AssemblerProgress } from "./session.js";
export { AnimatedQrScheduler, DEFAULT_FPS } from "./scheduler.js";

import { CHUNK_SIZES, MAX_FRAMES, buildFrame, encodeSessionId, type FrameSize } from "./frame.js";

export interface EncodeOptions {
  /**
   * Session id, 3 bytes. Required rather than generated here: the CBOR
   * payload carries the same `sid`, so the caller must mint it before
   * building the payload. Use `newSessionId()`.
   */
  sid: Uint8Array;
  /** Preset chunk size. Defaults to `M` (300 bytes). */
  size?: FrameSize;
  /** Explicit chunk size in bytes. Overrides `size`. */
  chunkSize?: number;
}

/**
 * Encodes a payload into the strings to render as animated QR codes.
 *
 * Frames are 1-indexed and meant to be cycled continuously — the phone can
 * join the sequence anywhere.
 */
export function encodeFrames(payload: Uint8Array, options: EncodeOptions): string[] {
  const chunkSize = options.chunkSize ?? CHUNK_SIZES[options.size ?? "M"];

  if (payload.length === 0) {
    throw new Error("agqp: refusing to encode an empty payload");
  }
  if (chunkSize < 1) {
    throw new Error(`agqp: chunk size must be positive, got ${chunkSize}`);
  }

  const total = Math.ceil(payload.length / chunkSize);
  if (total > MAX_FRAMES) {
    throw new Error(
      `agqp: ${payload.length} bytes at ${chunkSize} per frame needs ${total} frames, ` +
        `over the ${MAX_FRAMES} the envelope can index — raise the chunk size`
    );
  }

  const sid = encodeSessionId(options.sid);
  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    frames.push(buildFrame(sid, i + 1, total, payload.subarray(i * chunkSize, (i + 1) * chunkSize)));
  }
  return frames;
}
