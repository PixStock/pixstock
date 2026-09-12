/**
 * Measures the real size of the transactions the relayer builds.
 *
 * Answers the question the whole optical channel is sized around: does a
 * multi-leg basket fit in one Solana transaction, and how many QR frames does
 * the resulting order take. Quotes come from Jupiter live; no key, no funds
 * and no broadcast are involved.
 *
 * Run: npm run build -w @pixstock/relayer && node scripts/measure-tx-size.mjs
 */
import { ConfigService } from '@nestjs/config';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { ASSETS, USDC_MINT, decimalsOfMint, symbolOfMint } from '@pixstock/shared';
import { encodeFrames, encodePayload, newSessionId, CHUNK_SIZES } from '@pixstock/agqp';
import { decompile, feePayerOf, parseTransaction, decodeMessage } from '@pixstock/tx-policy';
import pkg from '../apps/relayer/dist/modules/quotes/jupiter.service.js';
import builderPkg from '../apps/relayer/dist/modules/tx-builder/tx-builder.service.js';
import solanaPkg from '../apps/relayer/dist/modules/solana/solana.service.js';

const { JupiterService } = pkg;
const { TxBuilderService, MAX_TRANSACTION_BYTES } = builderPkg;
const { SolanaService } = solanaPkg;

const config = new ConfigService({
  relayer: {
    jupiterApiUrl: process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag/swap/v1',
    jupiterApiKey: process.env.JUPITER_API_KEY ?? '',
  },
  solana: {
    // Lookup tables are mainnet objects, so they are read from mainnet even
    // when the rest of the flow runs on devnet.
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  },
});
const builder = new TxBuilderService(new JupiterService(config), new SolanaService(config));

const throwaway = () => base58.encode(ed25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32))));
const vault = throwaway();
const feePayer = throwaway();
const mint = (symbol) => ASSETS.find((a) => a.symbol === symbol).mint;
const leg = (symbol, usdc) => ({ inMint: USDC_MINT, outMint: mint(symbol), inAmount: String(usdc * 1e6) });

const CASES = [
  ['single swap', [leg('TSLAx', 10)]],
  ['2-leg basket', [leg('AAPLx', 250), leg('NVDAx', 250)]],
  ['3-leg basket (Tech Giant Index)', [leg('AAPLx', 200), leg('NVDAx', 150), leg('MSFTx', 150)]],
  ['4-leg basket', [leg('AAPLx', 125), leg('NVDAx', 125), leg('MSFTx', 125), leg('TSLAx', 125)]],
];

console.log(`vault    ${vault}`);
console.log(`payer    ${feePayer}`);
console.log('');
console.log('cold = the vault has no token accounts yet, so each leg creates one');
console.log('warm = they already exist, which is the state after the first order');
console.log('');

for (const [label, legs] of CASES) {
  for (const warm of [false, true]) {
  try {
    const built = await builder.build({
      vault, feePayer, legs, slippageBps: 100,
      assumeTokenAccountsExist: warm,
    });

    // Cross-check with the decoder the vault uses, not our own assumptions.
    const message = decodeMessage(built.messages[0]);
    const kinds = decompile(message).map((ix) => ix.kind);
    const payerIsRelayer = feePayerOf(message) === feePayer;

    // And what it costs on the optical channel.
    const payload = encodePayload({
      kind: 'SIGN',
      sid: newSessionId(),
      vault,
      txs: built.messages,
      manifest: {
        kind: built.kind,
        legs: built.legs.map((l) => ({
          inMint: l.inMint,
          outMint: l.outMint,
          inAmount: l.inAmount,
          expectedOutAmount: l.expectedOutAmount,
          minOutAmount: l.minOutAmount,
        })),
        slippageBps: 100,
        feePayer,
        dapp: 'app.pixstock.xyz',
        quotedAt: Math.floor(Date.now() / 1000),
      },
      price: new Uint8Array(legs.length === 1 ? 145 : 205),
    });
    const frames = encodeFrames(payload, { sid: newSessionId() });

    const fits = built.sizes.every((s) => s <= MAX_TRANSACTION_BYTES);
    console.log(
      `${label.padEnd(28)} ${(warm ? 'warm' : 'cold').padEnd(5)} ${built.messages.length} tx · ${built.sizes.join(' + ')} B ${fits ? 'ok ' : 'OVER'}` +
        ` · payload ${payload.length} B · ${frames.length} frames`,
    );
    if (!warm) {
      console.log(`   fee payer is the relayer: ${payerIsRelayer} · instructions: ${kinds.join(', ')}`);
    }
  } catch (err) {
    console.log(`${label.padEnd(28)} ${(warm ? 'warm' : 'cold').padEnd(5)} FAILED: ${err.message}`);
  }
  }
  console.log('');
}
