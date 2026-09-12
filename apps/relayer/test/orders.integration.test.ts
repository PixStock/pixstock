import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { USDC_MINT, ASSETS } from "@pixstock/shared";
import { appConfig, databaseConfig, relayerConfig, solanaConfig } from "../src/config";
import { DatabaseModule } from "../src/database/database.module";
import { DatabaseService } from "../src/database/database.service";
import { OrdersModule } from "../src/modules/orders/orders.module";
import { TxBuilderService } from "../src/modules/tx-builder/tx-builder.service";
import { withEnv } from "./with-env";

/**
 * The order lifecycle against the real database, with the transaction builder
 * replaced by the recorded basket.
 *
 * Building is covered by the live suite, which is the only place that can
 * tell whether a real route still fits. What is checked here is everything
 * that happens afterwards: persistence, the state machine, and whether a
 * signature is accepted or refused.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/tx-policy/test/fixtures/basket-order.json", import.meta.url),
    "utf8"
  )
) as { vault: string; vaultSeed: string; feePayer: string; messages: string[]; legs: unknown[] };

const messageBytes = Uint8Array.from(Buffer.from(fixture.messages[0]!, "base64"));
const seed = Uint8Array.from(Buffer.from(fixture.vaultSeed, "base64"));
const goodSignature = Buffer.from(ed25519.sign(messageBytes, seed)).toString("base64");

class RecordedBuilder {
  async build() {
    return {
      kind: "BASKET" as const,
      messages: [messageBytes],
      sizes: [messageBytes.length + 65],
      expiry: "blockhash" as const,
      legs: (fixture.legs as Array<Record<string, unknown>>).map((leg) => ({
        inMint: leg.inMint as string,
        outMint: leg.outMint as string,
        inAmount: leg.inAmount as string,
        expectedOutAmount: leg.expectedOutAmount as string,
        minOutAmount: leg.minOutAmount as string,
        route: ["Whirlpool"],
      })),
    };
  }
}

describe("the order lifecycle", () => {
  // The fixture was built for this fee payer, so R3 has something to agree
  // with. The secret is cleared: a real one in a developer's .env would derive
  // a different public key and every signature here would be refused.
  withEnv({ RELAYER_PUBKEY: fixture.feePayer, RELAYER_SECRET_KEY: "" });

  let app: INestApplication;
  let db: DatabaseService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig, databaseConfig, solanaConfig, relayerConfig],
        }),
        DatabaseModule,
        OrdersModule,
      ],
    })
      .overrideProvider(TxBuilderService)
      .useClass(RecordedBuilder)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    db = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await db.relayerEvent.deleteMany({});
    await db.order.deleteMany({});
  });

  const legs = [
    { inMint: USDC_MINT, outMint: ASSETS[0]!.mint, inAmount: "200000000" },
  ];

  const createOrder = async () => {
    const { body } = await request(app.getHttpServer())
      .post("/v1/orders")
      .send({ vault: fixture.vault, legs })
      .expect(201);
    return body;
  };

  describe("POST /v1/orders", () => {
    it("stores an order awaiting the vault's signature", async () => {
      const order = await createOrder();

      expect(order.status).toBe("AWAITING_SIGNATURE");
      expect(order.vault).toBe(fixture.vault);
      expect(order.txMessages).toHaveLength(1);
      expect(order.manifest.feePayer).toBe(fixture.feePayer);

      const stored = await db.order.findUnique({ where: { id: order.orderId } });
      expect(stored).not.toBeNull();
      // Recorded at build time so a signature is checked against what this
      // relayer built, never against what comes back.
      expect(stored!.messageHashes).toHaveLength(1);
    });

    it("records what it built, for audit", async () => {
      const order = await createOrder();
      const events = await db.relayerEvent.findMany({ where: { orderId: order.orderId } });
      expect(events.map((e) => e.type)).toContain("order.built");
    });

    it.each([
      ["a vault that is not base58", { vault: "nope", legs }],
      ["no legs", { vault: fixture.vault, legs: [] }],
      ["more legs than fit in a transaction", {
        vault: fixture.vault,
        legs: Array.from({ length: 5 }, () => legs[0]),
      }],
      ["slippage past the cap the vault enforces", { vault: fixture.vault, legs, slippageBps: 500 }],
      ["a fractional amount", {
        vault: fixture.vault,
        legs: [{ ...legs[0], inAmount: "1.5" }],
      }],
    ])("rejects %s", async (_label, body) => {
      await request(app.getHttpServer()).post("/v1/orders").send(body).expect(400);
    });
  });

  describe("GET /v1/orders/:id", () => {
    it("returns the order", async () => {
      const created = await createOrder();
      const { body } = await request(app.getHttpServer())
        .get(`/v1/orders/${created.orderId}`)
        .expect(200);
      expect(body.orderId).toBe(created.orderId);
      expect(body.status).toBe("AWAITING_SIGNATURE");
    });

    it("404s on an unknown id", async () => {
      await request(app.getHttpServer()).get("/v1/orders/does-not-exist").expect(404);
    });

    it("expires an order whose blockhash can no longer land", async () => {
      const created = await createOrder();
      // Without a durable nonce the message dies with its blockhash; saying so
      // beats letting it fail on chain for an unexplained reason.
      await db.order.update({
        where: { id: created.orderId },
        data: { createdAt: new Date(Date.now() - 120_000) },
      });

      const { body } = await request(app.getHttpServer())
        .get(`/v1/orders/${created.orderId}`)
        .expect(200);
      expect(body.status).toBe("EXPIRED");
    });
  });

  describe("POST /v1/orders/:id/signature", () => {
    it("accepts the vault's signature and stops short of broadcasting", async () => {
      const created = await createOrder();

      const { body } = await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [goodSignature] })
        .expect(201);

      expect(body.status).toBe("SIGNED");
      // SIGNED must not be readable as "sent".
      expect(body.pending[0]).toMatch(/has not been sent|cannot co-sign or broadcast/);
      expect(body.txSignatures).toEqual([]);
    });

    it("refuses a signature from another key, naming the rule", async () => {
      const created = await createOrder();
      const stranger = ed25519.sign(messageBytes, crypto.getRandomValues(new Uint8Array(32)));

      const { body } = await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [Buffer.from(stranger).toString("base64")] })
        .expect(409);

      expect(body.violations.map((v: { rule: string }) => v.rule)).toContain("R2");
    });

    it("refuses a second signature for the same order", async () => {
      const created = await createOrder();
      await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [goodSignature] })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [goodSignature] })
        .expect(409);

      expect(body.violations.map((v: { rule: string }) => v.rule)).toContain("R8");
    });

    it("refuses the wrong number of signatures", async () => {
      const created = await createOrder();
      await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [goodSignature, goodSignature] })
        .expect(400);
    });

    it("rejects something that is not a signature", async () => {
      const created = await createOrder();
      await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: ["not base64"] })
        .expect(400);
    });

    it("records a refusal, so abuse leaves a trail", async () => {
      const created = await createOrder();
      const stranger = ed25519.sign(messageBytes, crypto.getRandomValues(new Uint8Array(32)));

      await request(app.getHttpServer())
        .post(`/v1/orders/${created.orderId}/signature`)
        .send({ signatures: [Buffer.from(stranger).toString("base64")] })
        .expect(409);

      const events = await db.relayerEvent.findMany({ where: { orderId: created.orderId } });
      expect(events.map((e) => e.type)).toContain("signature.refused");
    });
  });
});
