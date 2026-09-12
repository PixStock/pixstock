import { registerAs } from '@nestjs/config';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') ?? [],
  /** Shown on the vault's order ticket. Never trusted by it. */
  dapp: process.env.DAPP_ORIGIN ?? 'app.pixstock.xyz',
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
}));

export const solanaConfig = registerAs('solana', () => ({
  cluster: (process.env.SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta',
  // Helius on both clusters — the public endpoint is too rate limited to
  // build transactions against.
  rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
}));

/**
 * The relayer's public key.
 *
 * Derived from the hot secret when there is one; otherwise RELAYER_PUBKEY may
 * be set on its own, which is enough to build and measure orders without the
 * power to sign them. Returning an empty string rather than a placeholder is
 * deliberate: an order built for a fee payer nobody controls is one the vault
 * would sign and nobody could broadcast.
 */
function derivePublicKey(): string {
  const secret = process.env.RELAYER_SECRET_KEY;
  if (!secret) return process.env.RELAYER_PUBKEY ?? '';
  try {
    const bytes = Uint8Array.from(JSON.parse(secret) as number[]);
    return base58.encode(ed25519.getPublicKey(bytes.slice(0, 32)));
  } catch {
    return process.env.RELAYER_PUBKEY ?? '';
  }
}

export const relayerConfig = registerAs('relayer', () => ({
  // Hot key: fee payer and nonce authority only. It never signs a token
  // transfer and never holds a user key. Cap the balance at 0.3 SOL.
  secretKey: process.env.RELAYER_SECRET_KEY ?? '',
  publicKey: derivePublicKey(),
  maxComputeUnitPrice: parseInt(process.env.MAX_CU_PRICE_MICROLAMPORTS ?? '1000000', 10),
  noncePoolSize: parseInt(process.env.NONCE_POOL_SIZE ?? '10', 10),
  jupiterApiUrl: process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag/swap/v1',
  jupiterApiKey: process.env.JUPITER_API_KEY ?? '',
  pythProToken: process.env.PYTH_PRO_TOKEN ?? '',
  pythRouterUrls: process.env.PYTH_ROUTER_URLS?.split(',') ?? [],
  maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS ?? '100', 10),
  maxRentLamports: parseInt(process.env.MAX_RENT_LAMPORTS ?? '10000000', 10),
}));
