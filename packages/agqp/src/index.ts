/**
 * AGQP v1 — Air-Gap QR Protocol.
 *
 * Splits a Solana transaction (plus its Pyth attestation and manifest) into
 * animated QR frames the offline vault can read with a camera, and
 * reassembles the 64-byte signature that comes back.
 *
 * The frame envelope and CBOR payload are specified in docs/AGQP-SPEC.md —
 * read it before touching `encodeFrames` or `FrameAssembler`.
 */

export { crc32 } from "./crc32.js";
export { toBase45, fromBase45 } from "./base45.js";

export const PROTOCOL_MAGIC = "PS1";

/** QR size preset. Measured on the team's phones — see docs/AGQP-SPEC.md. */
export type FrameSize = "S" | "M" | "L";

export interface EncodeOptions {
  /** Payload bytes per frame. Drives the frame count. */
  chunkSize?: number;
  size?: FrameSize;
}

export interface AssemblerProgress {
  received: number;
  total: number;
  done: boolean;
  /** Present once every frame has arrived and the CRC matches. */
  payload?: Uint8Array;
}

/**
 * Encodes a payload into the Base45 strings to render as animated QR codes.
 * Frames cycle continuously so the scanner can join mid-sequence.
 */
export function encodeFrames(_payload: Uint8Array, _options: EncodeOptions = {}): string[] {
  throw new Error("agqp: encodeFrames is not implemented yet — see docs/AGQP-SPEC.md §5.1");
}

/**
 * Collects frames as the camera decodes them, in any order, tolerating
 * duplicates and rejecting frames from another session.
 */
export class FrameAssembler {
  push(_text: string): AssemblerProgress {
    throw new Error("agqp: FrameAssembler is not implemented yet — see docs/AGQP-SPEC.md §5.4");
  }

  reset(): void {
    throw new Error("agqp: FrameAssembler is not implemented yet");
  }
}

/** Drives the frame cycle at a fixed frame rate (8 FPS by default). */
export class AnimatedQrScheduler {
  constructor(
    private readonly frames: readonly string[],
    private readonly fps = 8
  ) {}

  start(_onFrame: (frame: string, index: number) => void): () => void {
    throw new Error("agqp: AnimatedQrScheduler is not implemented yet");
  }
}
