import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

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
    include: [
      "src/**/*.{test,spec}.ts",
      "packages/*/src/**/*.{test,spec}.ts",
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
