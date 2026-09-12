/**
 * Captures a complete order, exactly as the relayer builds it, as a fixture
 * for the offline end-to-end test.
 *
 * Recording a real order is what keeps that test honest: a hand-built message
 * only proves the decoder agrees with itself, and the lookup-table bug was
 * invisible to every such test.
 *
 * Run: npm run build -w @pixstock/relayer && node scripts/capture-order-fixture.mjs
 */
import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { ASSETS, USDC_MINT } from '@pixstock/shared';
import { DEFAULT_KDF, lock, serializeBlob } from '@pixstock/vault-crypto';
import jupiterPkg from '../apps/relayer/dist/modules/quotes/jupiter.service.js';
import builderPkg from '../apps/relayer/dist/modules/tx-builder/tx-builder.service.js';
import solanaPkg from '../apps/relayer/dist/modules/solana/solana.service.js';

const { JupiterService } = jupiterPkg;
const { TxBuilderService } = builderPkg;
const { SolanaService } = solanaPkg;

const config = new ConfigService({
  relayer: {
    jupiterApiUrl: process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag/swap/v1',
    jupiterApiKey: process.env.JUPITER_API_KEY ?? '',
  },
  solana: { rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com' },
});
const builder = new TxBuilderService(new JupiterService(config), new SolanaService(config));

// A seed, not just a public key: the end-to-end test has to actually sign.
const vaultSeed = crypto.getRandomValues(new Uint8Array(32));
const vault = base58.encode(ed25519.getPublicKey(vaultSeed));
const feePayer = base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));

const mint = (symbol) => ASSETS.find((a) => a.symbol === symbol).mint;
const legs = [
  { inMint: USDC_MINT, outMint: mint('AAPLx'), inAmount: '200000000' },
  { inMint: USDC_MINT, outMint: mint('NVDAx'), inAmount: '150000000' },
  { inMint: USDC_MINT, outMint: mint('MSFTx'), inAmount: '150000000' },
];

const built = await builder.build({ vault, feePayer, legs, slippageBps: 100 });

/**
 * The vault already encrypted, the way the browser stores it.
 *
 * The system tests run under Playwright, which compiles to CommonJS and
 * cannot load the ESM package chain. Locking here means those tests read a
 * string and need no crypto of their own.
 */
const TEST_PASSWORD = 'correct horse battery staple';
const blob = await lock(vaultSeed, TEST_PASSWORD, { ...DEFAULT_KDF, iterations: 1, memoryKiB: 1024 });

const fixture = {
  capturedAt: new Date().toISOString(),
  note:
    'A three-leg Tech Giant Index basket, built by the relayer against live mainnet routes. ' +
    'The vault seed is a throwaway with no funds; it exists so the test can sign for real.',
  vault,
  vaultSeed: Buffer.from(vaultSeed).toString('base64'),
  testPassword: TEST_PASSWORD,
  storedBlob: Buffer.from(serializeBlob(blob)).toString('base64'),
  feePayer,
  kind: built.kind,
  sizes: built.sizes,
  expiry: built.expiry,
  messages: built.messages.map((m) => Buffer.from(m).toString('base64')),
  legs: built.legs,
};

writeFileSync(
  new URL('../packages/tx-policy/test/fixtures/basket-order.json', import.meta.url),
  JSON.stringify(fixture, null, 2) + '\n',
);

console.log(`captured a ${built.legs.length}-leg basket · ${built.sizes.join(' + ')} bytes · ${built.messages.length} tx`);
