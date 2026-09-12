import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VERIFIER_IMPLEMENTED } from '@pixstock/pyth-verify';
import { DatabaseService } from '../../database/database.service';

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
  ) {}

  @Get('healthz')
  async health() {
    const database = await this.db
      .$queryRaw`SELECT 1`
      .then(() => 'up' as const)
      .catch(() => 'down' as const);

    const relayerKey = this.config.get<string>('relayer.secretKey') ? 'set' : 'missing';
    const pythToken = this.config.get<string>('relayer.pythProToken') ? 'set' : 'missing';

    const missing = [
      database === 'down' && 'database',
      relayerKey === 'missing' && 'relayer key: cannot co-sign or broadcast',
      pythToken === 'missing' && 'pyth token: prices cannot be attested',
      !VERIFIER_IMPLEMENTED && 'pyth verifier: an attestation cannot be checked',
    ].filter(Boolean);

    return {
      status: missing.length === 0 ? 'ok' : 'degraded',
      cluster: this.config.get<string>('solana.cluster'),
      database,
      relayerKey,
      pythToken,
      missing,
    };
  }
}
