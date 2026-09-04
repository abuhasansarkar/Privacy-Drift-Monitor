# T07 — Sentry example page/route production build-এ যায়

**Priority:** P1 · **Status:** DONE

## সমস্যা

`create-next-app` / Sentry wizard-এর অবশিষ্ট:

- `src/app/sentry-example-page/page.tsx` — ইচ্ছে করে error throw করে
- `src/app/api/sentry-example-api/route.ts` — একই

দুটোই production build-এ static route হিসেবে যায়। `public-routes.ts`-এ নেই,
তাই auth-এর পেছনে — কিন্তু signed-in যে কেউ খুলে Sentry-তে আবর্জনা event
পাঠাতে পারে, আর build output-এ route হিসেবে দেখায়।

## Acceptance

1. দুটো route মুছে ফেলা।
2. `npm run build` pass, output-এ `sentry-example` নেই।
3. Sentry config (`sentry.*.config.ts`, `instrumentation*.ts`) **অক্ষত** —
   ওগুলো আসল observability, debris নয়।

## Evidence

দুটো ফাইলই পড়ে নিশ্চিত করা হয়েছে যে ওগুলো শুধু error throw করে এবং কোথাও
থেকে reference হয় না, তারপর মুছে ফেলা হয়েছে।

- Build output-এ `sentry-example`: **০** বার (আগে ২টা route)
- Terminology gate: 540 → **538** file (মুছে ফেলা দুটোই)
- Static page: **102** — build ✅
- Sentry observability (`sentry.*.config.ts`, `instrumentation*.ts`) **অক্ষত**
