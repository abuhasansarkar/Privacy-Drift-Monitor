# Privacy Drift Monitor — সম্পূর্ণ Project Overview

> **Continuous privacy and consent monitoring for web agencies.** প্রতিটি client website একটা real browser-এ (Playwright/Chromium) load করা হয় চারটা consent journey-তে — no consent, Reject All, Accept All, withdraw। প্রতিটা request, cookie আর storage write রেকর্ড হয় সেই consent state-এর ট্যাগসহ, প্রতি scan আগেরটার সাথে diff হয়ে **privacy drift** ধরা পড়ে, আর সেটা evidence-backed finding, alert আর white-label report-এ পরিণত হয়।

**এই ডকুমেন্ট সম্পর্কে:** এটা ২০২৬-০৯-০৩ তারিখে করা একটা full audit-এর ফল। প্রতিটা "pass/fail" দাবি এই মেশিনে আসলে কমান্ড চালিয়ে যাচাই করা — code পড়ে অনুমান করে নয়। যেখানে যাচাই করা যায়নি, সেখানে স্পষ্ট করে লেখা আছে।

**Source of truth:** `PLAN.md` + `PLAN-V2.md`। মতভেদ হলে PLAN জেতে।

---

## ১. এক নজরে অবস্থা (Executive Summary)

Codebase-টা **প্রকৌশলগতভাবে চমৎকার**। Core engine (scanner, tenancy, security, billing) production-grade। ২০২৬-০৯-০৩-এর audit-এ যে blocker আর correctness defect পাওয়া গিয়েছিল, **সবগুলো ঠিক করা হয়েছে** এবং প্রতিটার জন্য regression test লেখা হয়েছে।

| Gate | আগে | এখন |
|---|---|---|
| `npm run lint` | ❌ 2 error | ✅ PASS |
| `npm run typecheck` | ✅ | ✅ PASS |
| `npm run check:terminology` | ✅ 550 file | ✅ PASS — 562 file |
| `npm run test:coverage` | ✅ 980 test | ✅ PASS — নিচে §৮ |
| `npm run build` | ❌ FAIL | ✅ PASS — 99 route, marketing static |

**Scale:** ~89,000 LOC · 88 page · 26 API route · 12 package · 52 Prisma model · 47 registered rule · 7 queue · 0টা `any`.

**এখনও যা নেই (সচেতনভাবে, §৭.৯):** outbound webhook delivery, Slack, public API v1, WordPress plugin, policy extraction। এগুলো এখন code আর marketing copy দুই জায়গাতেই *planned* হিসেবে চিহ্নিত — আগে `/integrations` আর pricing page-এ "available" দাবি করা হচ্ছিল।

## ২. Stack (যাচাইকৃত)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js, Turbopack (dev + build) | 16.3.3 |
| UI | React 19.2.8, Tailwind v4 (`@theme inline`, কোনো `tailwind.config.js` নেই), Radix UI, `next/font/local` (self-hosted Inter + JetBrains Mono) | — |
| Auth | Clerk Core 3 (`@clerk/nextjs@^7`, `<Show when="signed-in">`) | 7.8.3 |
| DB | PostgreSQL 16 + Prisma 6 + `forAgency(agencyId)` extension | 16 / 6.19.3 |
| Queue | Redis 7 + BullMQ (7 queue: scan, free-scan, report, notification, email, digest, ai) | — |
| Browser | Playwright/Chromium, pooled context, `page.route` SSRF guard | — |
| Billing | Stripe (checkout + portal + webhook + reconciliation) | ^22 |
| Email | Resend (locally Mailpit) | — |
| Storage | S3-compatible (locally MinIO) | — |
| AI | `AIProvider` abstraction, OpenAI `gpt-4o-mini` (standard) + `gpt-5-nano` (advanced) | — |
| Observability | Sentry, pino logger, `/api/health` + `/api/health/ready` | — |
| Package manager | **npm workspaces** (`package-lock.json` v3) | — |

**Next.js 16 trap যেগুলো ঠিকভাবে handle করা:** `src/proxy.ts` (`middleware.ts` নয়), `cookies()`/`headers()`/`params` সব Promise, `cacheComponents` OFF, `revalidateTag(tag, profile)` 2-arg, কোনো `webpack` key নেই, `PageProps<'/route'>` global।

---

## ৩. Repository Layout

