import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { testDatabaseUrl } from "./test/global-setup";

/*
 * ⚠️ THE TEST SUITE GETS ITS OWN DATABASE, AND THIS IS THE LINE THAT ENFORCES IT.
 *
 * `resetDatabase()` TRUNCATEs every non-reference table. Pointed at the dev
 * database — which it was, for five phases — that means `npm test` silently
 * destroys whatever `npm run db:seed:demo` just created, and every page then
 * renders a correct-looking empty state. It cost a debugging session to work
 * out that an empty `/app/drift` was an empty table, not a broken query.
 *
 * `.env` is loaded here explicitly because vitest does not put it on
 * `process.env` — only Prisma does, lazily, when the client is constructed. So
 * without this the derivation below has nothing to derive from.
 *
 * ⚠️ AND IT MUST BE SET IN `test.env` BELOW, not in `globalSetup`. globalSetup
 * runs in its own process and its `process.env` writes never reach the workers.
 */
loadEnv({ quiet: true });
const DEV_DATABASE_URL = process.env.DATABASE_URL;

/**
 * Test configuration — PLAN.md Part XII §12.2.
 *
 * Two suites live here:
 *   - unit         : pure functions, no I/O. Fast, run on every save.
 *   - integration  : repositories, tenancy, jobs. Need Postgres + Redis + MinIO
 *                    from docker-compose. `tenancy.test.ts` is one of these.
 *
 * Integration tests are NOT mocked against a fake database. Tenant isolation
 * asserted against a mock proves nothing — it must run against real Postgres.
 *
 * Run `docker compose up -d` before `npm test`, or the DB-backed suites fail
 * with a connection error rather than a useful message.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    /*
     * ⚠️ `server-only` is a build-time guard, not a runtime one. Outside a
     * bundler it resolves to the CLIENT entry, whose whole job is to throw —
     * so importing any `src/server/**` module in a test failed before a single
     * assertion ran. Stubbing it here keeps the guard doing its real job (Next
     * still enforces it at build time) while letting server modules be tested
     * directly, which is where the portal's security assertions live.
     */
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
  },
  test: {
    globals: false,
    environment: "node",
    /*
     * Creates and migrates the test database before anything runs, and seeds
     * the three reference tables `resetDatabase()` deliberately preserves (and
     * therefore never repopulates).
     */
    globalSetup: ["./test/global-setup.ts"],
    /*
     * ⚠️ Prisma loads `.env` itself when the client is constructed, but dotenv
     * does NOT overwrite a variable that is already set — so putting the test
     * URL here wins, and `drift_monitor` is never opened by a test.
     */
    env: DEV_DATABASE_URL
      ? { DATABASE_URL: testDatabaseUrl(DEV_DATABASE_URL) }
      : {},
    include: [
      "src/**/*.{test,spec}.ts",
      "packages/*/src/**/*.{test,spec}.ts",
      // The worker holds the jobs, and a job is where two correct packages get
      // wired together wrongly — which is exactly the seam the branding
      // entitlement bug lived in.
      "worker/src/**/*.{test,spec}.ts",
    ],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    // Tenancy tests share one database and truncate between suites, so they
    // must not run concurrently with each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // §12.2: hard coverage gate on the two packages where a silent defect is
      // most expensive — one produces false findings, the other wrong charges.
      //
      // ⚠️ A glob that matches no file makes vitest fail the run, so a package
      // is listed only once it exists. `packages/billing` arrives in Phase 6;
      // add its threshold in the same PR that creates the package.
      thresholds: {
        "packages/scanner/src/**": {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
