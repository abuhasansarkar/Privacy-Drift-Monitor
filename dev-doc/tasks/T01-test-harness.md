# T01 — Test harness (vitest) ফেরানো

**Priority:** P0 · **Status:** DONE

## সমস্যা

Commit `2a192cf` 105টা test file (18,380 line) আর `vitest.config.ts` মুছেছে।
vitest install-ও করা নেই। 82k line code-এ **কোনো regression net নেই**।

## ফাঁদ (আগে একবার কামড়েছে)

`server-only` package vitest-এ **throw করে** — bundler ছাড়া সেটা client entry-তে
resolve হয়, যার কাজই throw করা। `test/server-only-stub.ts` এখনও আছে; পুরোনো
`vitest.config.ts` এটাকে alias করত। Config ফেরানোর সময় ওই alias বাদ দিলে
`src/server/**`-এর প্রতিটা test boot-এই ভাঙবে।

`test/global-setup.ts`-ও এখনও আছে — DB-backed suite-এর জন্য।

## Acceptance

1. `npm test` চলে এবং অন্তত একটা test pass করে।
2. `src/server/**` থেকে একটা module import করা test boot করে (server-only alias কাজ করছে)।
3. `npm run verify`-তে `test` আবার যুক্ত।
4. `.github/workflows/pr.yml`-এ test step ফিরেছে।

## ধাপ

1. `npm i -D vitest @vitest/coverage-v8 -w` (root devDependency)।
2. `vitest.config.ts` লেখা — `alias: { "server-only": "./test/server-only-stub.ts" }`,
   `globalSetup: "./test/global-setup.ts"`, environment `node`।
3. `package.json`-এ `"test"`, `"test:coverage"` script।
4. `verify` chain-এ যোগ।
5. `package-lock.json` commit (CI `npm ci` চালায়)。

## Evidence — 2026-09-09

1. ✅ `npm test` → **6 files / 180 tests passed** (`npx vitest run` আউটপুট নিচে)।
   `Test Files 6 passed (6) · Tests 180 passed (180)`.
2. ✅ `vitest.config.ts` `2a192cf^` থেকে হুবহু restore করা হয়েছে — `server-only`
   alias, `globalSetup`, টেস্ট DB override (`DATABASE_URL` → `drift_monitor_test`,
   dev DB অস্পৃশ্য), coverage thresholds (scanner/billing 85%) সহ। Tenancy test
   (integration, আসল Postgres-এ) এই config দিয়েই চলে: 19/19 passed।
3. ✅ `package.json`: `test`, `test:watch`, `test:coverage` scripts ফিরেছে; `verify`
   এখন `... check:env && npm run test && npm run build` — অর্থাৎ টেস্ট আবার gate।
4. ✅ `.github/workflows/pr.yml`-এ "Tests" step যুক্ত হয়েছে (Postgres+Redis
   service সহ verify job-এ, migration check-এর আগে)।
5. ✅ vitest@3.2.7 + @vitest/coverage-v8 + vite-tsconfig-paths + dotenv root
   devDependency-তে install হয়েছে; `package-lock.json` আপডেট হয়েছে (commit
   করতে হবে — CI `npm ci` lockfile drift হলে fail করে)।