```
drift-monitor/
├── src/
│   ├── app/          (marketing) (auth) (app) (portal) (admin) (onboarding) + api/
│   ├── components/   ui/ (32 primitive) + 20টা domain folder
│   ├── server/       auth · entitlements · queries · actions · services · admin · portal
│   ├── lib/          cn, format, seo, labels, sentry
│   └── proxy.ts      Clerk + CSP (two-policy)
├── packages/         ai analysis billing config database email notifications
│                     reports scanner schemas shared storage
├── worker/           আলাদা Node process — scan, analysis, notification, email,
│                     report, digest, ai, free-scan, scheduler
├── e2e/              Playwright + axe-core (WCAG 2.2 AA)
├── content/          marketing / blog / help / legal / changelog (TS constant)
├── dev-doc/          phases 0–13 + 28টা feature sheet
└── dev-doc2/         25টা module guide + phase 01–07
```

`apps/` directory **নেই** — PLAN §10.9 এই পয়েন্টে §12.1-কে supersede করে।

---

## ৪. Architecture — যেখানে design-টা সত্যিই ভালো

এই চারটা ফাইল পুরো product-এর ভার বহন করে, আর চারটাই ভালোভাবে লেখা।

### ৪.১ Tenant isolation — `packages/database/src/tenant.ts`

`forAgency(agencyId)` একটা Prisma `$extends` যা **প্রতিটা operation-এ** predicate inject করে:

- `READ_OPS` → `where.agencyId`
- `CREATE_OPS` → `data.agencyId`
- `BULK_MUTATION_OPS` → `where.agencyId` (unconditional)
- `UNIQUE_OPS` → `where`-এ inject, তাই **database** atomically enforce করে
- যেকোনো অচেনা operation → **throw** (fail closed)

দুটো detail বিশেষভাবে ভালো:

1. Model নাম **whole-string lowercase** করে মেলানো হয়, camelCase নয় — কারণ Prisma `AIRequest`-কে `aIRequest` বানায়। camelCase ধরলে ওই model scoping থেকে চুপচাপ বাদ পড়ত।
2. আগের একটা "mutate-then-verify" approach বাদ দেওয়া হয়েছে যেটা অন্য tenant-এর row **আগে বদলে ফেলে** তারপর throw করত। এখন cross-tenant `update` → P2025, কিছুই বদলায় না।

`TENANT_MODELS` (42) আর `GLOBAL_MODELS` (9) দুটোই explicit, আর একটা test Prisma DMMF পড়ে list drift ধরে।

### ৪.২ SSRF guard — `packages/scanner/src/net/guard.ts`

R1–R7 rule সব বাস্তবায়িত: scheme allowlist, **port allowlist** (80/443/8080/8443), embedded credential reject, **সব A/AAAA record** validate (একটা public + একটা private = rebinding), resolved IP **pin**, প্রতি redirect hop-এ পুরো guard পুনরায় চালানো, hop cap, আর **deliberately vague user message** (`"We can't monitor this address."`) যাতে endpoint-টা network probing oracle না হয়।

সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ: IPv4-mapped IPv6 (`::ffff:169.254.169.254`) unwrap করে আবার v4 হিসেবে check হয় — নাহলে metadata address বেরিয়ে যেত। আর `range() !== "unicast"` হলেই reject — অর্থাৎ library-তে ভবিষ্যতে নতুন range যোগ হলে **fail closed** হবে, open নয়।

Call site যাচাই করা: `navigate.ts:175`, `phase-runner.ts:142,149`, `website-validation.ts:87`, `free-scan.ts:115`, `webhooks.ts:54`।

### ৪.৩ Portal session — `src/server/portal/session.ts`

Clerk নয়, নিজস্ব magic-link scheme (agency-র client-দের Clerk-এ ঢোকালে MAU bill বাড়ে)। 32-byte token, শুধু SHA-256 hash সংরক্ষিত, 15-min single-use link, 7-day sliding session, 30-day absolute cap, `timingSafeEqual` compare, request endpoint সবসময় 204 (enumeration বন্ধ)।

`__Host-` prefix বাদ দেওয়ার কারণটা code-এ লেখা: spec অনুযায়ী `__Host-` মানে `Path=/`, কিন্তু §6.10 চায় `Path=/portal` — দুটো একসাথে সম্ভব না, তাই narrower path বেছে নিয়ে কারণটা document করা হয়েছে। এটাই সঠিক আচরণ: চুপচাপ diverge না করে লিখে রাখা।

### ৪.৪ Free public scanner — `src/server/services/free-scan.ts`

