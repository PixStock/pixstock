/**
 * Reads the trusted signers Pyth publishes on chain.
 *
 * The vault verifies a signed price with no network, so the set of keys it
 * will accept has to travel with the build. That set is not ours to invent:
 * Pyth keeps it in the `Storage` account of its Solana contract, each key
 * with an expiry. This reads that account so the constants in
 * `packages/pyth-verify/src/signers.ts` can be checked against the chain by
 * anyone, at any time, rather than taken on trust.
 *
 *   node scripts/read-pyth-signers.mjs [rpcUrl]
 *
 * Read-only: it fetches one account and prints it.
 */
import { Connection, PublicKey } from "@solana/web3.js";

/** Pyth Lazer (Pyth Pro) on Solana mainnet. */
const PROGRAM = new PublicKey("pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt");

const rpc = process.argv[2] ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

const [storage] = PublicKey.findProgramAddressSync([Buffer.from("storage")], PROGRAM);

const account = await new Connection(rpc, "confirmed").getAccountInfo(storage);
if (!account) {
  console.error(`No Storage account at ${storage.toBase58()} — is ${rpc} a mainnet endpoint?`);
  process.exit(1);
}

// Anchor discriminator (8), top_authority (32), treasury (32),
// single_update_fee_in_lamports (8), num_trusted_signers (1), then that many
// { pubkey (32), expires_at: i64 } records.
const data = account.data;
let offset = 8;
const readPubkey = () => {
  const key = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  return key.toBase58();
};

const topAuthority = readPubkey();
const treasury = readPubkey();
const feeLamports = data.readBigUInt64LE(offset);
offset += 8;
const count = data.readUInt8(offset);
offset += 1;

const signers = [];
for (let i = 0; i < count; i++) {
  const pubkey = readPubkey();
  const expiresAt = data.readBigInt64LE(offset);
  offset += 8;
  signers.push({ pubkey, expiresAt: Number(expiresAt) });
}

console.log(
  JSON.stringify(
    {
      readAt: new Date().toISOString(),
      program: PROGRAM.toBase58(),
      storage: storage.toBase58(),
      topAuthority,
      treasury,
      singleUpdateFeeLamports: feeLamports.toString(),
      signers: signers.map((signer) => ({
        ...signer,
        expiresAtIso: new Date(signer.expiresAt * 1000).toISOString(),
      })),
    },
    null,
    2,
  ),
);
