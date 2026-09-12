import { afterAll, beforeAll } from "vitest";

/**
 * Pins the environment a test runs against.
 *
 * Prisma loads `.env` when it is imported, which puts every variable in there
 * — including a developer's real relayer key — into `process.env`. Without
 * this, a suite passes or fails depending on whose machine it runs on, and
 * the failure looks like a code bug.
 */
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
