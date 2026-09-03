# UI ও Functionality Audit — `(app)` · `(admin)` · `(portal)` · `(onboarding)`

**তারিখ:** ২০২৬-০৯-০৪
**পদ্ধতি:** dev server চালিয়ে, একটা **সত্যিকারের authenticated Clerk session** দিয়ে (`e2e/auth.setup.ts`), seed করা demo data-র বিরুদ্ধে প্রতিটা surface browser-এ render করে screenshot নেওয়া হয়েছে। প্রতিটা page-এ মাপা হয়েছে: HTTP status, final URL (redirect ধরার জন্য), horizontal overflow, `<h1>` count, আর console error।

**কোড পড়ে অনুমান করা হয়নি** — প্রতিটা finding rendered page থেকে এসেছে, তারপর কোডে গিয়ে root cause যাচাই করা হয়েছে।

---

## ০. Audit setup (পুনরায় করার জন্য)

```bash
docker compose up -d
npm run db:seed && npm run db:seed:demo
npx tsx --env-file=.env scripts/e2e-account.ts   # ⚠️ npm run e2e:account কাজ করে না — F11 দেখুন
npm run dev
npx playwright test --project=setup              # e2e/.auth/user.json তৈরি করে
```

⚠️ **Demo data অন্য agency-তে যায়।** `seed-demo` "Northlight Digital (Demo)" (`org_northlight-demo`) তৈরি করে, কিন্তু E2E user থাকে "PDM Verification Agency"-তে। populated screen দেখতে আমি dev DB-তে দুটো agency-র `clerkOrgId` swap করেছি। **Audit শেষে ফেরত দিতে হবে** — §শেষ অংশ দেখুন।

---

## ১. সারসংক্ষেপ

| Surface | Page | দেখা হয়েছে | মোট রায় |
|---|---|---|---|
| `(app)` | 40 | 10 | ✅ শক্ত — evidence-first, ভালো empty state |
| `(admin)` | 15 | 3 | ✅ শক্ত — একটা contrast defect |
| `(portal)` | 7 | 1 (login) | 🟠 সবচেয়ে দুর্বল surface |
| `(onboarding)` | 1 | redirect যাচাই | 🟡 populated agency-তে skip হয় (সঠিক), fresh agency-তে যাচাই করা হয়নি |

**সব দেখা page-এ:** horizontal overflow **0px**, `<h1>` count **ঠিক 1**, HTTP **200**। কোনো crash, কোনো broken layout, কোনো 500 নেই।

**একটাই production blocker** পাওয়া গেছে (F01)। বাকিগুলো UX আর polish।

---

## ২. Findings

### 🔴 F01 — Sentry CSP-blocked: client-side error reporting সম্পূর্ণ অচল

**প্রতিটা** authenticated page-এ console error:

```
Fetch API cannot load https://o4511683680337920.ingest.de.sentry.io/api/.../envelope/
Refused to connect because it violates the document's Content Security Policy.
```

**Root cause:** [src/proxy.ts](src/proxy.ts) — `connect-src 'self' https://*.clerk.accounts.dev https://api.stripe.com wss://*.clerk.accounts.dev`। Sentry ingest domain নেই।

**কেন এটা গুরুতর:** `@sentry/nextjs` install করা, `sentry.client.config.ts` কনফিগার করা, DSN সেট করা — অর্থাৎ সবকিছু "কাজ করছে" মনে হচ্ছে। কিন্তু **browser প্রতিটা report refuse করছে**। Production-এ একটা client-side crash হলে কেউ কখনও জানবে না। এটা ঠিক সেই ধরনের নীরব ব্যর্থতা যা `AGENTS.md` বারবার সতর্ক করে: control-টা লেখা আছে, wired আছে, আর কাজ করে না।

**Fix:** `connect-src`-এ Sentry ingest origin যোগ করা।

---

### 🟠 F02 — AI "Recommended fix" card ভুল empty-state copy দেখায়

Issue detail page-এ দুটো AI card, দুটোতেই একই লেখা:

> "No AI explanation has been generated for this yet."