Product-এর সবচেয়ে ঝুঁকিপূর্ণ surface (anonymous user → real browser)। Control-গুলোর **ক্রম** নিজেই একটা design decision, আর সেটা লেখা আছে:

```
1. normalize      (network নেই, সস্তা reject)
2. SSRF guard     (security boundary — কিছু record হওয়ার আগে)
3. blocklist      (সস্তা DB read)
4. Turnstile      (network call, তাই free reject-গুলোর পরে)
5. IP rate limit  (3/hour, 10/day)
6. domain limit   (1/24h, GLOBAL — সব submitter মিলিয়ে)
7. circuit breaker (queue ceiling)
```

Turnstile আগে রাখলে একটা malformed URL-এর জন্যও Cloudflare-কে round trip দিতে হত। SSRF guard দ্বিতীয় ছাড়া অন্য কোথাও রাখলে একটা `FreeScan` row বা log line-এ internal address চলে আসত।

`verifyTurnstile` secret থাকলে **fail closed**, না থাকলে **fail open** (dev/CI), আর সেটা `configured: false` দিয়ে caller-কে জানায় — trade-off explicit।

### ৪.৫ আরও যা ভালো

- **Browser pool** — semaphore FIFO, `maxUses`/`maxAgeMs` recycle, প্রতিটা acquire path-এ `finally` release, `withContext()` helper। প্রতি consent phase-এ আলাদা context (Accept-All-এর cookie Reject-All recording-এ leak করতে পারবে না)।
- **Admin boundary** — `requireSuperAdmin()` layout + page + handler তিন জায়গায় চলে (`cache()` দিয়ে এক query)। Flag **DB row থেকে** পড়া হয়, Clerk session claim থেকে নয়।
- **RBAC** — একটাই matrix, UI (`<Can>`) আর server (`requirePermission`) দুই জায়গায় import হয়। UI check শুধু cosmetic, প্রতিটা mutation server-side আবার check করে (Next 16-এ proxy Server Action cover করে না)।
- **Entitlements** — সব plan logic pure `@pdm/billing`-এ, `src/server/entitlements.ts` শুধু I/O shell। §9.2-র 5-min cache-এর বদলে React `cache()` per-request — কারণ 5 মিনিট মানে upgrade করেও customer 5 মিনিট blocked, আর `PAST_DUE` agency 5 মিনিট বেশি খরচ করে।
- **Queue design** — 7টা আলাদা queue, একটাতে `kind` field নয়। BullMQ job id-তে `:` নিষিদ্ধ, তাই `toJobId()` enqueue boundary-তে rewrite করে; DB key-তে colon থাকে।
- **Terminology gate** — `scripts/check-terminology.ts` 550 file-এ banned শব্দ খোঁজে ("violation", "non-compliant", "you must" ইত্যাদি)। এটা একটা product rule, style নয়।
- **`any` ব্যবহার: শূন্য।** পুরো `src` + `packages` + `worker`-এ একটাও নেই।

---

## ৫. Feature Inventory

### ৫.১ Scanner pipeline (`packages/scanner`)
Consent journey ৬টা phase-এ চলে: `NO_CONSENT`, `REJECT_ALL`, `ACCEPT_ALL`, `WITHDRAW`, `GLOBAL_PRIVACY_CONTROL`, `INTERACTIVE_ACTION`। CMP adapter আছে (generic + vendor-specific; Usercentrics-এর "Deny" button সহ, যেটা F07 fixture ধরেছিল)। `EvidenceCollector` request/cookie/storage/console/screenshot রেকর্ড করে। F01–F30 fixture matrix। Shadow-DOM-এর ভেতরে reject control খুঁজে পাওয়া test-এ প্রমাণিত।

### ৫.২ Analysis (`packages/analysis`)
**47টা registered rule** (40 scan + 7 drift), যার **45টা আজ fire করতে পারে**; ২টা dormant আর ৫টা id reserved — §৭.৬ দেখুন। এর সাথে classifier, drift engine, dual scoring, remediation generator (GTM + CMP snippet)। `applyPrecedence` একই subject+phase-এ একাধিক finding হলে সর্বোচ্চ precedence-টা রাখে — নাহলে একটা tracker তিনটা issue হয়ে যেত।

### ৫.৩ Web app (88 page)
- **(app)** 40 page — dashboard, websites + 8টা tab, issues, drift, alerts, reports, trackers, clients, team, billing, notifications, onboarding, ai, help, changelog, settings ×7
- **(admin)** 15 page — agencies, users, websites, scans, issues, trackers, billing, queue, logs, feature-flags, ai-usage, system-health, settings
- **(portal)** 7 page — magic-link, Clerk ছাড়া
- **(marketing)** 19 page + `sitemap.xml` + `robots.txt`
- **(auth)** Clerk catch-all

