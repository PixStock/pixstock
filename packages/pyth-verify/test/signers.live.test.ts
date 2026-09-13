import { describe, expect, it } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { PYTH_PROGRAM, PYTH_STORAGE, TRUSTED_SIGNERS } from "../src/index.js";

/**
 * Against the chain: are the keys compiled into this build still the keys
 * Pyth publishes?
 *
 * The vault carries its trusted signers because it has no network. That makes
 * them a snapshot, and a snapshot goes stale — Pyth rotates keys, and a
 * rotation this build has not seen turns every price into "signed by an
 * unknown key". Safe, and useless. This is the test that says so out loud,
 * before a phone does.
 */
const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

describe("the trusted signers, against the chain", () => {
  it("still matches Pyth's Storage account", async () => {
    const program = new PublicKey(PYTH_PROGRAM);
    const [storage] = PublicKey.findProgramAddressSync([Buffer.from("storage")], program);
    expect(storage.toBase58()).toBe(PYTH_STORAGE);

    const account = await new Connection(rpc, "confirmed").getAccountInfo(storage);
    expect(account, `no Storage account at ${PYTH_STORAGE} via ${rpc}`).not.toBeNull();
    if (!account) return;

    // Anchor discriminator, top_authority, treasury, fee, count, then
    // { pubkey, expires_at } records.
    const data = account.data;
    const count = data.readUInt8(8 + 32 + 32 + 8);
    let offset = 8 + 32 + 32 + 8 + 1;

    const published: Array<{ address: string; expiresAt: number }> = [];
    for (let i = 0; i < count; i++) {
      published.push({
        address: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
        expiresAt: Number(data.readBigInt64LE(offset + 32)),
      });
      offset += 40;
    }

    // Every key Pyth currently publishes must be one this build accepts.
    // The reverse is allowed: keeping a key Pyth has dropped is harmless
    // while its own expiry still holds, and dropping it early would refuse
    // messages that are still in flight.
    for (const signer of published) {
      const known = TRUSTED_SIGNERS.find((trusted) => trusted.address === signer.address);
      expect(
        known,
        `Pyth publishes ${signer.address}, which this build does not trust. ` +
          "Run: node scripts/read-pyth-signers.mjs",
      ).toBeDefined();
      expect(known!.expiresAt).toBe(signer.expiresAt);
    }
  });
});
