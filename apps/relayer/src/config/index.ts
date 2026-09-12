import { Logger } from '@nestjs/common';
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
 * Reads the relayer's hot key, in either shape people actually have one in.
 *
 * `solana-keygen` writes a JSON array of 64 numbers; wallets export the same
 * 64 bytes as base58. A 32-byte value is accepted too — that is the seed
 * alone, which is all Ed25519 needs.
 *
 * Never logged, never returned by any route. Only the public key derived from
 * it leaves this function.
 */
function parseSecretKey(raw: string): Uint8Array | null {
  const value = raw.trim();
  if (!value) return null;

  let bytes: Uint8Array;
  try {
    bytes = value.startsWith('[')
      ? Uint8Array.from(JSON.parse(value) as number[])
      : base58.decode(value);
  } catch {
    return null;
  }

  if (bytes.length !== 32 && bytes.length !== 64) return null;
  return bytes;
}

/**
 * The relayer's public key.
 *
 * Derived from the hot secret when there is one, so the two can never
 * disagree. RELAYER_PUBKEY on its own is enough to build and measure orders
 * without the power to sign them.
 *
 * A secret that cannot be read is reported rather than silently ignored: the
 * whole point of /healthz saying "missing" is that it means missing, not
 * "present but unreadable".
 */
function derivePublicKey(): string {
  const raw = process.env.RELAYER_SECRET_KEY ?? '';
  if (!raw.trim()) return process.env.RELAYER_PUBKEY ?? '';

  const bytes = parseSecretKey(raw);
  if (!bytes) {
    new Logger('RelayerConfig').error(
      'RELAYER_SECRET_KEY is set but unreadable. Expected a JSON array of 64 numbers ' +
        '(as solana-keygen writes) or the same bytes in base58. Falling back to RELAYER_PUBKEY.',
    );
    return process.env.RELAYER_PUBKEY ?? '';
  }

  const seed = bytes.slice(0, 32);
  const derived = base58.encode(ed25519.getPublicKey(seed));

  // A 64-byte key carries its own public half; if the two disagree the file is
  // corrupt, and signing with it would produce signatures nobody can verify.
  if (bytes.length === 64) {
    const embedded = base58.encode(bytes.slice(32));
    if (embedded !== derived) {
      new Logger('RelayerConfig').error(
        'RELAYER_SECRET_KEY is inconsistent: its public half does not match its seed.',
      );
      return '';
    }
  }

  return derived;
}

export const relayerConfig = registerAs('relayer', () => ({
  // Hot key: fee payer and nonce authority only. It never signs a token
  // transfer and never holds a user key. Cap the balance at 0.3 SOL.
  /** Present only when it could actually be read. */
  secretKey: parseSecretKey(process.env.RELAYER_SECRET_KEY ?? '') ? process.env.RELAYER_SECRET_KEY! : '',
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
