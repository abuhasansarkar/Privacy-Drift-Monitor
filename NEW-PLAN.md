# Privacy Drift Monitor — NEW-PLAN

> **Codebase থেকে derive করা status document ও forward roadmap।**
> ২০২৬-০৯-০৪ তারিখে তৈরি — specification পড়ে নয়, **tree পড়ে**।

---

## ০. এই ডকুমেন্ট কী, আর আগেরটার থেকে কেন আলাদা

`PLAN.md`, `PLAN-V2.md`, `PLAN-V3.md`, `UI_Func.md`, `dev-doc/`, `dev-doc2/` আর
`dev-doc3/` — commit `6f6059c`-এ মুছে ফেলা হয়েছে। **সিদ্ধান্ত অনুযায়ী এগুলো
ফিরবে না।** এই ফাইল সেগুলোর জায়গা নিচ্ছে।

[OVERVIEW.md](OVERVIEW.md) **এখনও আছে** (37 KB) এবং রাখা হচ্ছে — এটা ২০২৬-০৯-০৩
তারিখের audit, যেটা `AGENTS.md`-এর current-state table তৈরি করেছিল। এই ডকুমেন্ট
forward plan হিসেবে সেটাকে supersede করে, কিন্তু **historical record হিসেবে
প্রতিস্থাপন করে না** — ওখানে লেখা defect গুলোই এই code-টা আজ যেমন, তেমন হওয়ার
কারণ।

এই ফাইল একটাই নিয়মে লেখা, আর সেটা product-এর নিজের নিয়ম:

> **Code আছে বলেই কোনো কিছুকে "কাজ করছে" বলা হয়নি।**
> প্রতিটা দাবির পাশে লেখা আছে সেটা **কীভাবে** যাচাই হয়েছে। যেখানে যাচাই করা
> যায়নি, সেখানে স্পষ্ট করে সেটাই লেখা।

### যাচাই-চিহ্নের অর্থ

| চিহ্ন | মানে |
|---|---|
| ✅ **Verified** | এই মেশিনে gate চালানো হয়েছে, বা artifact পড়ে গোনা হয়েছে — ফলাফল উদ্ধৃত |
| 🟢 **Built** | Code আছে, typecheck ও build হয়; কিন্তু **runtime চালিয়ে দেখা হয়নি** |
| 🟡 **Partial** | কিছু অংশ আছে, বাকিটা নিচে নাম ধরে বলা |
| 🔴 **Not built** | Implementation নেই। একটা enum value, type বা copy string **implementation নয়** |
| ⚫ **Dead** | নাম দিয়ে পৌঁছানো যায়, কিন্তু কেউ produce বা consume করে না |

### পুরোনো plan কেন বাদ দেওয়া হলো

ভুলটা যাতে আবার না হয়, তাই লিখে রাখা। মুছে ফেলা `PLAN.md` ছিল **967 line**।
Source tree-তে সেটার দিকে **1,730টা `§x.y` citation**। ডকুমেন্টে section ছিল
**41টা**। এর মধ্যে **1,315টা citation** এমন section number বলত যা ডকুমেন্টে
**কখনও ছিল না**; বাকি 415টার number মিলত কিন্তু **topic মিলত না** — code
`§7.1` cite করত BullMQ queue-এর জন্য, অথচ `§7.1` ছিল "Consent State Machine"।

**অর্থাৎ repo-তে থাকা specification কখনোই সেই specification ছিল না যার বিরুদ্ধে
code লেখা হয়েছিল।** যে plan-এর reference মেলানো যায় না, সেটা plan না থাকার
চেয়েও খারাপ — কারণ সেটা মিথ্যা আত্মবিশ্বাস তৈরি করে।

তাই এই ডকুমেন্টে **কোনো section-number cross-reference নেই**। এটা file আর symbol
দেখায় — যেগুলো যাচাই করা যায়।

### এই ফাইল যে housekeeping বাধ্যতামূলক করে

✅ **সম্পন্ন ([T08](dev-doc/tasks/T08-agents-md-sync.md))।** `AGENTS.md` আর
`CLAUDE.md` আগে প্রতিটা agent-কে `PLAN.md`-কে source of truth ধরতে বলত এবং
অস্তিত্বহীন `dev-doc3/`, `UI_DESIGN_PROMPTS.md`, `pnpm-workspace.yaml`-এ পাঠাত।
এখন দুটোই এই ফাইলে ও `dev-doc/`-এ redirect করে, স্পষ্ট করে বলে যে ~1,730টা
`§` citation resolve করা যায় না, এবং `BUILT` বনাম `DONE`-এর পার্থক্য টানে।

---

## ১. বর্তমান অবস্থা — মাপা

### ১.১ Gates (২০২৬-০৯-০৪ তারিখে চালানো)

| Gate | Command | ফলাফল |
|---|---|---|
| Lint | `npm run lint` | ✅ exit 0 |
| Typecheck | `npm run typecheck` | ✅ exit 0 (root + সব workspace) |
| Terminology | `npm run check:terminology` | ✅ exit 0 — 538 file scanned |
| Env drift | `npm run check:env` | ✅ exit 0 — 89 declared, 6 optional **(নতুন)** |
| Build | `npm run build` | ✅ exit 0 — 102 static page |
| **Tests** | — | 🔴 **কোনো test runner install করা নেই** |

`npm run verify` = `lint && typecheck && check:terminology && check:env && build`।
এটা আর test চালায় না, কারণ test নেই। §৩.১ দ্রষ্টব্য।

