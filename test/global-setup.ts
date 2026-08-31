import { execFileSync } from "node:child_process";
import { Client } from "pg";

/**
 * TEST DATABASE ISOLATION.
 *
 * ⚠️ THIS EXISTS BECAUSE THE TEST SUITE SILENTLY DESTROYED DEVELOPMENT DATA.
 *
 * `resetDatabase()` in `packages/database/src/testing/factories.ts` does a
 * `TRUNCATE … CASCADE` over every non-reference table — correct for a test
 * database, catastrophic for the one `npm run dev` is pointed at. Until now they
 * were the same database, so the sequence
 *
 *     npm run db:seed:demo     # twelve weeks of demo history
 *     npm test                 # …silently truncates all of it
 *     npm run dev              # every page renders its empty state
 *
 * looked exactly like a working product with no data in it. It cost a
 * debugging session to notice that the empty state on `/app/drift` was not a
 * query bug but an empty table.
 *
 * The fix is the standard one: tests get their OWN database, created and
 * migrated here, and `DATABASE_URL` is overridden for every test worker in
 * `vitest.config.ts`. `drift_monitor` is now only ever touched by the app.
 *
 * ⚠️ THE OVERRIDE MUST BE IN `vitest.config.ts`, NOT HERE. `globalSetup` runs in
 * its own process; assigning `process.env` in it does not reach the test
 * workers. Setting it in only one of the two places is how you end up with a
 * setup that prepares a test database and a suite that still truncates the dev
 * one.
 */

/** Derives the test database URL from the dev one, changing only the name. */
export function testDatabaseUrl(devUrl: string): string {
  const url = new URL(devUrl);
  // `URL.pathname` is "/drift_monitor"; keep any ?schema= etc. intact.
  const name = url.pathname.replace(/^\//, "");
  url.pathname = `/${name}_test`;
  return url.toString();
}

async function ensureDatabase(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      name,
    ]);
    if (existing.rowCount === 0) {
      // ⚠️ Identifier interpolation, because CREATE DATABASE cannot take a bind
      // parameter. `name` is derived from our own DATABASE_URL, never user
      // input, and is quoted.
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.log(`[test] created database ${name}`);
    }
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error(
      "DATABASE_URL is not set. Tests need Postgres — run `docker compose up -d` " +
        "and make sure .env is loaded.",
    );
  }

  const url = testDatabaseUrl(devUrl);
  const name = new URL(url).pathname.replace(/^\//, "");

  // Connect to `postgres` to issue CREATE DATABASE.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  await ensureDatabase(adminUrl.toString(), name);

  /*
   * `migrate deploy`, not `db push`. The migrations are the schema of record
   * (AGENTS.md), and a test database built by `db push` would drift from the
   * one production runs — so a migration that works in tests could still fail
   * on deploy, which is the one thing the migration check exists to catch.
   */
  execFileSync(
    "npx",
    ["prisma", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" },
  );

  /*
   * The reference tables. `resetDatabase()` deliberately preserves
   * `tracker_vendors`, `plans` and `feature_flags` between tests, which means
   * it never repopulates them either — so they have to exist before the first
   * test runs. The classifier tests are the ones that notice: with no vendors,
   * every third party reads "unknown" and the assertions fail for a reason that
   * looks nothing like a missing seed.
   */
  execFileSync("npx", ["tsx", "packages/database/prisma/seed.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  console.log(`[test] using ${name} (dev data in ${new URL(devUrl).pathname.slice(1)} is untouched)`);
}
