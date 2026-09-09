# T10 — Public API v1-এ rate limit নেই

**Priority:** P1 · **Status:** DONE

## সমস্যা

`src/app/api/v1/**`-এ ৬টা endpoint live। প্রতিটাতে আছে:

- ✅ API key auth (`pdm_live_`, SHA-256 hashed)
- ✅ Scope check (`requireApiScope(auth, "read" | "write" | "admin")`)
- ✅ Pagination (`limit` clamp 1–100)
- ❌ **Rate limit — কিছুই নেই**

`POST /api/v1/websites/[id]/scans` একটা scan enqueue করে। Rate limit ছাড়া
একজন customer-এর একটা `for` loop পুরো scan queue ভরিয়ে দিতে পারে — অন্য সব
tenant-এর scan আটকে যাবে।

`packages/shared/src/rate-limit.ts` **আগে থেকেই আছে** এবং free scanner
ব্যবহার করে। শুধু API v1-এ প্রয়োগ করা হয়নি।

## Acceptance

1. প্রতিটা v1 endpoint-এ per-API-key rate limit।
2. Write endpoint-এ কড়া limit (scan enqueue আলাদা, আরও কড়া)।
3. Limit ছাড়ালে `429` + `Retry-After` header + machine-readable error code।
4. Response-এ `X-RateLimit-Limit` / `-Remaining` / `-Reset`।
5. Rate limit **এবং** entitlement দুটোই — plan-ভিত্তিক quota আলাদা জিনিস।

## ফাঁদ

Rate limit key **API key**-এর উপর হবে, IP-র উপর নয় — একটা agency অনেক IP
থেকে ডাকতে পারে, আর একটা IP-তে অনেক agency থাকতে পারে (proxy)।

## Evidence — 2026-09-09

**নতুন মডিউল: `src/server/services/api-rate-limit.ts`** — shared
`redisRateLimitStore` (free scanner-এর সেইম store, `queues.ts` থেকে) ব্যবহার
করে; in-memory নয়, তাই limit প্রতি-instance নয়। Key = **API key id**, IP নয়
(T10-এর ফাঁদ অনুযায়ী)।

**Windows:**
- Read: 300 req/min + 10,000 req/day per key
- Write (`enforceApiWriteRateLimit`): উপরের দুটো **+** 60 req/min আলাদা window

**Error contract:** breach-এ `ApiRateLimitError` throw করে;
`_lib/with-errors.ts` (`withApiErrors`) সেটাকে ধরে `429` +
`code: "RATE_LIMITED"` + `Retry-After` + `RateLimit-*` + `X-RateLimit-*`
headers দেয়। `rateLimitHeaders()` এখন দুই সেট header-ই দেয় (IETF draft +
de-facto alias)।

**কভারেজ — 8টা API-key-authenticated handler-এর সবগুলোতে বসানো হয়েছে (16
call site):**

| Route | Limit |
|---|---|
| `GET /api/v1/websites` (list+create POST) | read; POST-এ write |
| `GET/DELETE /api/v1/websites/[id]` | read; DELETE-এ write |
| `POST /api/v1/websites/[id]/scans` | write (scan enqueue) |
| `GET /api/v1/scans/[id]` | read |
| `GET /api/v1/issues` | read |
| `GET /api/v1/reports` | read |
| `GET /api/v1/reports/[id]/download` (API-key path) | read |

1. ✅ প্রতিটা v1 API-key endpoint-এ per-key limit — sweep দিয়ে যাচাই: `authenticateApiKey`
   ব্যবহার করা **সব ৭টা** route file `enforceApiRateLimit`/`enforceApiWriteRateLimit`
   call করে (grep-diff, কোনো exception নেই)।
2. ✅ Write endpoint (create website, delete website, scan enqueue) 60/min কড়া window।
3. ✅ 429 + Retry-After + `RATE_LIMITED` machine code।
4. ✅ `X-RateLimit-Limit/Remaining/Reset` headers।
5. ✅ Entitlement quota অক্ষত — `triggerScan`-এর `checkScanQuota` আগের মতোই
   আলাদা চলে (rate limit capacity-র, quota plan-এর)।

**Contract test — `src/__tests__/api-rate-limit.test.ts` (2026-09-09):**
`@/server/services/queues` mock করে memory store-এ ৮টা assertion — fresh key
allow, 301-এ minute breach, minute refuse করলে day window consume হয় না
(documented design promise), write 61-এ breach (read budget অক্ষত), 429 envelope-এ
`RATE_LIMITED` + Retry-After = RateLimit-Reset + ৭টা header, `withApiErrors`
throw→429 handshake, আর non-rate-limit error আগের মতোই নিজের mapping পায়।
ফলাফল: **8/8 passed**; পূর্ণ suite **188/188 (7 files)**।

**Gates:** typecheck ✅ · lint ✅ · terminology ✅ · 188/188 tests ✅।
