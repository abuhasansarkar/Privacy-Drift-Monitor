# T05 — `.env` drift: `PORTAL_TOKEN_SECRET` অনুপস্থিত

**Priority:** P1 · **Status:** DONE

## সমস্যা

`.env.example`-এ আছে কিন্তু `.env`-এ **নেই**:

```
ANALYTICS_SALT
PORTAL_TOKEN_SECRET
AI_CACHE_TTL_DAYS
AI_CONCURRENCY
NEXT_PUBLIC_SENTRY_DSN
SENTRY_TRACES_SAMPLE_RATE
```

`PORTAL_TOKEN_SECRET` তিন জায়গায় ব্যবহৃত:

| ফাইল | অনুপস্থিত হলে |
|---|---|
| [impersonation.ts:53](../../src/server/admin/impersonation.ts#L53) | **throw** — admin impersonation একেবারেই কাজ করে না |
| [free-scan.ts:94](../../src/server/services/free-scan.ts#L94) | IP salt `""` — hash কার্যত unsalted |
| [analytics.ts:162](../../packages/shared/src/analytics.ts#L162) | একই |

দুটো fallback **নীরবে দুর্বল** হয়ে যায় (খালি salt), আর একটা throw করে।

## Acceptance

1. `.env.example`-এর প্রতিটা key `.env`-এ আছে কিনা তা একটা script বলতে পারবে।
2. `PORTAL_TOKEN_SECRET` local `.env`-এ সেট।
3. খালি salt আর কখনও নীরবে গ্রহণ করা হবে না — সেট না থাকলে loud warning।

## যা করা হয়েছে

- `.env`-এ অনুপস্থিত key গুলো যোগ (dev-উপযুক্ত মান)।
- `scripts/check-env.ts` — `.env.example` আর `.env` মিলিয়ে দেখে, drift থাকলে
  non-zero exit। `npm run check:env`।
- খালি salt-এ loud warning (`analytics.ts`, `free-scan.ts`)।

## Evidence

- `.env`-এ ৬টা অনুপস্থিত key যোগ (`PORTAL_TOKEN_SECRET` ও `ANALYTICS_SALT`
  `openssl rand` দিয়ে তৈরি)। আগের `.env` backup করা আছে।
- `scripts/check-env.ts` তৈরি, `npm run check:env`, আর `verify` chain-এ যুক্ত।
- `npm run check:env` → `✔ Environment check passed (89 declared, 6 optional)`

**Gate সত্যিই fail করে কিনা তার পরীক্ষা** (এটাই আসল যাচাই) —
`PORTAL_TOKEN_SECRET` ইচ্ছে করে সরিয়ে:

```
✖ PORTAL_TOKEN_SECRET is in .env.example but not in .env
✖ PORTAL_TOKEN_SECRET is present but EMPTY — it must be set
✖ Environment drift: 1 missing, 1 empty.
exit code: 1
```

Script কখনও value পড়ে না, শুধু key — secret CI log-এ যাওয়ার ঝুঁকি নেই।