কিন্তু দ্বিতীয় card-টা **Recommended fix**, explanation নয়। [issue-ai-sections.tsx:166](src/components/ai/issue-ai-sections.tsx#L166) দুটোর জন্যই একই `t("ai.notGeneratedYet")` ব্যবহার করে।

**Fix:** per-feature empty message।

---

### 🟠 F03 — Issue detail-এ EVIDENCE section-এ কোনো evidence নেই

Issue page-এর "EVIDENCE" card-এ শুধু একটা link:

> View the scan that recorded this →

Product-এর মূল প্রতিশ্রুতি **evidence-backed finding**। `IssueEvidence` row database-এ আছে (seed বলছে "with IssueEvidence attached"), কিন্তু issue page-এ একটাও request URL, cookie name বা timestamp দেখায় না — অন্য page-এ পাঠিয়ে দেয়।

**প্রভাব:** যে agency client-কে ব্যাখ্যা করবে, তাকে দুটো page ঘুরতে হয়। "প্রতিটা finding recorded evidence-এ ফেরত যায়" দাবিটা UI-তে এক ক্লিক দূরে।

**Fix:** issue page-এ inline evidence rows (host, consent phase, timestamp) দেখানো, সাথে পূর্ণ scan-এর link রাখা।

---

### 🟠 F04 — Portal login: client-facing page যা অসমাপ্ত দেখায়

- CTA "Email me a link" **disabled দেখায়** — `disabled={pending || email.trim() === ""}` + `disabled:opacity-50` ([login-form.tsx:56](src/components/portal/login-form.tsx#L56))
- কোনো card/container নেই — সাদা page-এ ভাসমান text
- এটা **agency-র client** যে page-এ email link থেকে আসে

⚠️ **Branding নেই — এবং সেটা ঠিক আছে।** কোড-এ কারণ লেখা: agency জানার আগে logo দেখালে যে কেউ email দিয়ে agency enumerate করতে পারত। **এটা বদলানো যাবে না।**

**Fix:** button সবসময় live + submit-এ validate; একটা card container।

---

### 🟠 F05 — Website detail: একই address দুবার

Overview tab-এ:

```
Website address        https://meadowlark-clinic.test/
Address as entered     https://meadowlark-clinic.test/
```

দুটো label, একই মান। "Address as entered" শুধু তখনই অর্থবহ যখন normalization কিছু বদলেছে।

**Fix:** আলাদা হলেই দেখানো।

---

### 🟠 F06 — Website Overview tab প্রায় খালি

চারটে stat card + একটা settings card, তারপর ~500px ফাঁকা। যে page-টার নাম "Overview", সেখানে health trend নেই, recent scan নেই, recent issue নেই, tracker summary নেই — সব tab-এর পেছনে।

**Fix:** overview-তে সাম্প্রতিক scan আর open issue-র সারসংক্ষেপ আনা।

---

### 🟠 F07 — Websites list-এ label ছাড়া সংখ্যা

"OPEN POTENTIAL ISSUES" column-এ দুটো আলাদা জিনিস: একটা `⚠ 1 Critical` badge, তার পাশে একটা খালি `1` chip। দ্বিতীয় সংখ্যাটা কী তা কোথাও লেখা নেই। Meadowlark-এ শুধু `1`, কোনো badge নেই — তাই pattern-টাও অনুমান করতে হয়।

**Fix:** দ্বিতীয় সংখ্যাটায় accessible label + tooltip।

---

### 🟡 F08 — Admin sidebar section label AA fail করে

`text-neutral-500` (#737373) on `bg-neutral-900` (#171717) = **3.78:1**, AA-র 4.5:1 threshold-এর নিচে। "OPERATE" · "SUPPORT" · "TUNE" label গুলো।

`text-neutral-400` (#a3a3a3) দিলে **7.11:1**।

এটা `AGENTS.md` defect #9-এর একই শ্রেণি — চোখে দেখে design করা system মাপলে fail করে।

---

### 🟡 F09 — Issue detail-এ পাঁচটা প্রতিযোগী action

Header-এ: `Fix Recipe & Remediation` · `Acknowledge` · **`Resolve`** · `Ignore` · আর নিচে `Message to client`। কোনো grouping নেই, `Ignore` খালি text (affordance কম)।

**Fix:** primary + secondary রেখে বাকিগুলো overflow menu-তে।

---

### 🟡 F10 — Portal session page গুলো axe suite-এ নেই

`e2e/accessibility.spec.ts` এখন app (7) + public (16) cover করে, কিন্তু `(portal)`-এর একটাও page নেই — অথচ ওটাই একমাত্র surface যা agency-র client দেখে।

---

### 🟡 F11 — `npm run e2e:account` কাজ করে না

```
Error: CLERK_SECRET_KEY is required
```

`scripts/e2e-account.ts` `.env` load করে না, যেখানে `worker/src/index.ts` করে। `npx tsx --env-file=.env scripts/e2e-account.ts` দিয়ে চলে। CI-তে env inject হয় বলে ধরা পড়েনি, কিন্তু local-এ E2E setup প্রথম চেষ্টাতেই ভাঙে।

---

### ℹ️ F12 — Demo seed পরস্পরবিরোধী তারিখ তৈরি করে

Website "Added 3 Sept 2026" অথচ "Last scan: last week" আর issue "First detected 25 Jun 2026"। Product bug নয়, কিন্তু demo দেখানোর সময় অদ্ভুত লাগে।

---

## ৩. যা যাচাই করা হয়নি

সততার খাতিরে:

- **`(portal)` session page** (5টা) — portal magic-link session লাগত, তৈরি করিনি। শুধু `/portal/login` দেখা হয়েছে।
- **`(onboarding)`** — populated agency-তে `/app`-এ redirect হয় (সঠিক)। **Fresh, খালি agency-তে onboarding flow চালানো হয়নি**, তাই first-run experience অযাচাইকৃত।
- **`(app)`-এর 30টা page** — settings sub-page, website tab, report/client/tracker detail।
- **`(admin)`-এর 12টা page**।
- Keyboard navigation, screen reader, mobile viewport (authenticated surface-এ), Firefox/Safari/Edge।

---

## ৪. Fix status

| # | Finding | অবস্থা | যাচাই |
|---|---|---|---|
| F01 | Sentry CSP-blocked | ✅ **Fixed** | `connect-src`-এ origin এসেছে; প্রতিটা page-এ console error **4–10 → 0** |
| F02 | AI fix card ভুল copy | ✅ **Fixed** | per-card `emptyMessage` prop |
| F03 | Issue page-এ evidence নেই | ✅ **Fixed** | inline row render হয়: `Network request connect.facebook.net [No consent] 1.84s` |
| F04 | Portal login | ✅ **Fixed** | card container + CTA সবসময় live |
| F05 | Duplicate address | ✅ **Fixed** | আলাদা হলেই দেখায় |
| F07 | Label ছাড়া count chip | ✅ **Fixed** | `MutedBadge` এখন `label` নেয় (title + aria-label) |
| F08 | Admin contrast 3.78:1 | ✅ **Fixed** | `neutral-400` → **7.11:1** |
| F10 | Portal axe coverage | ✅ **Fixed** | `/portal/login` suite-এ যোগ |
| F11 | `e2e:account` ভাঙা | ✅ **Fixed** | `.env` load করে; `npm run e2e:account` এখন চলে |
| F06 | Website Overview খালি | ⏳ **বাকি** | বড় কাজ — নিচে দেখুন |
| F09 | পাঁচটা প্রতিযোগী action | ⏳ **বাকি** | বড় কাজ |
| F12 | Seed-এর পরস্পরবিরোধী তারিখ | ⏳ **বাকি** | demo data only, product bug নয় |

### F06 আর F09 কেন এখনও বাকি

দুটোই **product decision**, শুধু bug fix নয়:

- **F06** — Overview tab-এ কী দেখানো উচিত (health trend? সাম্প্রতিক scan? open issue?) সেটা ঠিক করলে tab গুলোর ভূমিকাও বদলায়। এটা information architecture-এর সিদ্ধান্ত, আমার একার নয়।
- **F09** — কোন action primary, কোনটা overflow menu-তে যাবে — সেটা agency-র আসল workflow জানার উপর নির্ভর করে। ভুল অনুমান করলে সবচেয়ে বেশি ব্যবহৃত action লুকিয়ে যাবে।

কোনটা কীভাবে চান বললে করে দেব।

---

## ৫. Dev database — ফেরত দেওয়া হয়েছে ✅

Audit-এর জন্য দুটো agency-র `clerkOrgId` swap করা হয়েছিল। **ফেরত দেওয়া হয়েছে**, আর একটা পার্শ্বপ্রতিক্রিয়াও ঠিক করা হয়েছে: Clerk org-name sync demo agency-র নাম বদলে "PDM Verification Agency" করে দিয়েছিল, সেটা "Northlight Digital (Demo)" ফিরিয়ে দেওয়া হয়েছে।

বর্তমান অবস্থা যাচাইকৃত — `org_northlight-demo` → Northlight (5 site), `org_3Ihs…` → PDM Verification Agency (0 site)।

⚠️ **শেখার বিষয়:** agency-র নাম Clerk থেকে sync হয়, DB থেকে নয়। `clerkOrgId` বদলালে পরের request-এ নাম overwrite হয়ে যায়।

---

*rendered page থেকে তৈরি, code পড়ে নয়। প্রতিটা finding-এর root cause কোডে যাচাই করা।*

---

# পরিশিষ্ট — Production Readiness Audit (কোডবেস-ব্যাপী)

**তারিখ:** ২০২৬-০৯-০৪। উপরের UI audit-এর পর পুরো codebase-এ চালানো।

## ✅ যা পরীক্ষা করে ভালো পাওয়া গেছে

| ক্ষেত্র | ফল |
|---|---|
| Committed secret | **নেই** — `.env*` gitignored, tracked file-এ কোনো live key নেই। দুটো `sk_live_` hit শুধু stripe-provision-এর নিরাপত্তা guard |
| Migration drift | **নেই** — 10 migration, "Database schema is up to date" |
| Webhook auth | Clerk · Stripe · Resend তিনটেই signature verify করে, secret না থাকলে **401 fail-closed** |
| Dockerfile | multi-stage, **non-root `USER`**, `npm ci --ignore-scripts`, HEALTHCHECK দুটোতেই |
| Readiness probe | fatal আর degraded আলাদা করে — fatal-এ 503, degraded-এ 200 |
| Worker shutdown | SIGTERM handler, প্রতিটা queue worker `close()` হয় |
| `console.log` | shipped code-এ **নেই** (শুধু seed CLI-তে) |
| npm audit | 3 high (`deepmerge-ts` via prisma) — কিন্তু `prisma` **devDependency**, production image-এ যায় না। Build-time only, defer করা সঠিক |

## 🔴 P01 — `PORTAL_TOKEN_SECRET` required কিন্তু undocumented

`src/server/admin/impersonation.ts` cross-tenant support ticket sign করে এই secret দিয়ে, আর না থাকলে **throw** করে (সঠিক — constant fallback হলে source পড়া যে কেউ ticket forge করতে পারত)। কিন্তু variable-টা `.env.example`-এ ছিল না।

**ফল:** documented contract মেনে deploy করলে admin impersonation runtime-এ ভাঙত, আর operator জানতেও পারত না variable-টার অস্তিত্ব আছে।

**Fixed:** `.env.example`-এ generation command সহ যোগ করা।

## 🔴 P02 — Admin health panel ভুল env var পড়ত

`admin/health.ts` আর `admin/queries.ts` `OPENAI_API_KEY` দেখে "OpenAI configured" রিপোর্ট করত। কিন্তু AI layer পড়ে **`AI_API_KEY`** (`packages/ai/src/config.ts:134,147`)।

**দুই দিকেই ভুল:** সঠিকভাবে configure করা deployment-এ dashboard বলত OpenAI **নেই**; আর যে variable-টা row-তে নাম করা ছিল সেটা সেট করলে বলত **আছে** অথচ AI বন্ধ।

Incident-এর সময় একটা ভুল বলা health panel না থাকার চেয়ে খারাপ — ভুল জায়গায় debug করতে পাঠায়।

**Fixed:** দুটোই `AI_API_KEY` পড়ে।

## 🟠 P03 — `ANALYTICS_SALT` চুপচাপ খালি হয়ে যেত

`domainHash()`-এর কোডেই লেখা: salt ছাড়া hash "cosmetic", কারণ registrable domain-এর space ছোট আর public — dictionary দিয়ে সেকেন্ডে reverse হয়। অথচ code `?? ""` করে, আর `ANALYTICS_SALT`/`PORTAL_TOKEN_SECRET` কোনোটাই documented ছিল না। **অর্থাৎ খালি salt-ই ছিল default path।**

**Fixed:** `.env.example`-এ যোগ করা।

## 🟠 P04 — `/api/public/analytics` unauthenticated, rate limit ছাড়া

Event-name allowlist আছে (আজেবাজে নাম আটকায়), property filter আছে — কিন্তু **volume নিয়ে কিছু নেই**। একটা script লুপে `pricing_viewed` পাঠিয়ে পুরো funnel metric অকেজো করতে পারত, আর metered analytics transport-এ সেটা আমাদের খরচে।

**Fixed:** IP-প্রতি 120/ঘণ্টা। IP salted-hash করে key বানানো হয় (raw IP Redis key-তেও রাখা হয় না), আর refuse করলেও 204 ফেরে — telemetry-র জন্য page কখনও error দেখাবে না।

## 🟠 P05 — Deploy workflow test চালাত না

`pr.yml`-এ পূর্ণ gate (lint, typecheck, terminology, migration, coverage, build, e2e)। কিন্তু `deploy.yml` trigger হয় `push: branches: [main]`-এ আর চালাত **শুধু তিনটে gate**।

অর্থাৎ **সরাসরি main-এ push করলে 1,072টা test একবারও না চালিয়ে production-এ যেত** — আর এই repo-তে ঠিক সেটাই হচ্ছে। "PR গুলো gated" শুধু তখনই নিরাপত্তা, যখন main-এ যাওয়ার প্রতিটা পথ PR।

**Fixed:** `validate` job-এ postgres + redis service, migration check আর `test:coverage` যোগ করা — `pr.yml`-এর সাথে হুবহু মিলিয়ে।

## 🟡 P06 — বাসি TODO: নতুন website-এ baseline scan enqueue হত না

`websites.ts`-এ লেখা ছিল "there is no queue until Phase 2, so `nextScanAt` is the only signal for now"। Queue বহু আগেই এসেছে, comment-টা behaviour আটকে রেখেছিল।

**ফল:** website add করার পর **৬০ সেকেন্ড পর্যন্ত** কিছুই হত না — user "Never scanned" দেখত, বুঝতে পারত না কিছু শুরু হয়েছে কিনা।

**Fixed:** commit-এর পরে `triggerScan(trigger: "ONBOARDING")`। ব্যর্থ হলে website creation ব্যর্থ **হয় না** (quota শেষ বা Redis down কোনোটাই "আপনার website যোগ হয়নি" বলার কারণ নয়) — `nextScanAt` fallback হিসেবে থাকে।

**Browser-এ যাচাই করা:** website যোগ করার পর সাথে সাথে `trigger=ONBOARDING, status=RUNNING` scan row তৈরি হয় আর Redis-এ job বসে। পরীক্ষার data মুছে ফেলা হয়েছে।

## যা এখনও যাচাই করা হয়নি

- Load/soak test, N+1 query profiling, index coverage আসল traffic-এ
- Backup restore drill (`scripts/restore-drill.sh` আছে, চালানো হয়নি)
- CI GitHub-এ সত্যিই চলতে দেখা হয়নি
- Production secret (Stripe/Resend/Turnstile webhook secret, verified email domain) — সবই environment, code নয়
