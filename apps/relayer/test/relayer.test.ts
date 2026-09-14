import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { Keypair, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { RelayerService } from "../src/modules/relayer/relayer.service";
import { PythService } from "../src/modules/pyth/pyth.service";
import type { SolanaService } from "../src/modules/solana/solana.service";

/**
 * Custody of the hot key: who can sign, who can send, and how a signed
 * transaction is assembled.
 *
 * Broadcasting is the one irreversible thing this codebase does, so the tests
 * that matter most here are the ones asserting it stays off.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/tx-policy/test/fixtures/basket-order.json", import.meta.url),
    "utf8"
  )
) as { vault: string; vaultSeed: string; feePayer: string; messages: string[] };

const messageBytes = Uint8Array.from(Buffer.from(fixture.messages[0]!, "base64"));
const vaultSeed = Uint8Array.from(Buffer.from(fixture.vaultSeed, "base64"));
const vaultSignature = ed25519.sign(messageBytes, vaultSeed);

/** The fee payer the fixture was built for, so assembly has a slot to fill. */
const relayerKeypair = Keypair.fromSeed(new Uint8Array(32).fill(3));

const build = (over: Record<string, unknown> = {}) =>
  new RelayerService(
    new ConfigService({ relayer: { secretKey: "", allowBroadcast: false, ...over } }),
    { rpc: {} } as unknown as SolanaService,
  );

describe("what the relayer is allowed to do", () => {
  it("cannot sign without a key", () => {
    const relayer = build();
    expect(relayer.canSign).toBe(false);
    expect(relayer.publicKey).toBeNull();
  });

  it("signs once a key is configured, in either format", () => {
    const json = build({ secretKey: JSON.stringify([...relayerKeypair.secretKey]) });
    expect(json.canSign).toBe(true);
    expect(json.publicKey).toBe(relayerKeypair.publicKey.toBase58());
  });

  it("never broadcasts by default, even with a key", () => {
    // Broadcasting spends real SOL and cannot be undone. Having a key is not
    // consent to send.
    const relayer = build({ secretKey: JSON.stringify([...relayerKeypair.secretKey]) });
    expect(relayer.canSign).toBe(true);
    expect(relayer.canBroadcast).toBe(false);
  });

  it("broadcasts only when explicitly enabled", () => {
    const relayer = build({
      secretKey: JSON.stringify([...relayerKeypair.secretKey]),
      allowBroadcast: true,
    });
    expect(relayer.canBroadcast).toBe(true);
  });

  it("refuses to broadcast while disabled, naming the switch", async () => {
    const relayer = build({ secretKey: JSON.stringify([...relayerKeypair.secretKey]) });
    await expect(relayer.broadcast(messageBytes, vaultSignature)).rejects.toThrow(
      /RELAYER_ALLOW_BROADCAST/,
    );
  });

  it("has no balance to report without a key", async () => {
    await expect(build().balance()).resolves.toBeNull();
  });
});

/**
 * A cluster that answers with the shapes a real one answers with.
 *
 * `getSignatureStatuses` returns null for a signature it has never seen, and
 * otherwise a row whose `err` and `confirmationStatus` are the entire story.
 * Those four shapes are the whole contract, and each one means something
 * different to a holder waiting on a trade.
 */
const withStatuses = (...values: Array<Record<string, unknown> | null>) => {
  let call = 0;
  return {
    rpc: {
      getSignatureStatuses: async () => ({
        value: [values[Math.min(call++, values.length - 1)] ?? null],
      }),
    },
  } as unknown as SolanaService;
};

const relayerWith = (solana: SolanaService) =>
  new RelayerService(
    new ConfigService({ relayer: { secretKey: "", allowBroadcast: false } }),
    solana,
  );

describe("the price stream's socket", () => {
  it("has a WebSocket it can actually construct", () => {
    // This has failed in production twice, in opposite directions: ws 7 has
    // no named export and ws 8 does, the workspace hoists 7 for
    // @solana/web3.js, and tsc and the test runner disagree about what a
    // namespace import of a CommonJS module contains. The symptom both times
    // was the whole relayer failing to boot, and no test noticed — the socket
    // is only built once a Pyth token is configured, which no suite sets.
    expect(PythService.socketConstructorAvailable).toBe(true);
  });
});

describe("what the cluster says became of a transaction", () => {
  const signature = "5".repeat(88);

  it("reports a signature the cluster has never seen as pending, not failed", async () => {
    // The difference matters: an order sent a moment ago and an order that
    // failed look identical here, and calling the first one failed would tell
    // a holder their trade did not happen when it did.
    const result = await relayerWith(withStatuses(null)).status(signature);
    expect(result).toEqual({ ok: false, pending: true });
  });

  it("treats `processed` as still in flight", async () => {
    const result = await relayerWith(
      withStatuses({ slot: 341_002_118, err: null, confirmationStatus: "processed" }),
    ).status(signature);
    expect(result.pending).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("confirms once the cluster says confirmed", async () => {
    const result = await relayerWith(
      withStatuses({ slot: 341_002_118, err: null, confirmationStatus: "confirmed" }),
    ).status(signature);
    expect(result).toEqual({ ok: true, slot: 341_002_118, confirmationStatus: "confirmed" });
  });

  it("confirms a finalized signature too", async () => {
    const result = await relayerWith(
      withStatuses({ slot: 341_002_118, err: null, confirmationStatus: "finalized" }),
    ).status(signature);
    expect(result.ok).toBe(true);
  });

  it("reports a program error as an error, and never as pending", async () => {
    const result = await relayerWith(
      withStatuses({
        slot: 341_002_118,
        err: { InstructionError: [2, { Custom: 6001 }] },
        confirmationStatus: "confirmed",
      }),
    ).status(signature);
    expect(result.ok).toBe(false);
    expect(result.pending).toBeUndefined();
    expect(result.error).toContain("InstructionError");
  });

  it("waits for a signature the cluster has not seen yet, then answers", async () => {
    const relayer = relayerWith(
      withStatuses(null, { slot: 341_002_119, err: null, confirmationStatus: "confirmed" }),
    );
    await expect(relayer.confirm(signature, 5_000)).resolves.toMatchObject({ ok: true });
  });

  it("gives up saying `not yet`, never saying `failed`", async () => {
    const result = await relayerWith(withStatuses(null)).confirm(signature, 10);
    expect(result).toEqual({ ok: false, pending: true });
  });
});

describe("assembling a signed transaction", () => {
  it("refuses a message this key does not sign", async () => {
    // The fixture's fee payer is not this keypair, so there is no slot for it.
    // R3 should have caught that earlier; failing loudly here means the checks
    // and the signing can never quietly disagree.
    const relayer = build({ secretKey: JSON.stringify([...relayerKeypair.secretKey]) });
    await expect(relayer.simulate(messageBytes, vaultSignature)).rejects.toThrow(
      /not a required signer/,
    );
  });

  it("the fixture really does expect two signatures", () => {
    const message = VersionedMessage.deserialize(Buffer.from(messageBytes));
    expect(message.header.numRequiredSignatures).toBe(2);

    const transaction = new VersionedTransaction(message);
    expect(transaction.signatures).toHaveLength(2);
    // Both slots start empty: the vault fills one, the relayer the other.
    expect(transaction.signatures.every((s) => s.every((b) => b === 0))).toBe(true);
  });
});
