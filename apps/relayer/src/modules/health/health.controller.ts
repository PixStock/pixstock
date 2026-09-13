import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SIGNERS_READ_AT, TRUSTED_SIGNERS } from '@pixstock/pyth-verify';
import { DatabaseService } from '../../database/database.service';
import { NoncesService } from '../nonces/nonces.service';

/**
 * `GET /healthz` — what works, and what does not.
 *
 * It reports the missing pieces by name rather than a bare "ok", because
 * during a build week the useful question is not whether the process is up
 * but which capability is still absent.
 */
@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly nonces: NoncesService,
  ) {}

  @Get('healthz')
  async health() {
    const database = await this.db
      .$queryRaw`SELECT 1`
      .then(() => 'up' as const)
      .catch(() => 'down' as const);

    const relayerKey = this.config.get<string>('relayer.secretKey') ? 'set' : 'missing';
    const noncePool = await this.db.nonceAccount
      .count({ where: { inUse: false } })
      .catch(() => 0);
    const relayerPublicKey = this.config.get<string>('relayer.publicKey') || null;
    const pythToken = this.config.get<string>('relayer.pythProToken') ? 'set' : 'missing';

    // The vault carries Pyth's signing keys because it has no network, which
    // makes them a snapshot. An expired one refuses every price, so it is
    // reported here rather than discovered on a phone.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiredSigners = TRUSTED_SIGNERS.filter(
      (signer) => signer.expiresAt <= nowSeconds,
    ).map((signer) => signer.address);

    const missing = [
      database === 'down' && 'database',
      relayerKey === 'missing' && 'relayer key: cannot co-sign or broadcast',
      !this.config.get<string>('relayer.publicKey') && 'relayer public key: cannot build orders',
      pythToken === 'missing' && 'pyth token: prices cannot be attested',
      expiredSigners.length > 0 &&
        `pyth signers expired: ${expiredSigners.join(', ')} — rebuild against the chain`,
      noncePool === 0 &&
        'no durable nonce: orders expire with their blockhash, in about ninety seconds',
    ].filter(Boolean);

    return {
      status: missing.length === 0 ? 'ok' : 'degraded',
      cluster: this.config.get<string>('solana.cluster'),
      database,
      relayerKey,
      relayerPublicKey,
      pythToken,
      pythSigners: { count: TRUSTED_SIGNERS.length, readAt: SIGNERS_READ_AT },
      noncePool,
      broadcast: this.config.get<boolean>('relayer.allowBroadcast') ? 'enabled' : 'disabled',
      missing,
    };
  }
}