### ৫.৪ API (26 route)
websites (validate/export/evidence-export/scans), scan progress, report download, billing (checkout/portal/confirmation), ai (generate/feedback), webhook (clerk/stripe/resend), health ×2, portal auth + report download, public (free-scan ×3, contact, analytics), search, audit export।

### ৫.৫ Worker
Scan + analysis + notification + email + report + digest + ai + free-scan worker, scan scheduler, digest scheduler, retention cleanup, grace handling, Stripe reconciliation, counter reconciliation, stuck-scan drill। Report-এর জন্য **আলাদা browser** (scan pool-এর সাথে মেশানো হয়নি)।

### ৫.৬ AI (`packages/ai`)
`AIProvider` abstraction (openai + mock), 4টা versioned prompt (`*_V1`), Zod output schema, তিনটা validator — grounding / terminology / claim, `inputHash` cache, pre-call budget enforcement, `creditsFor()`। **Prompt version `inputHash`-এর অংশ** — version না বাড়িয়ে prompt বদলালে চিরকাল পুরোনো output serve হবে।

---

## ৬. UI / Design System

**Token:** `globals.css`-এ semantic CSS custom property, Tailwind v4 `@theme inline`। কোনো `tailwind.config.js` নেই এবং থাকা উচিতও নয়।

Palette: base (background/foreground/card/muted/border/ring), status (success/warning/danger/info + `-muted` ভ্যারিয়েন্ট), **severity scale** (critical/high/medium/low/info + `-bg`), **score scale** (excellent 90–100 → critical 0–24)। Light + dark দুটোই সংজ্ঞায়িত।

**WCAG:** ৭টা token আগে AA fail করত (`--warning` 3.07:1, `--muted-foreground` 4.39:1 ইত্যাদি) — axe-core ধরার পর সব darken করা হয়েছে এবং মাপা ratio comment-এ লেখা। বর্তমান মান (`--success #15803d`, `--warning #b45309`, `--danger #b91c1c`, `--info #0e7490`, `--muted-foreground #6b6b74`) AA-compliant। Severity কখনও শুধু রঙে বোঝানো হয় না — রঙ + icon + text।

**Component:** 32টা UI primitive (`src/components/ui/`) — যার মধ্যে domain-specific `health-score`, `severity-badge`, `stat-tile`, `data-list`, `empty-state`, `page-header`, `filter-form`। এর উপরে 20টা domain folder।

**Copy:** সব user-facing string `packages/shared/src/copy/en.ts`-এ (2,201 line) `t()` helper-এর পেছনে। ভবিষ্যতের `[locale]` segment সস্তা রাখার জন্য।

**State coverage (fix-এর পরে):**

| Route group | page | loading.tsx | error.tsx |
|---|---|---|---|
| (app) | 40 | 12 | 1 |
| (admin) | 15 | **1** ✅ | **1** ✅ |
| (portal) | 7 | **1** ✅ | **1** ✅ |
| (marketing) | 19 | — (static, ইচ্ছাকৃত) | **1** ✅ |

আগে admin, portal আর marketing-এ কোনো boundary ছিল না, তাই error root `global-error.tsx`-এ পড়ত — যা পুরো document replace করে। Portal-এর ক্ষেত্রে সেটা agency-র brand তাদেরই customer-এর সামনে ভেঙে পড়া; admin-এ এক bad filter-এর জন্য পুরো shell হারানো।

Marketing-এ `loading.tsx` ইচ্ছাকৃতভাবে নেই — page গুলো static, loading state কখনও render হত না।

---

## ৭. Findings ও যেভাবে ঠিক করা হয়েছে

প্রতিটা finding এই মেশিনে reproduce করা হয়েছিল, ঠিক করা হয়েছে, আর পুনরাবৃত্তি ঠেকাতে test লেখা হয়েছে।

### ৭.১ ✅ BLOCKER — build fail করত

`Error: Route /solutions/[industry] with dynamic = "error" couldn't be rendered statically because it used headers().`

**Root cause:** [layout.tsx](src/app/layout.tsx) CSP nonce পড়তে `await headers()` করত। Next 16-এ root layout-এ `headers()` ডাকলেই **পুরো app dynamic** হয়ে যায়।