### ১.২ Code volume

| এলাকা | File | Line |
|---|---|---|
| `src/` (Next app) | 353 | 45,127 |
| `packages/*` (13 workspace) | 146 | 30,580 |
| `worker/` | 24 | 6,712 |
| **মোট** | **523** | **~82,400** |

| Package | Line | ভূমিকা |
|---|---|---|
| `@pdm/scanner` | 6,501 | Playwright engine, consent adapter, SSRF guard, recorder, queue |
| `@pdm/shared` | 4,574 | Copy/`t()`, permission, error, logger, rate limit, flag, Turnstile |
| `@pdm/database` | 4,216 | Prisma schema, `forAgency` tenant extension, repository |
| `@pdm/ai` | 3,848 | Provider abstraction, prompt, grounding validation, budget, cache |
| `@pdm/analysis` | 3,752 | Rule engine, classifier, drift, score, remediation |
| `@pdm/reports` | 1,975 | ৫টা report template, branding, PDF render |
| `@pdm/email` | 1,375 | Resend transport, template |
| `@pdm/notifications` | 1,297 | Dedupe, digest, quiet hours, Slack |
| `@pdm/billing` | 1,294 | Stripe catalogue, entitlement |
| `@pdm/schemas` | 1,101 | Zod validation, enum single-source |
| `@pdm/mcp` | 458 | MCP server, ৫টা tool |
| `@pdm/storage` | 189 | S3/MinIO, private bucket, শুধু signed URL |
| `@pdm/config` | 0 | ⚫ খালি workspace |

### ১.৩ Surface area

| | সংখ্যা | বিস্তারিত |
|---|---|---|
| Page | 89 | marketing 20, app 42, admin 15, portal 7, auth 2, shared 3 |
| API route handler | 33 | এর মধ্যে public API v1 ৬টা, inbound webhook ৩টা, free-scan ৫টা |
| Prisma model | 58 | 46টা tenant-scoped, 12টা সচেতনভাবে global |
| Prisma enum | 35 | |
| Migration | 13 | tracked, `migration_lock.toml` আছে |
| BullMQ queue | **8** | সবগুলোরই worker আছে ([T06](dev-doc/tasks/T06-dead-queues.md)-এর পর) |
| Rule | 52 registered | `PDM-R001`–`R052` + `PDM-X01`, `X02` |
| CMP adapter | 8 + generic | Cookiebot, CookieYes, Complianz, OneTrust, Usercentrics, Didomi, Axeptio, Klaro |
| Report type | 5 | SCAN, ISSUE, MONTHLY_MONITORING, WEBSITE_HEALTH, PRIVACY_DRIFT |
| Feature flag | 10 | ৮টা default-off |
| Env var | 89 | `.env.example`, `check:env` gate দিয়ে পাহারা দেওয়া |
| Seeded tracker vendor | **74** | ⚠️ §৩.২ — এটাই সবচেয়ে বড় product gap |

---

## ২. Architecture — যেভাবে আসলে দাঁড়িয়ে আছে

```
                  ┌────────────────────────────────────────┐
   Browser ──────▶│  Next.js 16.3.3 (Turbopack, Node)      │
                  │  src/proxy.ts → Clerk Core 3           │
                  │  (marketing)(auth)(app)(portal)(admin) │
                  └───────────┬────────────────┬───────────┘
                              │                │
                    forAgency(agencyId)   BullMQ enqueue
                              │                │
                  ┌───────────▼──────┐  ┌──────▼─────────────────────┐
                  │  PostgreSQL 16   │  │  Redis 7                   │
                  │  58 model        │  │  8 queue (সবগুলো consumed) │
                  └───────────▲──────┘  └──────┬─────────────────────┘
                              │                │
                  ┌───────────┴────────────────▼───────────┐
                  │  worker/  (আলাদা Node process)         │
                  │  ┌──────────────────────────────────┐  │
                  │  │ scan → BrowserPool (Chromium)    │  │
                  │  │   ├ NO_CONSENT / REJECT_ALL      │  │
                  │  │   ├ ACCEPT_ALL / WITHDRAW        │  │
                  │  │   ├ GPC / INTERACTION            │  │
                  │  │   └ installRouteGuard (SSRF)     │  │
                  │  ├──────────────────────────────────┤  │
                  │  │ analyseScan (INLINE, queue নয়)   │  │
                  │  │   classify → rules → drift →     │  │
                  │  │   score → issues → alerts        │  │
                  │  ├──────────────────────────────────┤  │
                  │  │ report · email · ai · digest ·   │  │
                  │  │ webhook · free-scan              │  │
                  │  ├──────────────────────────────────┤  │
                  │  │ scheduler: sweepDueWebsites,     │  │
                  │  │ recoverStuckScans, runRetention, │  │
                  │  │ reconcileStripe, grace, quota    │  │
                  │  └──────────────────────────────────┘  │
                  └───────────┬────────────────────────────┘
                              │
                  ┌───────────▼──────┐
                  │  S3 / MinIO      │  screenshot, report PDF
                  │  private, signed │
                  └──────────────────┘
```

### ২.১ Invariant গুলো — আর সেগুলো টিকে আছে কিনা

এগুলোই architecture-এর ভার বহন করে। প্রতিটা সরাসরি যাচাই করা।

