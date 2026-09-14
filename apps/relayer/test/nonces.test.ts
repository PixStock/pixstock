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

/**
 * Reclaiming nonces nobody is going to use.
 *
 * A durable nonce does not expire, so nothing else in the system ever frees
 * one: an order built and walked away from holds its account for good. Three
 * abandoned rehearsals empty a three-account pool, after which every order
 * quietly falls back to a blockhash — which is the failure this exists to
 * stop, and the reason "in flight" has to be judged carefully rather than by
 * age alone.
 */
const HOUR = 3_600_000;

const withOrders = (
  nonces: Array<{ pubkey: string; orderId: string | null }>,
  orders: Record<string, { status: string; txSignatures: string[]; ageMs: number }>,
) => {
  const freed: string[] = [];
  const db = {
    nonceAccount: {
      findMany: async () => nonces.map((n) => ({ ...n, inUse: true })),
      updateMany: async ({ where }: { where: { pubkey: { in: string[] } } }) => {
        freed.push(...where.pubkey.in);
        return { count: where.pubkey.in.length };
      },
    },
    order: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const order = orders[where.id];
        return order
          ? { ...order, id: where.id, createdAt: new Date(Date.now() - order.ageMs) }
          : null;
      },
    },
  } as unknown as DatabaseService;
  return { service: build({ secretKey, allowBroadcast: true }, db), freed };
};

describe("reclaiming abandoned nonces", () => {
  it("frees one held by an order that was never broadcast", async () => {
    const { service, freed } = withOrders(
      [{ pubkey: "N1", orderId: "o1" }],
      { o1: { status: "AWAITING_SIGNATURE", txSignatures: [], ageMs: 2 * HOUR } },
    );
    const result = await service.releaseAbandoned(HOUR);
    expect(result).toHaveLength(1);
    expect(result[0]!.reason).toMatch(/never broadcast/);
    expect(freed).toEqual(["N1"]);
  });

  it("leaves a broadcast order alone, however old", async () => {
    // The transaction may still land. Handing the account to a second order
    // would let it build on a value the cluster has not consumed yet.
    const { service, freed } = withOrders(
      [{ pubkey: "N1", orderId: "o1" }],
      { o1: { status: "BROADCAST", txSignatures: ["sig"], ageMs: 400 * HOUR } },
    );
    await expect(service.releaseAbandoned(HOUR)).resolves.toEqual([]);
    expect(freed).toEqual([]);
  });

  it("leaves a signed order that already has a signature on the wire", async () => {
    const { service } = withOrders(
      [{ pubkey: "N1", orderId: "o1" }],
      { o1: { status: "SIGNED", txSignatures: ["sig"], ageMs: 9 * HOUR } },
    );
    await expect(service.releaseAbandoned(HOUR)).resolves.toEqual([]);
  });

  it("leaves a young order alone: someone may be mid-scan", async () => {
    const { service } = withOrders(
      [{ pubkey: "N1", orderId: "o1" }],
      { o1: { status: "AWAITING_SIGNATURE", txSignatures: [], ageMs: 60_000 } },
    );
    await expect(service.releaseAbandoned(HOUR)).resolves.toEqual([]);
  });

  it("frees one whose order no longer exists", async () => {
    const { service, freed } = withOrders([{ pubkey: "N1", orderId: "gone" }], {});
    const result = await service.releaseAbandoned(HOUR);
    expect(result[0]!.reason).toMatch(/no longer exists/);
    expect(freed).toEqual(["N1"]);
  });

  it("frees one marked in use by no order at all", async () => {
    const { service, freed } = withOrders([{ pubkey: "N1", orderId: null }], {});
    const result = await service.releaseAbandoned(HOUR);
    expect(result[0]!.reason).toMatch(/no order/);
    expect(freed).toEqual(["N1"]);
  });

  it("writes nothing when there is nothing to free", async () => {
    const { service, freed } = withOrders(
      [{ pubkey: "N1", orderId: "o1" }],
      { o1: { status: "BROADCAST", txSignatures: ["sig"], ageMs: 9 * HOUR } },
    );
    await service.releaseAbandoned(HOUR);
    expect(freed).toEqual([]);
  });
});
