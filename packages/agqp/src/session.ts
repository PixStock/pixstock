/**
 * Reassembles a payload from frames arriving out of order, duplicated, and
 * mixed with frames from other sessions. See docs/AGQP-SPEC.md §4.
 */

import { parseFrame, type Frame } from "./frame.js";

export interface AssemblerProgress {
  /** Distinct frames accepted so far. */
  received: number;
  /** Frames expected. 0 until the first valid frame locks the session. */
  total: number;
  done: boolean;
  /** Present once every frame has arrived. */
  payload?: Uint8Array;
  /** Whether this particular push was a frame we accepted. */
  accepted: boolean;
}

export class FrameAssembler {
  private sid: string | null = null;
  private total = 0;
  private readonly chunks = new Map<number, Uint8Array>();
  private payload: Uint8Array | null = null;

  /** Frames seen and discarded: other sessions, corrupted, not ours. */
  ignored = 0;

  /**
   * Feeds one decoded QR string in.
   *
   * The first valid frame locks the session id; every later frame carrying a
   * different one is ignored, so a second phone or a stale cycle on screen
   * cannot corrupt the assembly.
   */
  push(text: string): AssemblerProgress {
    const frame = parseFrame(text);
    if (frame === null || !this.accepts(frame)) {
      this.ignored++;
      return this.progress(false);
    }

    if (this.sid === null) {
      this.sid = frame.sid;
      this.total = frame.total;
    }

    this.chunks.set(frame.index, frame.chunk);

    if (this.chunks.size === this.total) {
      this.payload = this.concat();
    }

    return this.progress(true);
  }

  reset(): void {
    this.sid = null;
    this.total = 0;
    this.chunks.clear();
    this.payload = null;
    this.ignored = 0;
  }

  private accepts(frame: Frame): boolean {
    if (this.sid === null) return true;
    // Once locked, the session id and the frame count must both match. A
    // differing total means the sender restarted with another payload.
    return frame.sid === this.sid && frame.total === this.total;
  }

  private concat(): Uint8Array {
    let length = 0;
    for (let i = 1; i <= this.total; i++) {
      length += this.chunks.get(i)!.length;
    }

    const out = new Uint8Array(length);
    let offset = 0;
    for (let i = 1; i <= this.total; i++) {
      const chunk = this.chunks.get(i)!;
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private progress(accepted: boolean): AssemblerProgress {
    const done = this.payload !== null;
    return {
      received: this.chunks.size,
      total: this.total,
      done,
      accepted,
      ...(done ? { payload: this.payload! } : {}),
    };
  }
}
