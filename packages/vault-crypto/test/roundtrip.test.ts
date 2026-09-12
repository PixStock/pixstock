import { describe, expect, it } from "vitest";
import {
  FrameAssembler,
  decodeSessionId,
  encodeFrames,
  encodeSessionId,
  encodeSignatureResponse,
  newSessionId,
  parseSignatureResponse,
} from "@pixstock/agqp";
import { DEFAULT_KDF, generateVault, lock, signWith, verify } from "../src/index.js";

const PASSWORD = "correct horse battery staple";
const FAST_KDF = { ...DEFAULT_KDF, iterations: 1, memoryKiB: 1024 };

/**
 * The optical loop, end to end, with no camera and no chain: the web side
 * emits, the vault reassembles and signs, the web side reads the reply back
 * and checks it against the message it sent.
 *
 * This is the G1 gate expressed as a test. If it goes red, the channel is
 * broken no matter how good the two apps look.
 */
describe("air-gapped round trip", () => {
  it("carries an order across and brings back a valid signature", async () => {
    // Web: build a 3-leg basket sized from docs/AGQP-SPEC.md §3.
    const message = Uint8Array.from({ length: 1330 }, (_, i) => (i * 37 + 11) % 256);
    const sid = newSessionId();
    const frames = encodeFrames(message, { sid });
    expect(frames).toHaveLength(5);

    // Vault: frames arrive out of order, one of them twice, as a camera
    // catching a cycling display would see them.
    const assembler = new FrameAssembler();
    let progress;
    for (const i of [3, 0, 3, 4, 1, 2]) progress = assembler.push(frames[i]!);

    expect(progress!.done).toBe(true);
    expect(progress!.payload).toEqual(message);
    expect(assembler.sessionId).toBe(encodeSessionId(sid));

    // Vault: sign what was assembled, under the master password.
    const { seed, publicKey } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    const signature = await signWith(blob, PASSWORD, progress!.payload!);

    const reply = encodeSignatureResponse(decodeSessionId(assembler.sessionId!), [signature]);
    // One static QR, not a sequence.
    expect(reply.length).toBeLessThanOrEqual(122);

    // Web: read the reply, check it answers this order, verify it against the
    // message that was sent — not against what came back.
    const parsed = parseSignatureResponse(reply);
    expect(parsed).not.toBeNull();
    expect(parsed!.sid).toBe(encodeSessionId(sid));
    expect(verify(parsed!.signatures[0]!, message, publicKey)).toBe(true);
  });

  it("does not accept a signature produced for another order", async () => {
    const message = Uint8Array.from({ length: 800 }, (_, i) => i % 256);
    const otherMessage = Uint8Array.from({ length: 800 }, (_, i) => (i + 1) % 256);

    const { seed, publicKey } = generateVault();
    const blob = await lock(seed, PASSWORD, FAST_KDF);
    const signature = await signWith(blob, PASSWORD, otherMessage);

    const reply = encodeSignatureResponse(newSessionId(), [signature]);
    const parsed = parseSignatureResponse(reply)!;

    expect(verify(parsed.signatures[0]!, message, publicKey)).toBe(false);
  });

  it("surfaces a reply from a different session", () => {
    const ours = newSessionId();
    const theirs = newSessionId();
    const signature = new Uint8Array(64).fill(9);

    const parsed = parseSignatureResponse(encodeSignatureResponse(theirs, [signature]))!;
    expect(parsed.sid).not.toBe(encodeSessionId(ours));
  });
});
