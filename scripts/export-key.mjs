/**
 * Turns a vault back into a key Phantom, Solflare or the Solana CLI will take.
 *
 * Accepts either half of the backup story: the Paper-Vault code, or the raw
 * blob out of the phone's localStorage — because the Paper-Vault is shown
 * once, at creation, and nothing in the app shows it again.
 *
 *   node export-key.mjs
 *
 * Run it offline. It does no network I/O, and it reads the blob and the
 * password from stdin rather than arguments, so neither lands in your shell
 * history or in the process list.
 *
 * What it prints is the account itself. Anyone holding it can move
 * everything, with no password and no second step.
 */
import { createInterface } from "node:readline/promises";
import { decodePaperVault, deserializeBlob, unlock, wipe, PAPER_VAULT_MAGIC } from "@pixstock/vault-crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

const rl = createInterface({ input: process.stdin, output: process.stderr });
console.error(
  "Paste either a Paper-Vault code, or the value of localStorage['pixstock.vault.v1']\n" +
  "from the vault's browser (devtools → Application → Local Storage).\n"
);
const input = (await rl.question("Vault  : ")).trim();
const password = await rl.question("Password : ");
rl.close();

const blob = input.startsWith(PAPER_VAULT_MAGIC)
  ? decodePaperVault(input)
  : deserializeBlob(Uint8Array.from(Buffer.from(input, "base64")));

const seed = await unlock(blob, password);
try {
  const publicKey = ed25519.getPublicKey(seed);

  // Solana's "private key" is the 64-byte secret key: the seed followed by
  // the public key. The vault stores only the 32-byte seed, because that is
  // all Ed25519 signing needs and the rest is derivable from it.
  const secretKey = new Uint8Array(64);
  secretKey.set(seed, 0);
  secretKey.set(publicKey, 32);

  console.log(`\naddress     ${base58.encode(publicKey)}`);
  console.log(`\nPhantom → Add account → Import private key:\n`);
  console.log(base58.encode(secretKey));
  console.log(`\nsolana-keygen / CLI, as a JSON array:\n`);
  console.log(`[${Array.from(secretKey).join(",")}]`);
  console.log(`\nThis is the account. Clear this scrollback when you are done.`);
} finally {
  wipe(seed);
}
