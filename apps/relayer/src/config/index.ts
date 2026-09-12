import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') ?? [],
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

export const relayerConfig = registerAs('relayer', () => ({
  // Hot key: fee payer and nonce authority only. It never signs a token
  // transfer and never holds a user key. Cap the balance at 0.3 SOL.
  secretKey: process.env.RELAYER_SECRET_KEY ?? '',
  noncePoolSize: parseInt(process.env.NONCE_POOL_SIZE ?? '10', 10),
  jupiterApiUrl: process.env.JUPITER_API_URL ?? 'https://lite-api.jup.ag/swap/v1',
  jupiterApiKey: process.env.JUPITER_API_KEY ?? '',
  pythProToken: process.env.PYTH_PRO_TOKEN ?? '',
  pythRouterUrls: process.env.PYTH_ROUTER_URLS?.split(',') ?? [],
  maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS ?? '100', 10),
  maxRentLamports: parseInt(process.env.MAX_RENT_LAMPORTS ?? '10000000', 10),
}));
