import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { NoncesService } from '../modules/nonces/nonces.service';
import { RelayerService } from '../modules/relayer/relayer.service';

/**
 * Creates the durable nonce pool. Spends real SOL.
 *
 * A command, not a startup step: an order without a durable nonce dies with
 * its blockhash after about ninety seconds, which is enough to demo and tight
 * to film, and the fix costs rent per account. Something that spends money is
 * something a person runs on purpose.
 *
 *   npm run nonces:status  -w @pixstock/relayer
 *   npm run nonces:create  -w @pixstock/relayer -- 3
 *   npm run nonces:release -w @pixstock/relayer -- 30
 *
 * Inside a deployed container there is no workspace root, so the same three
 * are `node apps/relayer/dist/cli/nonce-pool.js <command> <n>`.
 *
 * `create` refuses unless RELAYER_ALLOW_BROADCAST is true, for the same
 * reason broadcasting does: it spends real SOL. `status` and `release` spend
 * nothing — release only clears the in-use flag on rows whose order can never
 * use them — so neither is gated.
 */
async function main() {
  const logger = new Logger('NoncePool');
  const [, , command = 'status', countArg] = process.argv;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const nonces = app.get(NoncesService);
    const relayer = app.get(RelayerService);

    const pool = await nonces.status();
    const balance = await relayer.balance();

    logger.log(`Relayer ${relayer.publicKey ?? 'none'}`);
    logger.log(
      `Balance ${balance === null ? 'unknown' : `${(balance / 1e9).toFixed(4)} SOL`} · ` +
        `pool ${pool.length} account(s), ${pool.filter((n) => !n.inUse).length} free`,
    );
    for (const nonce of pool) {
      logger.log(
        `  ${nonce.pubkey} ${nonce.inUse ? 'in use' : 'free'}` +
          `${nonce.onChain ? '' : ' — NOT FOUND ON CHAIN'}`,
      );
    }

    if (command === 'release') {
      // Minutes, because the unit someone types at a terminal at midnight is
      // minutes. Thirty is long enough that a scan in progress is never
      // touched, short enough to rescue a filming session.
      const minutes = Number(countArg ?? 30);
      if (!Number.isFinite(minutes) || minutes < 0) {
        logger.error('Pass an age in minutes: nonces:release -- 30');
        process.exitCode = 1;
        return;
      }

      const freed = await nonces.releaseAbandoned(minutes * 60_000);
      if (freed.length === 0) {
        logger.log(`Nothing to free: no nonce is held by an order older than ${minutes} min.`);
        return;
      }
      logger.log(`Freed ${freed.length}:`);
      for (const one of freed) logger.log(`  ${one.pubkey} — ${one.reason}`);
      return;
    }

    if (command !== 'create') {
      if (command !== 'status') logger.warn(`Unknown command "${command}". Showing status.`);
      return;
    }

    const count = Number(countArg ?? 0);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      logger.error('Pass how many to create, 1 to 20: npm run nonces:create -- 3');
      process.exitCode = 1;
      return;
    }

    // Said out loud before it happens, with the real number rather than the
    // 0.0015 SOL everyone quotes from memory.
    const rent = await nonces.rentPerAccount().catch(() => null);

    logger.warn(
      `About to create ${count} nonce account(s)` +
        (rent === null
          ? ''
          : `, costing about ${((rent * count) / 1e9).toFixed(4)} SOL of rent plus fees`) +
        '. This spends real SOL and cannot be undone.',
    );

    const created = await nonces.create(count);
    logger.log(`Created ${created.length}:`);
    for (const pubkey of created) logger.log(`  ${pubkey}`);
  } catch (err) {
    logger.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