| # | Invariant | অবস্থা | কীভাবে যাচাই |
|---|---|---|---|
| **P1** | Deterministic scanner-ই একমাত্র source of truth | 🟢 Built | `packages/scanner`-এ কোনো AI call site নেই; `RuleContext` শুধু recorded fact বহন করে |
| **P2** | AI evidence ব্যাখ্যা করে, বানায় না | ✅ Verified | [validate.ts:118](packages/ai/src/validate.ts#L118)-এ `GROUNDING_FIELD` + `checkGrounding()`। কোনো feature-এর entry **অনুপস্থিত** থাকলে `GROUNDING_FAILED`, `repairable: false` — fail closed |
| **P3** | Tenant isolation data layer-এ | ✅ Verified | `agencyId` আছে এমন প্রতিটা model (47) হয় `TENANT_MODELS`-এ (46), নয়তো `GLOBAL_MODELS`-এ (`SystemLog`)। কোনোটাই বাদ পড়েনি। Raw `prisma` import ঠিক ২ জায়গায়, দুটোই inline justified |
| **P4** | `PARTIAL` first-class outcome | 🟢 Built | `ScoreConfidence = "FULL" \| "PARTIAL"`, [score.ts:82](packages/analysis/src/score.ts#L82)-এ `PARTIAL_CEILING = 75`; `en.ts:319`-এ `partialBanner` copy |
| **P5** | Evidence write-only | 🟢 Built | `IssueEvidence`-এ `/// Insert-only. No updatedAt by design.` |
| **P6** | Pipeline replayable | 🟢 Built | CNAME resolution scan time-এ সরানো (`CnameResolution` model), তাই analysis pure থাকে |

**SSRF** — ✅ পড়ে যাচাই করা। একটাই `page.route("**/*")` handler
([navigate.ts:93](packages/scanner/src/navigate.ts#L93)-এ `installRouteGuard`)
guard আর media blocking দুটোই করে, তাই দুই-handler ফাঁদটা এড়ানো হয়েছে।
`navigate()` entry URL আবার check করে। `MAX_REDIRECT_HOPS = 3` **address
check-এর আগে** দেখা হয়, তাই redirect loop একটা browser slot আটকে রাখতে পারে না।
`urlGuard` inject করা যায় কিন্তু default আসল guard — তাই parameter ভুলে গেলে
fail closed হয়। Call site আছে web app, webhook service, free-scan service,
sitemap spider, login runner আর policy discovery-তেও।

**Free-scanner abuse control** — 🟢 Built, ক্রমটা সচেতন:
DNS/SSRF → blocklist → Turnstile → per-IP hourly + daily → **global per-domain**
(এটা আমাদের capacity নয়, **তৃতীয় পক্ষের site** বাঁচায়) → queue ceiling।
`verifyTurnstile` secret থাকলে **fail closed**, না থাকলে **fail open + loud
log** — development trade-off হিসেবে স্পষ্ট করে documented।

---

## ৩. যা হয়ে গেছে — module ধরে ধরে

### ৩.১ Foundation

| বিষয় | অবস্থা | নোট |
|---|---|---|
| Next.js 16.3.3, Turbopack, `src/proxy.ts` | ✅ Verified | clean build |
| Clerk Core 3 (`<Show>`, `<SignedIn>` নেই) | 🟢 Built | |
| Tailwind v4 `@theme inline`, কোনো config file নেই | 🟢 Built | |
| Prisma 6, 13টা tracked migration | 🟢 Built | কখনও `db push` নয় |
| `forAgency()` tenant extension | ✅ Verified | §২.১ P3 |
| [public-routes.ts](src/lib/public-routes.ts)-এ public route matcher | 🟢 Built | ⚠️ যে test এটাকে পাহারা দিত সেটা নেই |
| Zod validation layer (`@pdm/schemas`) | 🟢 Built | enum single-source |
| Centralised copy `t()` / `en.ts` | ✅ Verified | 540 file-এ terminology gate pass |
| Sentry client/server/edge + pino | 🟢 Built | |
| `/api/health` + `/api/health/ready` | 🟢 Built | dependency probe |
| Docker: postgres, redis, minio, mailpit | 🟢 Built | `docker-compose.yml` |
| CI: `pr.yml`, `deploy.yml` | 🟡 Partial | আসল dependency-র বিরুদ্ধে কখনও চলেনি; comment বাসি (§৪) |
| **Automated test** | 🔴 **নেই** | নিচে দ্রষ্টব্য |

> **Test suite মুছে ফেলা হয়েছে।** Commit `2a192cf` 105টা file / 18,380 line আর
> `vitest.config.ts` সরিয়েছে; vitest install-ও করা নেই। যা আছে তা হলো `e2e/`-তে
> ৩টা Playwright spec (467 line)।
>
> এটাই repository-র সবচেয়ে বড় ঝুঁকি, আর line count যা বোঝায় তার চেয়েও বেশি —
> কারণ মুছে যাওয়া test গুলোই ছিল **চারটা documented contract-এর enforcement
> mechanism**: fixture id `F01`–`F30`, prompt version `<FEATURE>_V<n>`, rule id
> `PDM-R001`–`R050`, আর queue/job id। এর প্রতিটাই অন্তত একবার ভুল হয়েছিল, আর
> **প্রতিটা ব্যর্থতাই ছিল নীরব**।
>
> [public-routes.ts](src/lib/public-routes.ts),
> [tenant.ts](packages/database/src/tenant.ts),
> [theme-script.ts](src/lib/theme-script.ts), [ai/types.ts](packages/ai/src/types.ts)
> আর [reports/branding.ts](packages/reports/src/branding.ts) — এগুলোর comment
> এখনও অনুপস্থিত test-কে নিজের safety net বলে উল্লেখ করে।
>
> অনাথ অবশিষ্ট: `test/global-setup.ts` আর `test/server-only-stub.ts` — এখন কেউ
> reference করে না।

### ৩.২ Scanner — `@pdm/scanner`

| বিষয় | অবস্থা | নোট |
|---|---|---|
| BrowserPool, journey-প্রতি context | 🟢 Built | `browser/pool.ts` |
| ৬টা consent journey | 🟢 Built | NO_CONSENT, REJECT_ALL, ACCEPT_ALL, WITHDRAW, GPC, INTERACTION |
| ৮টা CMP adapter + deep-DOM generic | 🟢 Built | "Deny" সহ (Usercentrics defect) |
| SSRF guard, per-hop, IP-pinned | ✅ Verified | §২.১ |
| Recorder: network, cookie, storage, console, screenshot | 🟢 Built | `record/recorders.ts` |
| PII sanitisation | 🟢 Built | `privacy/sanitize.ts` |
| Scan time-এ CNAME de-anonymisation | 🟢 Built | `net/cname.ts` → `CnameResolution` |
| Consent Mode v2 instrumentation | 🟢 Built | `instrumentation/consent-mode.ts` |
| DOM gating + fingerprint trap | 🟢 Built | |
| Sitemap spider, deep crawl | 🟢 Built | `spider/` |
| Authenticated scan | 🟢 Built | `auth/login-runner.ts`, encrypted credential |
| Policy discovery + extraction | 🟢 Built | `policy/` |
| GeoIP | 🟢 Built | `net/geoip.ts` |
| F01–F30 fixture matrix | 🟡 Partial | `testing/fixtures.ts` আছে; vitest যাওয়ার পর **runner নেই** |
| **Tracker vendor catalogue** | 🔴 **74টা vendor** | ⚠️ নিচে |

> **Vendor catalogue-ই product-এর detection ceiling।**
> `packages/database/prisma/seed/trackers.json`-এ vendor আছে **৭৪টা** —
> ADVERTISING ৭, MARKETING ১৩, FUNCTIONAL ১৮, ANALYTICS ১৬, NECESSARY ১৫,
> SOCIAL ৫। মূল rule `PDM-R001` fire করে "consent-এর আগে **known** advertising
> vendor-এ request" দেখে — মাত্র ৭টা advertising vendor seeded থাকায় সেই rule
> বেশিরভাগ বাস্তব site-এ **নীরবে under-report** করে, আর product এমন একটা site-এর
> জন্য পরিষ্কার ফলাফল দেখায় যেটাকে সে আসলে classify-ই করতে পারেনি।
>
> Codebase-এ এটাই সবচেয়ে বেশি leverage-ওয়ালা functional gap।

### ৩.৩ Analysis — `@pdm/analysis`

| বিষয় | অবস্থা | নোট |
|---|---|---|
| Vendor classifier, multi-signal + confidence | 🟢 Built | `classify.ts` |
| Two-pass rule engine (scan rule, তারপর drift rule) | 🟢 Built | `rules.ts` |
| 52টা rule registered | ✅ Verified | `PDM-R001`–`R052`, `PDM-X01`, `X02`; R001–R050-এ কোনো ফাঁক নেই |
| `DORMANT_RULE_IDS` / `RESERVED_RULE_IDS` | ✅ Verified | দুটোই খালি — fire করতে পারে না এমন কোনো rule registered নেই |
| Drift engine + `pickBaseline` | 🟡 Partial | baseline = "সর্বশেষ completed scan"; **approval workflow নেই** |
| Health score, severity-প্রতি cap | 🟢 Built | ⚠️ HIGH = 12 (পুরোনো plan বলত 15) |
| Scan confidence | 🟢 Built | `FULL`/`PARTIAL` enum + 75 ceiling |
| Remediation: GTM + CMP snippet | 🟢 Built | `remediation/gtm.ts`, `cmp.ts` |
| Ignore rule / drift suppression | 🟢 Built | `IgnoreRule`, `DriftSuppression` model |

### ৩.৪ Application layer — `src/`

| বিষয় | অবস্থা |
|---|---|
| ৬টা route group জুড়ে 89টা page | 🟢 Built |
| Dashboard + Attention Center | 🟢 Built |
| Website hub (৯টা tab) | 🟢 Built |
| Issue triage + detail + evidence chain | 🟢 Built |
| Cross-portfolio drift feed | 🟢 Built |
| Client, team, alert, notification | 🟢 Built |
| Settings (৮টা sub-page) | 🟢 Built |
| Bulk CSV website import | 🟢 Built |
| Evidence export (CSV + JSON) | 🟢 Built |
| 15-view admin console + impersonation | 🟢 Built |
| Client portal, magic-link auth | 🟢 Built |
| Free public scanner + lead capture | 🟢 Built |
| 20টা marketing page, prerendered | ✅ Verified (build output) |
| Onboarding wizard | 🟢 Built |

### ৩.৫ Async — `worker/`

| Queue | Worker registered | অবস্থা |
|---|---|---|
| `pdm-scan` | ✅ | 🟢 Built |
| `pdm-scan-free` | ✅ | 🟢 Built, সচেতনভাবে ১ attempt |
| `pdm-report` | ✅ | 🟢 scan pool থেকে আলাদা browser |
| `pdm-notification` | ✅ | 🟢 Built |
| `pdm-email` | ✅ | 🟢 Built |
| `pdm-digest` | ✅ | 🟢 Built |
| `pdm-ai` | ✅ | 🟢 Built |
| `pdm-webhook` | ✅ | 🟢 HMAC-SHA256 + backoff |

> ✅ **সম্পন্ন ([T06](dev-doc/tasks/T06-dead-queues.md))।** `pdm-analysis` আর
> `pdm-cleanup` declared ছিল কিন্তু কোনো producer/consumer ছিল না — analysis
> inline চলে (`analyseScan`), retention scheduler tick-এ। দুটোই সরানো হয়েছে।
> কাজ করতে গিয়ে উল্টো দিকের defect-ও ধরা পড়ে: জীবন্ত `pdm-webhook` admin
> view-তে **ছিল না**, অর্থাৎ যে queue-এর backlog মানে customer webhook আটকে
> আছে, সেটাই operator দেখতে পেতেন না। এখন ৮ = ৮।

Scheduler: `sweepDueWebsites` (jittered), `recoverStuckScans`, `runRetention`,
`reconcileStripe`, `reconcileCounters`, `grace`, `scan-quota`। 🟢 Built।

### ৩.৬ Intelligence, commerce, integration

| বিষয় | অবস্থা | নোট |
|---|---|---|
| `AIProvider` abstraction, OpenAI | 🟢 Built | |
| Grounding validation | ✅ Verified | undeclared feature-এ fail closed |
| `inputHash` dedupe cache | 🟢 Built | prompt version hash-এর অংশ |
| Token budget breaker, agency-প্রতি credit | 🟢 Built | |
| **AI feature: ৮টার মধ্যে ৪টা** | 🟡 Partial | নিচে দ্রষ্টব্য |
| Cookie classifier (AI) | 🟢 Built | |
| Policy extractor (AI) | 🟢 Built | |
| Stripe: ২৪টা price point (৪ plan × ৩ currency × ২ interval) | ✅ Verified | অভিপ্রেত catalogue-এর সাথে হুবহু মেলে |
| ২০টা entitlement point | 🟢 Built | `entitlements.ts` |
| `whiteLabelEntitlement` resolver | ✅ Verified | একটাই resolver, কোনো literal নেই |
| Grace period, trial, reconciliation | 🟢 Built | |
| Resend email + delivery webhook | 🟡 Partial | handler আছে, `RESEND_WEBHOOK_SECRET` unset → fail closed 401 |
| Slack alert | 🟢 Built | flag default **off** |
| Outbound webhook, HMAC + retry | 🟢 Built | flag default **off** |
| Public API v1 (`pdm_live_`, read/write/admin scope) | 🟡 Partial | **rate limiting নেই** |
| MCP server, ৫টা tool | 🟢 Built | |
| WordPress plugin | 🟢 Built | `plugins/wordpress/` |
| GitHub Action | 🟢 Built | `plugins/github-action/` |

> **AI feature — declared বনাম implemented।** `AIFeature` DB enum-এ ৮টা value।
> Prompt আছে আর dispatch করা যায় মাত্র ৪টার: `EXPLAIN_ISSUE`, `RECOMMEND_FIX`,
> `SUMMARIZE_DRIFT`, `CLIENT_MESSAGE`। `CLASSIFY_TRACKER`-এর `GROUNDING_FIELD`
> entry আছে কিন্তু prompt নেই। `ROOT_CAUSE`, `DEVELOPER_TASK` আর
> `WEBSITE_SUMMARY` শুধু `schemas/enums.ts` আর `ai/types.ts`-এ enum member
> হিসেবে আছে। এগুলো dispatch করলে fail closed হবে — আচরণটা সঠিক, কিন্তু এগুলো
> feature নয়, **reserved id**, আর `RESERVED_RULE_IDS`-এর মতো করেই লিখে রাখা উচিত।

---

## ৪. Defect ও debt register

ফেলে রাখলে যেটার দাম বেশি, সেটা আগে।

| ID | Severity | বিষয় | কোথায় |
|---|---|---|---|
| **G-13** | ✅ **FIXED** | **Phase-শূন্য scan `FULL` confidence দেখাত।** `phases.filter(...)` খালি array-তে খালি ফেরে, তাই একটাও journey না চালানো scan পূর্ণ আত্মবিশ্বাসে 100 score পেত — P4-এর সরাসরি লঙ্ঘন। DB-তে ৫৯টা এমন scan ছিল। [T03](dev-doc/tasks/T03-zero-phase-confidence.md) | `score.ts` |
| **G-14** | ✅ **FIXED** | **Demo seed evidence row লিখত না**, শুধু counter বসাত — তাই Evidence/Cookies/Consent tab খালি দেখাত অথচ scan "COMPLETED, 73 requests" বলত। **এটাই "UI ঠিকমতো দেখায় না"-র আসল কারণ।** [T04](dev-doc/tasks/T04-demo-seed-evidence.md) | `seed-demo.ts` |
| **G-15** | ✅ **FIXED** | **`PORTAL_TOKEN_SECRET` `.env`-এ ছিল না** — impersonation runtime-এ throw করত, আর দুটো IP-hash salt নীরবে খালি string হয়ে যেত। [T05](dev-doc/tasks/T05-env-drift.md) | `.env` |
| **G-01** | ✅ **FIXED** | `AGENTS.md` / `CLAUDE.md` অস্তিত্বহীন ফাইলে পাঠাত ও ভুল scale দাবি করত → `NEW-PLAN.md`/`dev-doc/`-এ redirect, মাপা সংখ্যা, `BUILT` বনাম `DONE`। [T08](dev-doc/tasks/T08-agents-md-sync.md) | `AGENTS.md`, `CLAUDE.md` |
| **G-02** | 🔴 Critical | কোনো unit/integration test নেই। চারটা documented contract অরক্ষিত | repo-wide |
| **G-03** | 🔴 High | ৭৪টা seeded vendor detection quality-র ছাদ বেঁধে দেয়; advertising মাত্র ৭টা | `prisma/seed/trackers.json` |
| **G-04** | ✅ **FIXED** | দুটো dead queue সরানো; সেই সাথে ধরা পড়ল জীবন্ত `pdm-webhook` admin view-তে **ছিল না**। এখন ৮ = ৮। [T06](dev-doc/tasks/T06-dead-queues.md) | `queues.ts`, `admin/queue.ts` |
| **G-05** | 🟠 Medium | Public API v1-এ scope আর pagination আছে, **rate limiting নেই** | `src/app/api/v1/**` |
| **G-06** | 🟠 Medium | `installMediaBlocking` uncalled dead code, যা ঠিক সেই দ্বিতীয় `page.route("**/*")` handler নিবন্ধন করে যেটাকে codebase নিজেই "নীরবে security control বাদ দেয়" বলে documented করেছে | [navigate.ts:146](packages/scanner/src/navigate.ts#L146) |
| **G-07** | 🟠 Medium | `PDM-R051` / `PDM-R052` repo-র নিজের convention ভাঙে — plan-বহির্ভূত rule id-তে `X` prefix থাকার কথা | `rules/consent-mode.ts` |
| **G-08** | 🟡 Low | Health score-এ HIGH penalty 12; বাকি সব severity documented model-এর সাথে মেলে। Undocumented divergence | [score.ts:53](packages/analysis/src/score.ts#L53) |
| **G-09** | 🟡 Low | বাসি CI comment: `pr.yml:4` `test`-কে gate বলে; `deploy.yml:38-40` "coverage gate" আর "1,072 tests" উল্লেখ করে | `.github/workflows/` |
| **G-10** | ✅ **FIXED** | Sentry scaffold debris মুছে ফেলা; build-এ আর নেই। [T07](dev-doc/tasks/T07-scaffold-debris.md) | `src/app/` |
| **G-11** | 🟡 Low | অনাথ `test/global-setup.ts`, `test/server-only-stub.ts`; খালি `@pdm/config` workspace | |
| **G-12** | 🟡 Low | `.env.example`-এ `TURNSTILE_SITE_KEY` আর `NEXT_PUBLIC_TURNSTILE_SITE_KEY` দুটোই | `.env.example:145` |

### আসল dependency-র বিরুদ্ধে কখনও চালানো হয়নি

সৎ তালিকা। এগুলো build হয় আর typecheck হয় — জানা কথা এটুকুই:
Clerk webhook · Stripe webhook · Resend delivery webhook · CI pipeline ·
জীবন্ত site-এর বিরুদ্ধে end-to-end scan pipeline · sustained load-এ BrowserPool ·
deployed environment-এ S3/MinIO।

---

## ৫. Professional-grade product হতে যা যা লাগবে

কেন commercially গুরুত্বপূর্ণ, সেই অনুযায়ী সাজানো — সহজ কোনটা, সেই অনুযায়ী নয়।

### ৫.১ Output-এর উপর আস্থা — এটাই product-এর পুরো মূল্য

| Gap | অবস্থা | কেন গুরুত্বপূর্ণ |
|---|---|---|
| **Vendor catalogue scale-এ** (74 → 2,000+) | 🔴 | যে privacy monitor tracker-এর নাম বলতে পারে না, সে পরিষ্কার site রিপোর্ট করে। Demo আর product-এর পার্থক্য এখানেই |
| **Automated test suite** | 🔴 | 82k line, কোনো regression net নেই। প্রতিটা rule পরিবর্তন নীরব ভাঙনের ঝুঁকি |
| **Fixture matrix runner** (F01–F30) | 🟡 | Fixture আছে, চালানোর কিছু নেই। "F28 passes" এখন কিছুই বোঝায় না |
| **Unknown-tracker triage loop** | 🟡 | `getUnknownDomains` + `createTrackerVendorAction` আছে; AI-suggestion step আর review queue UI নেই |
| **Detection accuracy telemetry** | 🔴 | False-positive rate নেই, rule precision মাপা হয় না। `IssueFeedback` model আছে কিন্তু signal হিসেবে ব্যবহৃত হয় না |

### ৫.২ Agency workflow-এর পরিপক্বতা

| Gap | অবস্থা | কেন গুরুত্বপূর্ণ |
|---|---|---|
| **Formal baseline approval** | 🔴 | `ScanBaseline` model নেই। Baseline মানে implicit "শেষ scan", তাই agency বলতেই পারে না "এই configuration approved" — অথচ drift promise-এর কেন্দ্রই সেটা |
| **Maintenance window** | 🔴 | একেবারেই নেই। Alert fatigue-এর উত্তর হিসেবে নাম করা; এটা ছাড়া একটা deploy মানেই alert-এর দেয়াল |
| **Scheduled report delivery** | 🟡 | Report generation আছে; recurring schedule + client contact-এ auto-send যাচাই করা দরকার |
| **Issue SLA / assignment** | 🔴 | Issue-তে owner নেই, due date নেই, escalation নেই |
| **Bulk issue operation** | 🔴 | 200-site portfolio triage করতে multi-select লাগে |

### ৫.৩ Integration ও ecosystem

| Gap | অবস্থা |
|---|---|
| Slack | 🟢 built, flag off |
| Outbound webhook | 🟢 built, flag off |
| MCP server, WordPress plugin, GitHub Action | 🟢 built |
| **Jira** | 🔴 নেই |
| **Linear** | 🔴 নেই (grep hit গুলো ছিল `linear-gradient`) |
| **Microsoft Teams** | 🔴 নেই |
| **Geo-proxy / multi-region egress** | 🔴 শুধু `GeoEgressRegion` enum, implementation নেই |
| **SSO — SAML / SCIM** | 🔴 নেই |

### ৫.৪ Operational readiness

| Gap | অবস্থা | কেন গুরুত্বপূর্ণ |
|---|---|---|
| API rate limiting | 🔴 | G-05। Rate limit ছাড়া public API মানে customer-এর একটা `for` loop-এর অপেক্ষায় থাকা outage |
| API docs / OpenAPI spec | 🔴 | v1 live, অথচ published contract নেই |
| Backup + restore **rehearsal** | 🔴 | একবার restore না করা পর্যন্ত RPO/RTO target অর্থহীন |
| Load / soak test | 🔴 | `load/` directory আছে; ২৪ ঘণ্টায় BrowserPool leak-ই documented failure mode, আর সেটা untested |
| OpenTelemetry trace | 🔴 | Sentry আছে; web → queue → worker distributed tracing নেই |
| Runbook | 🔴 | `dev-doc/ops/`-এর সাথে মুছে গেছে; replace করা হয়নি |
| Status page / uptime SLO | 🔴 | |

### ৫.৫ Product polish

| Gap | অবস্থা |
|---|---|
| AI feature ৫–৮ (`ROOT_CAUSE`, `DEVELOPER_TASK`, `WEBSITE_SUMMARY`, `CLASSIFY_TRACKER` prompt) | 🔴 |
| Custom portal domain (CNAME) | 🔴 |
| Custom rule authoring | 🔴 |
| Localisation (`[locale]` segment) | 🔴 — `t()` layer থাকায় সস্তা, কিন্তু কেউ ব্যবহার করে না |
| In-app product tour | 🔴 |

---

## ৬. Roadmap

এমনভাবে সাজানো যাতে প্রতিটা phase পরেরটাকে নিরাপদ করে। Phase 19 আগে, কারণ
সেটা ছাড়া তার পরের সবকিছু **যাচাই-অযোগ্য**।

### Phase 19 — Safety net ফেরানো *(blocking)*

**লক্ষ্য:** নীরবে কোনো contract না ভেঙে পরিবর্তন করা যাবে।

1. vitest reinstall, `vitest.config.ts` ফেরানো (`server-only` alias সহ — bundler
   ছাড়া `server-only` throw করে)।
2. যেকোনো feature test-এর **আগে** চারটা **contract test**:
   - rule id: `RULES` ∪ `DORMANT` ∪ `RESERVED` = `PDM-R001…R052` + `X` id, disjoint
   - prompt version: prompt আছে এমন প্রতিটা `AIFeature`-এর `_V<n>` তার map key-র সাথে মেলে
   - fixture id: `F01`–`F30` উপস্থিত ও unique
   - queue + job id: কোথাও `:` নেই
3. Tenant isolation test: `TENANT_MODELS`-এর প্রতিটা model-এ cross-agency read
   ০ row ফেরত দেয়।
4. Marketing route test: `content/marketing/nav.ts` walk করে
   `PUBLIC_ROUTE_PATTERNS`-এর সাথে মেলানো।
5. `test:coverage` আবার `npm run verify` আর দুটো CI workflow-এ যুক্ত করা।
6. **G-01** ঠিক করা — `AGENTS.md` / `CLAUDE.md`-এর section গুলো এই ফাইলে redirect।

**সম্পন্ন যখন:** `npm run verify` আবার test চালায়, আর ইচ্ছে করে একটা rule id
rename করলে build fail করে।

### Phase 20 — Detection quality

1. `trackers.json` ২,০০০+ vendor-এ বাড়ানো, category-balanced, প্রতিটা entry-র
   provenance লিখে রেখে।
2. Fixture runner বানানো; F01–F30 green করা আর CI-তে রাখা।
3. Unknown-tracker triage loop বন্ধ করা: AI category suggestion → admin review
   queue → `createTrackerVendorAction`।
4. `IssueFeedback`-কে rule-প্রতি মাপা precision signal-এ পরিণত করা।
5. **G-07** (`R051`/`R052` → `X` id, `Issue.ruleId` migration সহ) আর **G-08**
   (HIGH penalty documented করা বা ঠিক করা) নিষ্পত্তি।

**সম্পন্ন যখন:** একটা বাস্তব commercial site scan করলে তার third-party
request-এর ≥ ৯০% নাম ধরে চেনা যায়, আর rule precision এমন একটা সংখ্যা যা কেউ
তাকিয়ে দেখতে পারে।

### Phase 21 — Agency workflow

1. `ScanBaseline` model + approval workflow + promote-to-new-version।
2. Maintenance window, উইন্ডো শেষে স্বয়ংক্রিয় verification scan সহ।
3. Issue assignment, due date, bulk operation।
4. Client contact-এ scheduled report delivery।
5. Dead queue দুটো সরানো বা ব্যবহার করা (**G-04**)।

**সম্পন্ন যখন:** একটা agency baseline approve করতে পারে, window-এর মধ্যে deploy
করতে পারে, আর চল্লিশটা alert-এর বদলে একটা summary পায়।

### Phase 22 — Production hardening

1. API v1 rate limiting (**G-05**) + published OpenAPI spec।
2. প্রতিটা inbound webhook তার আসল provider-এর বিরুদ্ধে চালানো।
3. Backup/restore rehearsal; বাস্তব RPO/RTO লিখে রাখা।
4. ২৪ ঘণ্টার soak test, যা assert করে `activeContexts` শূন্যে ফেরে।
5. web → queue → worker OpenTelemetry span।
6. **G-06**, **G-09**, **G-10**, **G-11**, **G-12** পরিষ্কার।
7. Ops runbook আবার লেখা।

**সম্পন্ন যখন:** একটা restore সত্যিই করা হয়েছে আর সংখ্যাগুলো বাস্তব।

### Phase 23 — Ecosystem ও scale

Jira · Teams · geo-proxy mesh · SSO (SAML/SCIM) · custom portal domain ·
custom rule authoring · AI feature ৫–৮ · localisation।

---

## ৭. কাজের নিয়ম

এগুলো architectural, stylistic নয়। `AGENTS.md`-এর মুছে যাওয়া ফাইলের reference
ছাড়া আর কিছু এগুলো supersede করে না।

1. Deterministic scanner-ই একমাত্র source of truth। কোনো request হয়েছে কিনা —
   সেটা কখনও LLM ঠিক করে না।
2. AI evidence ব্যাখ্যা করে, বানায় না। Resolve না হওয়া `evidence_refs`
   validation boundary-তেই বাতিল।
3. AI থাকুক বা না থাকুক, finding render হয়।
4. Tenant isolation data-access layer-এ — `forAgency()`, কখনও convention দিয়ে
   নয়। `unsafeGlobalClient(reason)`-এর প্রতিটা call site-এ justification লাগে।
5. `PARTIAL` first-class। অসম্পূর্ণ scan কখনও পরিষ্কার verdict দেয় না।
6. Evidence collector-এর downstream-এ কেউ নতুন fact যোগ করে না।
7. Banned terminology CI-enforced। Product technical fact রিপোর্ট করে,
   compliance নির্ধারণ করে না।
8. **Code আছে বলে কিছুকে "কাজ করছে" বলবেন না।** কীভাবে যাচাই হয়েছে সেই চিহ্ন
   দিন, নয়তো 🟢 দিয়ে লিখুন যে runtime চালানো হয়নি।

### যে Contract কখনও drift করা যাবে না

| Contract | কোথায় | mismatch-এর দাম |
|---|---|---|
| Rule id `PDM-R001`–`R052`, `PDM-X…` | `packages/analysis/src/rules/` | rename করলে ওই ruleId ধরা প্রতিটা `Issue` row অনাথ হয় |
| Prompt version `<FEATURE>_V<n>` | `packages/ai/src/prompts/` | version `inputHash`-এ থাকে — না বাড়িয়ে prompt বদলালে চিরকাল পুরোনো output serve হবে, নীরবে |
| Fixture id `F01`–`F30` | `packages/scanner/src/testing/fixtures.ts` | "F28 passes" মানে আর "no spurious drift" থাকে না |
| Queue ও job id | `packages/scanner/src/queue/queues.ts` | BullMQ runtime-এ `:` reject করে — production-এ |

Phase 19 না নামা পর্যন্ত **এই চারটার একটাও কিছু দিয়ে enforced নয়**।

---

## ৮. শেষ কথা

Engineering-এর মান এখানে সত্যিই উঁচু। [tenant.ts](packages/database/src/tenant.ts),
[guard.ts](packages/scanner/src/net/guard.ts),
[navigate.ts](packages/scanner/src/navigate.ts),
[free-scan.ts](src/server/services/free-scan.ts),
[turnstile.ts](packages/shared/src/turnstile.ts) — এই ফাইলগুলোতে **কেন** এক
সিদ্ধান্ত নেওয়া হলো আর বিকল্পটা কীভাবে ব্যর্থ হত, তা লেখা আছে। Fail-closed
default, evidence-ভিত্তিক finding, CI-enforced terminology — সবই আছে।

সমস্যাটা code-এর মানে নয়, **শৃঙ্খলায়**। গত কয়েকটা commit যা করেছে তার একটা
স্পষ্ট প্যাটার্ন আছে:

> **পুরো specification আর পুরো test suite মুছে ফেলা হয়েছে, কিন্তু সেগুলোর দিকে
> ইশারা করা documentation আর code comment রেখে দেওয়া হয়েছে।**

তাই আজ codebase-টা একইসাথে চমৎকার আর অরক্ষিত: `npm run verify` সবুজ, অথচ যে
চারটা contract ঐতিহাসিকভাবে **নীরবে** ভেঙেছিল, তার একটাও এখন পাহারায় নেই।
Phase 19 তাই প্রথম, আর আলোচনার বাইরে।

---

*Working tree, commit `6f6059c`, ২০২৬-০৯-০৪ থেকে derive করা। এই ডকুমেন্টের
প্রতিটা সংখ্যা repository পড়ে বের করা। যেখানে কিছু চালিয়ে যাচাই করা যায়নি,
সেখানে ✅ নয় — 🟢 বা 🔴 দেওয়া হয়েছে।*
