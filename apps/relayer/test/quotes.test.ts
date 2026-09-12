import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { USDC_MINT, symbolOfMint } from "@pixstock/shared";
import { GetQuoteDto } from "../src/modules/quotes/dto/get-quote.dto";
import { toQuote } from "../src/modules/quotes/jupiter.service";

/** A real Jupiter response, trimmed to the fields the relayer reads. */
const JUPITER_RESPONSE = {
  inputMint: USDC_MINT,
  inAmount: "50000000",
  outputMint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  outAmount: "13685977",
  otherAmountThreshold: "13549118",
  swapMode: "ExactIn",
  slippageBps: 100,
  priceImpactPct: "0.0001591643760897545328237783",
  routePlan: [{ swapInfo: { label: "Whirlpool" } }],
};

const validate = (query: Record<string, unknown>) => {
  const dto = plainToInstance(GetQuoteDto, query);
  return { dto, errors: validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {})) };
};

describe("reading a Jupiter quote", () => {
  it("keeps the amounts as strings — they are u64", () => {
    const quote = toQuote(JUPITER_RESPONSE);
    expect(quote.inAmount).toBe("50000000");
    expect(quote.outAmount).toBe("13685977");
    expect(quote.otherAmountThreshold).toBe("13549118");
  });

  it("names the route", () => {
    expect(toQuote(JUPITER_RESPONSE).route).toEqual(["Whirlpool"]);
  });

  it("survives a response with no route plan", () => {
    expect(toQuote({ ...JUPITER_RESPONSE, routePlan: undefined }).route).toEqual([]);
  });

  it("labels an unnamed hop rather than dropping it", () => {
    const quote = toQuote({ ...JUPITER_RESPONSE, routePlan: [{ swapInfo: {} }] });
    expect(quote.route).toEqual(["unknown"]);
  });
});

describe("query validation", () => {
  const valid = {
    in: USDC_MINT,
    out: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    amount: "50000000",
  };

  it("accepts a well-formed query and defaults the slippage", () => {
    const { dto, errors } = validate(valid);
    expect(errors).toEqual([]);
    expect(dto.slippageBps).toBe(100);
    expect(dto.onlyDirectRoutes).toBe(false);
  });

  it.each([
    ["a mint that is not base58", { ...valid, in: "not-a-mint" }],
    ["a zero amount", { ...valid, amount: "0" }],
    ["a fractional amount", { ...valid, amount: "1.5" }],
    ["a negative amount", { ...valid, amount: "-1" }],
  ])("rejects %s", (_label, query) => {
    expect(validate(query).errors.length).toBeGreaterThan(0);
  });

  it("refuses slippage past the cap the vault enforces", () => {
    // Anything wider only produces an order the vault will reject, so it is
    // refused here rather than quoted and thrown away later.
    expect(validate({ ...valid, slippageBps: "301" }).errors.length).toBeGreaterThan(0);
    expect(validate({ ...valid, slippageBps: "300" }).errors).toEqual([]);
  });
});

describe("naming mints", () => {
  it("names USDC, which is not in the asset list", () => {
    expect(symbolOfMint(USDC_MINT)).toBe("USDC");
  });

  it("names an xStock", () => {
    expect(symbolOfMint("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB")).toBe("TSLAx");
  });

  it("abbreviates an unknown mint rather than showing it whole", () => {
    expect(symbolOfMint("11111111111111111111111111111111")).toBe("1111…1111");
  });
});