**Fix:** nonce-ভিত্তিক allowance বাদ দিয়ে **hash-ভিত্তিক**। Theme script এখন [theme-script.ts](src/lib/theme-script.ts)-এ একটা compile-time constant; [proxy.ts](src/proxy.ts) সেটার SHA-256 derive করে strict policy-তে বসায়। Root layout আর request পড়ে না।

### ৭.২ ✅ কোনো page prerender হত না

§৭.১-এর একই কারণ। এখন build বলছে **99/99 static page**, আর marketing route-গুলো `○` / `●`।

⚠️ **Hash শুধু strict policy-তে** — এটা CSP-র নিয়ম, পছন্দ নয়। একই directive-এ nonce বা hash থাকলে browser `'unsafe-inline'` **উপেক্ষা করে**। Static policy-তে hash যোগ করলে `'unsafe-inline'` বন্ধ হয়ে Next-এর নিজের prerendered bootstrap script block হয়ে যেত।

Runtime-এ যাচাই করা: static page → `'unsafe-inline'`; dynamic page → `'nonce-…' 'sha256-HU82hO7…'`; আর rendered script-এর hash CSP header-এর hash-এর সাথে **মিলেছে**।

### ৭.৩ ✅ ৬টা marketing page login wall-এ ছিল

`/solutions` (+৫টা industry), `/methodology`, `/security`, `/integrations`, `/changelog` — homepage থেকেই ১০টা ভাঙা link।

**Fix:** [public-routes.ts](src/lib/public-routes.ts)-এ pattern গুলো আলাদা module-এ সরানো হয়েছে যাতে test পড়তে পারে, আর অনুপস্থিত route যোগ করা হয়েছে। [marketing-routes.test.ts](src/__tests__/marketing-routes.test.ts) এখন `content/marketing/nav.ts` walk করে ৫৩টা assertion চালায়।

Runtime-এ যাচাই: দশটাই এখন **200**, আর `/app` · `/admin` এখনও **307 → /login**।

### ৭.৪ ✅ sitemap / robots ছিল না

[sitemap.ts](src/app/sitemap.ts) (27 URL, `content/` থেকে derive করা — hand-maintained list নয়) আর [robots.ts](src/app/robots.ts) যোগ করা হয়েছে। `/free-scanner/[token]` **সচেতনভাবে** excluded — result page একটা third-party site সম্পর্কে, indexed হলে retention window-এর চেয়ে বেশি বাঁচত।

### ৭.৫ ✅ Lint error

দুটোই আসল React anti-pattern ছিল, suppress না করে ঠিক করা হয়েছে:
- `header.tsx` — effect-এ setState ছিল; এখন render-এর সময় adjust (React-এর documented pattern)। আগে নতুন route drawer খোলা অবস্থায় render হয়ে দ্বিতীয় render-এ বন্ধ হত।
- `motion.tsx` — reduced-motion value এখন derived, stored নয়। আগে reduced-motion reader প্রথমে 0 দেখত, তারপর আসল সংখ্যা।

### ৭.৬ ✅ ৬টা rule কিছুই করত না

R029, R040, R041, R043, R045 registry থেকে সরানো হয়েছে; id গুলো [rules.ts](packages/analysis/src/rules.ts)-এর `RESERVED_RULE_IDS`-এ **সংরক্ষিত**, প্রতিটার পাশে কোন evidence দরকার তা লেখা। Rule inventory এখন তিনটা তালিকা:

| | সংখ্যা | মানে |
|---|---|---|
| `RULES` | **47** | registered, fire করতে পারে |
| `DORMANT_RULE_IDS` | 2 | implemented, fact source-এর অপেক্ষায় (R034, R049) |
| `RESERVED_RULE_IDS` | 5 | id সংরক্ষিত, evidence নেই |

আজ **45টা** rule একটা scan-এ fire করতে পারে। `rules.test.ts` assert করে তালিকা দুটো disjoint এবং একসাথে PDM-R001…R050 পূর্ণ করে।

### ৭.৭ ✅ PDM-R034 প্রমাণহীন দাবি করত

HIGH severity finding তুলত *"<vendor> active on site but omitted from privacy policy"* — অথচ কোনো policy পড়ত না। `RuleContext`-এ policy field-ই ছিল না।

**Fix:** `PolicyFacts` type যোগ করা হয়েছে; rule এখন `context.policy.undisclosedVendors` পড়ে **এবং** vendor-টা সত্যিই detect হয়েছে কিনা মেলায়। Policy extraction (Module 23) না থাকা পর্যন্ত `context.policy` undefined, তাই rule **কিছুই emit করে না** — যা অনুপস্থিত input-এর সঠিক উত্তর। R049-ও একইভাবে আসল comparison করে।

