# T10 — Public API v1-এ rate limit নেই

**Priority:** P1 · **Status:** TODO

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
