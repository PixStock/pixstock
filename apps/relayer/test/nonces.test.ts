import { describe, expect, it } from "vitest";
import { ConfigService } from "@nestjs/config";
import { Keypair } from "@solana/web3.js";
import { NoncesService } from "../src/modules/nonces/nonces.service";
import type { DatabaseService } from "../src/database/database.service";
import type { SolanaService } from "../src/modules/solana/solana.service";

/**
 * The nonce pool, and above all the gate on creating one.
 *
 * Each account costs roughly 0.0015 SOL of rent. Real, irreversible spending
 * must never be a side effect of a service starting up.
 */
const keypair = Keypair.fromSeed(new Uint8Array(32).fill(5));
const secretKey = JSON.stringify([...keypair.secretKey]);

const build = (relayer: Record<string, unknown>, db: Partial<DatabaseService> = {}) =>
  new NoncesService(
    db as DatabaseService,
    { rpc: {} } as unknown as SolanaService,
    new ConfigService({ relayer: { secretKey: "", allowBroadcast: false, ...relayer } }),
  );

describe("creating nonce accounts", () => {
  it("is refused without a key", async () => {
    await expect(build({}).create(1)).rejects.toThrow(/no relayer key/);
  });

  it("is refused with a key but no explicit permission", async () => {
    // Having a key is not consent to spend it.
    const nonces = build({ secretKey });
    expect(nonces.canCreate).toBe(false);
    await expect(nonces.create(1)).rejects.toThrow(/RELAYER_ALLOW_BROADCAST/);
  });

  it("is allowed only when broadcasting is explicitly on", () => {
    expect(build({ secretKey, allowBroadcast: true }).canCreate).toBe(true);
  });
});

describe("reserving", () => {
  it("returns nothing without a key, so the order falls back to a blockhash", async () => {
    await expect(build({}).reserve("order-1")).resolves.toBeNull();
  });

  it("returns nothing when the pool is empty", async () => {
    const db = { nonceAccount: { findFirst: async () => null } };
    await expect(build({ secretKey }, db as unknown as DatabaseService).reserve("order-1"))
      .resolves.toBeNull();
  });

  it("releases by order, whatever the outcome was", async () => {
    let released: unknown = null;
    const db = {
      nonceAccount: {
        updateMany: async (args: unknown) => {
          released = args;
          return { count: 1 };
        },
      },
    };

    await build({ secretKey }, db as unknown as DatabaseService).release("order-7");
    expect(released).toMatchObject({
      where: { orderId: "order-7" },
      data: { inUse: false, orderId: null },
    });
  });
});
