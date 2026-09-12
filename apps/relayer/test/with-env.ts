import { afterAll, beforeAll } from "vitest";

/**
 * Pins the environment a test runs against.
 *
 * Prisma loads `.env` when it is imported, which puts every variable in there
 * — including a developer's real relayer key — into `process.env`. Without
 * this, a suite passes or fails depending on whose machine it runs on, and
 * the failure looks like a code bug.
 */
/**
 * Where integration tests write.
 *
 * A separate database, because these suites truncate tables between tests and
 * the development one holds orders somebody is in the middle of signing.
 * Running the suite must never cost someone their work.
 *
 * Create it once:
 *   createdb pixstock_test
 *   DATABASE_URL=... npx prisma migrate deploy --schema apps/relayer/prisma/schema.prisma
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${process.env.USER ?? "postgres"}@localhost/pixstock_test?host=/var/run/postgresql`;

export function withEnv(values: Record<string, string>) {
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(values)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}