### ৭.৮ ✅ CNAME resolver dead code ছিল

R038 cloaking ধরত HTTP `redirectChain`-এ `"cname"` substring খুঁজে — আসল cloaking DNS-স্তরের, কোনো redirect তৈরি করে না।

**Fix:** resolution এখন **scan time-এ** চলে ([scan.ts](packages/scanner/src/scan.ts)) — DNS বদলায়, তাই analysis-এর সময় resolve করলে replayability (P6) ভাঙত। প্রতি scan-এ প্রথম-পক্ষের unique host গুলো (সর্বোচ্চ 25, 5s time-box) resolve হয়ে নতুন `CnameResolution` table-এ জমা হয়, migration `20260903170346_cname_resolutions`। R038 এখন সেই evidence পড়ে এবং host-টার আসল request গুলো cite করে।

**খালি array = "জানা যায়নি", "cloaked নয়" নয়** — দুটোতেই কোনো finding হয় না (P5)।

### ৭.৯ ✅ ভুল "available" দাবি — এটাই সবচেয়ে গুরুতর

Audit-এ আরও দুটো বেরিয়েছে যা প্রথম পাসে ধরা পড়েনি:

- `/integrations` page **Slack** আর **Webhooks** দুটোকেই `status: "available"` দেখাত। Slack একটা feature flag যার default `false` আর কোনো delivery code নেই (`policy.ts` শুধু `email` route করে)। Webhook dispatcher আছে ও tested, কিন্তু **শুধু নিজের test থেকে** call হয় — endpoint model নেই, signing secret নেই, producer নেই।
- **Pricing table** এই দুটোর জন্য Growth+ plan-এ সবুজ টিক দেখাত। অর্থাৎ যে page থেকে customer কেনে, সেখানেই এমন জিনিসের প্রতিশ্রুতি ছিল যা exist করে না।

**Fix:** দুটো row `"planned"`, আর pricing table এখন entitlement উপেক্ষা করে **"Planned"** render করে। Entitlement flag গুলো ছোঁয়া হয়নি — paid tier-এ এগুলো থাকবে কিনা সেটা **pricing decision, আমার নয়**। যেটা decision নয় তা হলো না-থাকা জিনিসের পাশে টিক বসানো।

### ৭.১০ ✅ Documentation বাস্তবতার সাথে মেলে না

