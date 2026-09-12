import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VersionedTransaction } from "@solana/web3.js";
import { transactionSize, MAX_TRANSACTION_BYTES } from "../src/modules/tx-builder/tx-builder.service";

/** The same real mainnet swap the policy tests read. */
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/tx-policy/test/fixtures/jupiter-swap.json", import.meta.url),
    "utf8"
  )
) as { swapTransaction: string; transactionBytes: number };

const raw = Uint8Array.from(Buffer.from(fixture.swapTransaction, "base64"));

describe("counting a transaction", () => {
  it("agrees with the real serialized length", () => {
    // The counter exists because web3.js refuses to serialize an oversized
    // transaction, so it can say "too big" but never by how much. It is only
    // useful if it agrees with serialization where both work.
    const transaction = VersionedTransaction.deserialize(raw);
    expect(transactionSize(transaction.message)).toBe(raw.length);
    expect(transactionSize(transaction.message)).toBe(fixture.transactionBytes);
  });

  it("counts a transaction that fits", () => {
    const transaction = VersionedTransaction.deserialize(raw);
    expect(transactionSize(transaction.message)).toBeLessThanOrEqual(MAX_TRANSACTION_BYTES);
  });

  it("counts the address lookup table section", () => {
    // The section that was silently empty and cost roughly 350 bytes per swap:
    // without the tables, eleven accounts sat inline at 32 bytes each.
    const transaction = VersionedTransaction.deserialize(raw);
    expect(transaction.message.addressTableLookups.length).toBeGreaterThan(0);

    const withoutTables = {
      ...transaction.message,
      addressTableLookups: [],
    } as typeof transaction.message;

    expect(transactionSize(transaction.message)).toBeGreaterThan(transactionSize(withoutTables));
  });
});
