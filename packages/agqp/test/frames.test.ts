import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZES,
  FrameAssembler,
  HEADER_CHARS,
  MAX_FRAMES,
  encodeFrames,
  newSessionId,
  parseFrame,
  type FrameSize,
} from "../src/index.js";

/** The QR alphanumeric mode character set — see docs/AGQP-SPEC.md §1. */
const QR_ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

function payloadOf(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 31 + seed * 17) % 256);
}

/** Feeds frames in, in the given order, and returns the reassembled payload. */
function assemble(frames: string[], order?: number[]): Uint8Array | undefined {
  const assembler = new FrameAssembler();
  let last;
  for (const i of order ?? frames.map((_, i) => i)) {
    last = assembler.push(frames[i]);
  }
  return last?.payload;
}

describe("encodeFrames", () => {
  it("round-trips 1000 random payloads at every preset", () => {
    const sizes: FrameSize[] = ["S", "M", "L"];
    for (let n = 0; n < 1000; n++) {
      const size = sizes[n % 3];
      const payload = payloadOf(1 + (n * 7) % 1400, n);
      const frames = encodeFrames(payload, { sid: newSessionId(), size });
      expect(assemble(frames), `payload ${n} at size ${size}`).toEqual(payload);
    }
  });

  it("splits a 3-leg basket request into 5 frames at the default size", () => {
    // The measured budget from docs/AGQP-SPEC.md §3.
    const frames = encodeFrames(payloadOf(1330), { sid: newSessionId() });
    expect(frames).toHaveLength(5);
  });

  it("splits a single swap request into 3 frames", () => {
    expect(encodeFrames(payloadOf(800), { sid: newSessionId() })).toHaveLength(3);
  });

  it("emits only QR alphanumeric characters", () => {
    for (const size of ["S", "M", "L"] as FrameSize[]) {
      for (const frame of encodeFrames(payloadOf(1330), { sid: newSessionId(), size })) {
        expect(frame).toMatch(QR_ALPHANUMERIC);
      }
    }
  });

  it("keeps a default-size frame inside the QR version 14-M budget", () => {
    const frames = encodeFrames(payloadOf(1330), { sid: newSessionId() });
    for (const frame of frames) {
      expect(frame.length).toBeLessThanOrEqual(HEADER_CHARS + (CHUNK_SIZES.M / 2) * 3);
      expect(frame.length).toBeLessThanOrEqual(528);
    }
  });

  it("refuses an empty payload", () => {
    expect(() => encodeFrames(new Uint8Array(0), { sid: newSessionId() })).toThrow(/empty payload/);
  });

  it("refuses a payload that would need more than 99 frames", () => {
    expect(() => encodeFrames(payloadOf(2000), { sid: newSessionId(), chunkSize: 10 })).toThrow(
      new RegExp(`over the ${MAX_FRAMES}`)
    );
  });

  it("rejects a session id of the wrong length", () => {
    expect(() => encodeFrames(payloadOf(10), { sid: new Uint8Array(4) })).toThrow(/session id is 3 bytes/);
  });
});

describe("parseFrame", () => {
  const frame = encodeFrames(payloadOf(500), { sid: newSessionId() })[0];

  it("rejects a chunk with a flipped bit", () => {
    // Flip one character of the Base45 body; the CRC must catch it.
    const body = frame.slice(HEADER_CHARS);
    const swapped = body[0] === "0" ? "1" : "0";
    expect(parseFrame(frame.slice(0, HEADER_CHARS) + swapped + body.slice(1))).toBeNull();
  });

  it("rejects a tampered CRC", () => {
    const crc = frame.slice(16, 24);
    const other = crc === "00000000" ? "FFFFFFFF" : "00000000";
    expect(parseFrame(frame.slice(0, 16) + other + frame.slice(24))).toBeNull();
  });

  it.each([
    ["another protocol", "XX1" + frame.slice(3)],
    ["a non-numeric index", frame.slice(0, 10) + "0A" + frame.slice(12)],
    ["an index past the total", frame.slice(0, 10) + "09" + frame.slice(12)],
    ["a zero total", frame.slice(0, 13) + "00" + frame.slice(15)],
    ["a header-only string", frame.slice(0, HEADER_CHARS)],
    ["plain text", "hello there"],
    ["an empty string", ""],
  ])("rejects %s", (_label, text) => {
    expect(parseFrame(text)).toBeNull();
  });

  it("accepts a well-formed frame", () => {
    const parsed = parseFrame(frame);
    expect(parsed).not.toBeNull();
    expect(parsed!.index).toBe(1);
  });
});

describe("FrameAssembler", () => {
  const payload = payloadOf(1330);
  const frames = encodeFrames(payload, { sid: newSessionId() });

  it("reassembles frames arriving out of order", () => {
    expect(assemble(frames, [3, 0, 4, 1, 2])).toEqual(payload);
  });

  it("tolerates duplicates", () => {
    expect(assemble(frames, [0, 0, 1, 1, 1, 2, 3, 4, 4])).toEqual(payload);
  });

  it("reports progress as frames arrive", () => {
    const assembler = new FrameAssembler();
    expect(assembler.push(frames[0])).toMatchObject({ received: 1, total: 5, done: false });
    expect(assembler.push(frames[0])).toMatchObject({ received: 1, total: 5, done: false });
    expect(assembler.push(frames[1])).toMatchObject({ received: 2, total: 5, done: false });
  });

  it("ignores frames from another session", () => {
    const other = encodeFrames(payloadOf(1330, 99), { sid: newSessionId() });
    const assembler = new FrameAssembler();

    assembler.push(frames[0]);
    const rejected = assembler.push(other[1]);
    expect(rejected.accepted).toBe(false);
    expect(rejected.received).toBe(1);

    for (const frame of frames.slice(1)) assembler.push(frame);
    const last = assembler.push(frames[4]);

    expect(last.done).toBe(true);
    expect(last.payload).toEqual(payload);
    expect(assembler.ignored).toBe(1);
  });

  it("counts garbage without failing", () => {
    const assembler = new FrameAssembler();
    expect(assembler.push("not a frame at all").accepted).toBe(false);
    expect(assembler.push("").accepted).toBe(false);
    expect(assembler.ignored).toBe(2);
    expect(assembler.push(frames[0]).accepted).toBe(true);
  });

  it("starts over after reset", () => {
    const assembler = new FrameAssembler();
    assembler.push(frames[0]);
    assembler.reset();
    expect(assembler.push(frames[0])).toMatchObject({ received: 1, total: 5 });
  });
});