`AGENTS.md` sync করা হয়েছে: phase status, rule inventory (তিনটা তালিকা), "specified but NOT wired" row, আর নতুন চারটা defect (#11–#14) সেই তালিকায় যোগ করা হয়েছে যেটা এই repo-তে "শুধু চালালে যে bug ধরা পড়ে" রাখার জন্যই আছে।

### ৭.১১ ✅ ছোট বিষয়

- `packages/storage` — 0% থেকে **12টা test**। দুটো control এখন locked: `put` কখনও ACL পাঠায় না, আর `deletePrefix` **paginate করে** (`ListObjectsV2` সর্বোচ্চ 1000 key দেয়; না-paginate করলে retention request শুধু *মনে হত* পালন হয়েছে)।
- `(admin)`, `(portal)`, `(marketing)` — `error.tsx` যোগ করা হয়েছে; admin আর portal-এ `loading.tsx`-ও। আগে এগুলো `global-error.tsx`-এ পড়ত যা পুরো document replace করে — portal-এর ক্ষেত্রে সেটা agency-র brand তাদেরই customer-এর সামনে ভেঙে পড়া। Marketing-এ `loading.tsx` **ইচ্ছাকৃতভাবে দেওয়া হয়নি**: page গুলো এখন static, loading state কখনও দেখাত না।

## ৮. Test ও Coverage

**69 file, 1,072 test, সব pass, 158s।** (আগে 66 file / 980 test।) DB-backed suite-এর জন্য `docker compose up -d` দরকার (isolated `drift_monitor_test` DB)।

| Package | Stmts | পরিবর্তন |
|---|---|---|
| `scanner` | **96.93%** | ↑ 93.52 — CNAME wiring-এর ৪টা test |
| `billing` | 95.86% | — |
| `schemas` | 95.95% | — |
| `analysis` | 93.92% | ↑ 93.78 — rewritten rule-গুলোর ১৬টা test |
| `storage` | **91.00%** | ↑ **0%** — ১২টা নতুন test |
| `shared` | 90.91% | — |
| `database` | 89.41% | — |
| `notifications` | 78.10% | 🟡 |
| `ai` | 76.92% | 🟡 |
| `email` | 62.06% | 🟡 |
| `reports` | 61.35% | 🟡 |
| `worker/src` | 0% | 🟡 worker job আলাদা file থেকে test হয়, instrument হয় না |

Global 31.01% — সংখ্যাটা বিভ্রান্তিকর, কারণ untested marketing content constant আর config file-ও গণনায় ঢোকে। **Coverage gate যেখানে সবচেয়ে দরকার (scanner, billing) সেখানে 85% threshold মেটে।**

নতুন test-গুলো যা রক্ষা করে:
- `marketing-routes.test.ts` — nav-এর প্রতিটা link signed-out visitor-এর জন্য reachable (৫৩ assertion)
- `inline-scripts.test.ts` — strict CSP-র অধীনে theme script ছাড়া আর কোনো inline script নেই
- `rules.test.ts` — registry আর reserved list disjoint, একসাথে R001…R050 পূর্ণ; R034 policy ছাড়া কিছু দাবি করে না; R038 evidence ছাড়া fire করে না
- `scan.test.ts` — DNS fail করলে scan degrade হয় না; navigation না হলে resolve হয় না
- `storage.test.ts` — `put` কখনও ACL পাঠায় না; `deletePrefix` paginate করে

**E2E:** `e2e/` তে 4টা spec (axe-core WCAG 2.2 AA, app journey, public, auth setup)। এই session-এ চালানো হয়নি।

---

## ৯. Runtime যাচাই

`npm run dev` চালিয়ে fix-এর পরে probe করা:

```
path                     status  redirect
/                        200
/solutions               200     (আগে 307 → /login)
/solutions/web-agencies  200     (আগে 307 → /login)
/methodology             200     (আগে 307 → /login)
/security                200     (আগে 307 → /login)
/integrations            200     (আগে 307 → /login)
/changelog               200     (আগে 307 → /login)
/sitemap.xml             200     (আগে 307 → /login)  27 URL
/robots.txt              200     (আগে 307 → /login)
/pricing                 200
/app                     307 → /login   (সঠিক)
/admin                   307 → /login   (সঠিক)
```

**CSP দুই policy আলাদাভাবে যাচাই করা:**

```
static (/pricing):  script-src 'self' 'unsafe-inline' …           ← hash নেই, সঠিক
dynamic (/login):   script-src 'self' 'nonce-…' 'sha256-HU82hO7…' ← unsafe-inline নেই, সঠিক
```

আর rendered HTML থেকে theme script বের করে তার SHA-256 হিসাব করে CSP header-এর hash-এর সাথে মেলানো হয়েছে — **MATCH**। অর্থাৎ script-টা strict policy-র অধীনে সত্যিই চলবে।

---

## ১০. যা এখনও বাকি

সব blocker আর correctness defect ঠিক করা হয়েছে। যা রইল:

### Product decision (code নয়)

1. **Slack আর outbound webhook** — Growth+ plan-এর entitlement-এ এখনও `true`, কিন্তু delivery নেই। Marketing আর pricing page এখন সৎভাবে "Planned" বলে। **সিদ্ধান্ত নিতে হবে:** এগুলো build করা হবে, নাকি entitlement থেকে সরানো হবে। আমি entitlement ছুঁইনি — সেটা pricing decision।
2. **Policy extraction (Module 23)** — PDM-R034 আর R049 এর অপেক্ষায় (dormant)। এটা ছাড়া "policy-to-code" feature-টা নেই।
3. **Public API v1 + WordPress plugin** (Module 24, 25) — doc আছে, code নেই।

### Engineering (কম জরুরি)

4. `reports` (61%), `email` (62%), `ai` (77%), `notifications` (78%) — coverage বাড়ানো।
5. দুটো auto-named `_test` migration (`20260829180759_test`, `20260902154041_test`) — নাম দেখে কী করে বোঝা যায় না। Migration নাম permanent record।
6. `RESERVED_RULE_IDS`-এর ৫টা rule — প্রতিটার জন্য কী evidence দরকার তা `rules.ts`-এ লেখা আছে। Scanner-এ সেই recording যোগ করলে rule গুলো লেখা সহজ।
7. E2E suite এই session-এ চালানো হয়নি।

### Infra (deploy-এর আগে)

`STRIPE_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `TURNSTILE_*`, `SUPPORT_EMAIL`, verified Resend domain (এখন `onboarding@resend.dev`, restricted), Clerk production instance + webhook secret, S3 lifecycle/CORS, Redis, `WORKER_ROLES` per replica, Sentry prod DSN, `prisma migrate deploy` pre-deploy step, PITR backup + restore drill।

---

## ১১. Commands

```bash
npm install
npm run db:generate        # typecheck-এর আগে বাধ্যতামূলক
npm run db:migrate
docker compose up -d       # postgres, redis, minio, mailpit
npm run dev                # http://localhost:3000
npm run worker
npm run lint               # ✅
npm run typecheck          # ✅
npm run check:terminology  # ✅ 562 file
npm run test:coverage      # ✅ 1,072 test — 600s timeout দিন
npm run build              # ✅ 99 route
npm run verify             # সব gate ক্রমানুসারে
npm run e2e                # Playwright
```

Workspace-scoped: `npm run <script> -w @pdm/<pkg>`। Dependency বদলালে `npm install` চালিয়ে `package-lock.json` commit করুন (CI-তে `npm ci`)।

---

## ১২. যে Contract কখনও drift করা যাবে না

| Contract | কোথায় | mismatch-এর দাম |
|---|---|---|
| Fixture id `F01–F30` | `packages/scanner/src/testing/fixtures.ts` | "F28 passes" মানে আর "no spurious drift" থাকে না |
| Prompt version `<FEATURE>_V<n>` | `packages/ai/src/prompts/index.ts` | version না বাড়িয়ে prompt বদলালে `inputHash` চিরকাল পুরোনো output serve করবে |
| Rule id `PDM-R001–R050` | `packages/analysis/src/rules/` | rename করলে ওই ruleId ধরা প্রতিটা `Issue` row অনাথ হয় |
| Queue ও job id | `packages/scanner/src/queue/queues.ts` | BullMQ runtime-এ `:` reject করে — production-এ |

আমাদের নিজেদের (plan-এর নয়) জিনিসে `X` prefix — `X01`, `PDM-X01`।

---

## ১৩. শেষ কথা

Engineering-এর মান এখানে উঁচু। `tenant.ts`, `guard.ts`, `session.ts`, `free-scan.ts` — এই ফাইলগুলোতে **কেন** এক সিদ্ধান্ত নেওয়া হলো আর কোন বিকল্পটা কীভাবে ব্যর্থ হত, সেটা লেখা আছে। শূন্য `any`, fail-closed default, evidence-এ ভিত্তি করা finding, CI-enforced terminology।

Audit-এ পাওয়া সমস্যাগুলো মানের নয়, **শৃঙ্খলার** — শেষ কয়েকটা commit `npm run verify` না চালিয়ে merge হয়েছিল। একটা প্যাটার্ন দুবার দেখা গেছে এবং সেটাই সবচেয়ে শিক্ষণীয়:

> **কাজ করা code লেখা হয়, export হয়, unit-test হয় — আর কোথাও থেকে call হয় না।**

`AGENTS.md`-এর defect #8 ছিল SSRF guard নিয়ে। এবার একই জিনিস CNAME resolver-এ (#14)। দুটো ক্ষেত্রেই test সবুজ ছিল, কারণ test যা পরীক্ষা করছিল তা কাজ করত — শুধু production path-এ সেটা ছিল না।

সবচেয়ে গুরুতর finding-টা তার চেয়েও সূক্ষ্ম: **PDM-R034 এমন একটা fact দাবি করত যা কেউ কখনও পর্যবেক্ষণ করেনি**, আর output-টা যথেষ্ট বিশ্বাসযোগ্য দেখাত বলে কোনো test সেটা ধরেনি। একই জিনিসের marketing সংস্করণ ছিল pricing page-এ Slack আর webhook-এর পাশে সবুজ টিক। একটা product যার পুরো ভিত্তি "evidence-backed finding", তার জন্য এই দুটোই একই ধরনের ভুল — শুধু ভিন্ন স্তরে।

সব gate এখন পাস করে, আর প্রতিটা fix-এর সাথে একটা test আছে যা সেই নির্দিষ্ট ভুলটা আবার ঘটলে ধরবে।

---

*২০২৬-০৯-০৩। Fix-এর পরে live-run করে যাচাই: `npm run lint` ✅, `npm run typecheck` ✅, `npm run check:terminology` ✅ (562 file), `npm run test:coverage` ✅ (69 file / 1,072 test), `npm run build` ✅ (99 route), `npm run dev` + route/CSP probing। `PLAN.md` source of truth.*
