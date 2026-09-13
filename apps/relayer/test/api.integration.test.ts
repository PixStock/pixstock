import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import request from "supertest";
import { ASSETS, USDC_MINT } from "@pixstock/shared";
import { AppController } from "../src/app.controller";
import { appConfig, databaseConfig, relayerConfig, solanaConfig } from "../src/config";
import { MintStateService } from "../src/modules/market/mint-state.service";
import { DatabaseModule } from "../src/database/database.module";
import { HealthModule } from "../src/modules/health/health.module";
import { MarketModule } from "../src/modules/market/market.module";
import { PythModule } from "../src/modules/pyth/pyth.module";
import { QuotesModule } from "../src/modules/quotes/quotes.module";
import { JupiterService, type Quote } from "../src/modules/quotes/jupiter.service";
import { RecordedMintState } from "./mint-state.fixture";
import { TEST_DATABASE_URL, withEnv } from "./with-env";

/**
 * The HTTP surface, through the real stack: routing, dependency injection,
 * the validation pipe and the controllers.
 *
 * Jupiter is replaced by a stub holding a recorded response, so these are
 * deterministic and offline. Whether the real Jupiter still answers this
 * shape is a different question, asked by the live suite.
 */
const RECORDED_QUOTE: Quote = {
  inputMint: USDC_MINT,
  outputMint: ASSETS.find((a) => a.symbol === "TSLAx")!.mint,
  inAmount: "50000000",
  outAmount: "13685977",
  otherAmountThreshold: "13549118",
  slippageBps: 100,
  priceImpactPct: "0.000159",
  route: ["Whirlpool"],
  raw: {},
};

class StubJupiter {
  calls: unknown[] = [];
  async quote(input: unknown): Promise<Quote> {
    this.calls.push(input);
    return RECORDED_QUOTE;
  }
  sweep(): void {}
}

describe("the relayer HTTP surface", () => {
  // This suite is about a relayer that cannot sign: no key, so /healthz has
  // something to report as missing.
  // The token is pinned empty for the same reason as the key: otherwise this
  // suite reports what the developer's .env happens to hold, and /healthz has
  // nothing to be missing on a machine that is fully configured.
  withEnv({
    RELAYER_SECRET_KEY: "",
    RELAYER_PUBKEY: "",
    PYTH_PRO_TOKEN: "",
    DATABASE_URL: TEST_DATABASE_URL,
  });

  let app: INestApplication;
  let jupiter: StubJupiter;

  beforeAll(async () => {
    jupiter = new StubJupiter();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [appConfig, databaseConfig, solanaConfig, relayerConfig],
        }),
        DatabaseModule,
        HealthModule,
        MarketModule,
        PythModule,
        QuotesModule,
      ],
      controllers: [AppController],
    })
      .overrideProvider(JupiterService)
      .useValue(jupiter)
      // Recorded, not read: five RPC calls would put mainnet on the critical
      // path of an offline suite. The live read is mint-state.live.test.ts.
      .overrideProvider(MintStateService)
      .useClass(RecordedMintState)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("GET /v1/assets", () => {
    it("serves every asset with the fields the vault checks against", async () => {
      const { body } = await request(app.getHttpServer()).get("/v1/assets").expect(200);

      expect(body.quoteMint).toBe(USDC_MINT);
      expect(body.assets).toHaveLength(ASSETS.length);

      for (const asset of body.assets) {
        expect(asset).toMatchObject({
          symbol: expect.any(String),
          mint: expect.any(String),
          decimals: expect.any(Number),
          tokenProgram: expect.any(String),
          pythFeedId: expect.any(Number),
        });
      }
    });

    it("agrees with the shared table the vault derives its accounts from", async () => {
      const { body } = await request(app.getHttpServer()).get("/v1/assets");
      const tesla = body.assets.find((a: { symbol: string }) => a.symbol === "TSLAx");
      expect(tesla.mint).toBe(ASSETS.find((a) => a.symbol === "TSLAx")!.mint);
    });
  });

  describe("GET /v1/quotes", () => {
    const query = {
      in: USDC_MINT,
      out: ASSETS.find((a) => a.symbol === "TSLAx")!.mint,
      amount: "50000000",
    };

    it("returns a quote with both sides named", async () => {
      const { body } = await request(app.getHttpServer()).get("/v1/quotes").query(query).expect(200);

      expect(body.in).toMatchObject({ symbol: "USDC", amount: "50000000" });
      expect(body.out).toMatchObject({ symbol: "TSLAx", amount: "13685977" });
      expect(body.minOutAmount).toBe("13549118");
      expect(body.route).toEqual(["Whirlpool"]);
    });

    it("defaults the slippage to one percent", async () => {
      await request(app.getHttpServer()).get("/v1/quotes").query(query).expect(200);
      expect(jupiter.calls.at(-1)).toMatchObject({ slippageBps: 100 });
    });

    it.each([
      ["a mint that is not base58", { ...query, in: "nope" }],
      ["a missing amount", { in: query.in, out: query.out }],
      ["a zero amount", { ...query, amount: "0" }],
      ["slippage past the cap the vault enforces", { ...query, slippageBps: "500" }],
    ])("rejects %s with 400", async (_label, bad) => {
      await request(app.getHttpServer()).get("/v1/quotes").query(bad).expect(400);
    });
  });

  describe("GET /v1/prices", () => {
    it("names every asset it cannot price, instead of dropping it", async () => {
      // A screen that silently omits an asset shows a catalogue with holes in
      // it. With no token configured, every row should say why.
      const { body } = await request(app.getHttpServer()).get("/v1/prices").expect(200);

      expect(body.prices).toHaveLength(ASSETS.length);
      for (const price of body.prices) {
        expect(price.session).toBe("closed");
        expect(price.unavailable, `${price.symbol} must say why`).toBe("no price stream");
      }
      expect(body.verifiedBy).toMatch(/offline/);
    });

    it("answers only for the symbols asked about", async () => {
      const { body } = await request(app.getHttpServer())
        .get("/v1/prices")
        .query({ symbols: "TSLAx" })
        .expect(200);

      expect(body.prices).toHaveLength(1);
      expect(body.prices[0].symbol).toBe("TSLAx");
    });
  });

  describe("GET /healthz", () => {
    it("names what is missing instead of answering ok", async () => {
      const { body } = await request(app.getHttpServer()).get("/healthz").expect(200);

      expect(body.status).toBe("degraded");
      expect(body.relayerKey).toBe("missing");
      expect(body.missing).toEqual(
        expect.arrayContaining([
          expect.stringContaining("relayer key"),
          expect.stringContaining("pyth token"),
        ]),
      );
    });
  });

  describe("GET /", () => {
    it("identifies the service and points at its health", async () => {
      const { body } = await request(app.getHttpServer()).get("/").expect(200);
      expect(body.service).toBe("pixstock-relayer");
      expect(body.health).toBe("/healthz");
    });
  });
});
