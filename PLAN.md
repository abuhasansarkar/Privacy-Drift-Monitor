# Privacy Drift Monitor — Production Implementation Plan

> **Automated Privacy & Consent Monitoring for Web Agencies**
>
> Single source of truth for building this product from an empty repository to a production SaaS.
> Version 1.0 · Target stack: Next.js 16.3.3 · React 19.2 · TypeScript 5 · PostgreSQL 16 · Prisma 6 · Redis 7 · BullMQ 5 · Playwright/Chromium · Clerk · Stripe · Resend · S3-compatible object storage · OpenAI (behind a provider abstraction)

---

## Document Map

| Part | Contents |
|---|---|
| [Part 0](#part-0--how-to-read-this-document) | How to read this document, core philosophy, non-negotiable rules |
| [Part I](#part-i--product-strategy) | Vision, ICP, personas, JTBD, differentiators, non-goals, terminology |
| [Part II](#part-ii--scope--roadmap) | MVP boundary, feature inventory, roadmap, moat |
| [Part III](#part-iii--information-architecture--page-specifications) | IA, every public page, every app page, admin, client portal, page inventory |
| [Part IV](#part-iv--the-scanner) | Playwright engine, consent engine, tracker/cookie/network engines, drift, risk, score, evidence, rules |
| [Part V](#part-v--data-architecture) | Prisma schema, indexes, tenancy, retention, DB inventory |
| [Part VI](#part-vi--application-architecture) | Auth, RBAC, API architecture + inventory, validation, issues, alerts, reports, white-label, client portal |
| [Part VII](#part-vii--asynchronous-architecture) | Redis, BullMQ, scan pipeline, scheduler, retries, scaling |
| [Part VIII](#part-viii--ai-architecture) | AIProvider, prompts, output contracts, safety, cost control, copilot |
| [Part IX](#part-ix--commercial-architecture) | Stripe, entitlements, pricing, unit economics, email, analytics, metrics |
| [Part X](#part-x--platform--operations) | Security, SSRF, abuse, errors, observability, Docker, CI/CD, env, backups, DR |
| [Part XI](#part-xi--design-system--ux) | Tokens, components, responsive, a11y, states, onboarding |
| [Part XII](#part-xii--execution-plan) | File map, phases 0–7, acceptance criteria, estimates, risk register, checklists, assumptions, open questions |

---

# Part 0 — How To Read This Document

## 0.1 The One Rule That Governs Everything

```
The scanner detects facts.
The rule engine determines technical findings.
The Privacy Drift engine detects changes.
The LLM explains those findings and recommends actions.
The agency decides what action to take.
```

This product must never become an unreliable "AI GDPR judge." Every claim the UI makes about a website traces back to a recorded browser event. The LLM is a **translation layer over verified evidence**, never a detector, never an oracle, never a source of truth.

## 0.2 Non-Negotiable Architectural Principles

**P1 — The deterministic scanner is the only source of truth.**
The LLM may never be the authority on whether a request happened, a cookie exists, storage changed, a consent button was clicked, a tracker fired, a scan succeeded, or a site was reachable. These come from Playwright instrumentation and rule-based processing only.

```mermaid
flowchart LR
  A[Playwright<br/>Chromium] --> B[Browser Events]
  B --> C[Evidence Collector]
  C --> D[Rule Engine]
  D --> E[Verified Findings]
  E --> F[LLM Interpretation]
  F --> G[UI]
  E --> G
  style E fill:#1e3a5f,color:#fff
  style F fill:#4a3418,color:#fff
```

Note the second edge: findings render in the UI **with or without** the LLM. AI is additive, never load-bearing.

**P2 — AI explains evidence; AI does not invent evidence.**
Every AI output carries `evidence_refs` that must resolve to real `IssueEvidence` primary keys. An output containing an unresolvable reference is rejected at the validation boundary and never reaches a user.

**P3 — Multi-tenant security by design.**
Agency A must never reach Agency B's websites, clients, scans, evidence, screenshots, reports, billing, or AI outputs. Enforced at the data-access layer, not by convention.

**P4 — Production-first design.**
No toy MVP that needs re-architecture at 100 customers. The scan pipeline, tenancy model, and evidence schema are built once, correctly.

**P5 — Start narrow.**
`Agency → Client Websites → Automated Privacy Monitoring → Consent Testing → Tracker Detection → Privacy Drift → Evidence → Alerts → Reports`. This is not an SEO platform, a security scanner, or an accessibility auditor.

**P6 — `PARTIAL` is a first-class outcome.**
An incomplete scan may never produce a clean verdict. If the reject-all phase failed, the product says so explicitly rather than reporting "no issues found."

## 0.3 Engineering Rules Enforced Throughout

**Code quality**
- TypeScript `strict: true`; `any` requires an inline justification comment and a lint suppression that names the reason.
- No business logic inside React components. Components render; `packages/*` and `apps/web/src/server/*` decide.
- Domain-oriented modules, small and focused. Centralized validation (Zod), centralized authorization, centralized error handling.

**Database**
- All schema changes ship as tracked Prisma migrations. No `db push` against any deployed environment.
- No destructive migration without an explicit reviewed expand/contract sequence (Part X §10.9).
- Every foreign key declared; every hot query path indexed; transaction boundaries explicit.

**API**
- Every input validated by a Zod schema before business logic runs.
- Every protected route authenticated; every tenant resource authorized against `agencyId`.
- Stable machine-readable error codes; documented rate limits; idempotency where repetition would duplicate state.

**Scanner**
- Never trust a target URL. SSRF guard on every navigation and every redirect hop.
- Browser workers isolated, resource-limited, timeout-bounded.
- Every finding traceable to stored evidence.

**AI**
- Structured input, structured output, schema validation, evidence grounding, explicit confidence, usage tracking, hard cost limits.

## 0.4 Framework Baseline — Verified Against Next.js 16.3.3

This repository ships `next@16.3.3`. Next.js 16 contains breaking changes relative to widely-known Next.js 13–15 patterns. The following were verified against the docs bundled at `node_modules/next/dist/docs/` and are **binding for all implementation work**:

| Area | Next.js 16.3.3 reality | Implication |
|---|---|---|
| App directory | Scaffold uses **`src/app/`**; `tsconfig.json` maps `@/*` → `./src/*` | Keep `src/`; monorepo path is `apps/web/src/app` |
| Edge middleware | **`middleware.ts` is deprecated and renamed to `proxy.ts`** | Write `apps/web/src/proxy.ts`. Node.js runtime only — setting `runtime` inside a proxy file **throws**. `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize` |
| Proxy coverage | Proxy does **not** reliably cover Server Actions (they POST to the invoking route) | Authorization must be re-checked **inside every Server Action**, never delegated to proxy matchers |
| Request APIs | `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are **Promises**; synchronous access was removed | `const { id } = await params` everywhere. Client Components read via React `use()` |
| Typegen helpers | `PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>` are **global, no import** | Use them instead of hand-written prop types; they require `next dev`/`next build`/`next typegen` to have run |
| Route Handlers | `GET` is **not cached by default** (changed in 15.0-RC) | No `dynamic = 'force-dynamic'` cargo-culting needed on API routes |
| Runtime | `runtime = 'edge'` is **deprecated**; `nodejs` is the default | All route handlers stay on Node.js — required anyway for Prisma/Redis |
| Bundler | **Turbopack is the default for `next dev` AND `next build`** | A custom `webpack` config makes `next build` **fail**. Use `turbopack.*` config keys |
| Linting | **`next lint` is removed**; the `eslint` key in `next.config` is removed | `package.json` already correctly declares `"lint": "eslint"` with flat config |
| Cache invalidation | `revalidateTag(tag, profile)` — **two arguments**; single-arg form is a TS error. New `updateTag()` (Server Actions only) and `refresh()` | Use `revalidateTag('trackers', 'max')` style calls |
| Cache Components | `cacheComponents: true` is top-level and subsumes PPR; `experimental.ppr` removed | **Kept OFF for v1.** A tenant-scoped dashboard is request-time by nature; enabling it surfaces build errors for uncached data outside `<Suspense>` with no benefit here. Revisit for the marketing site only |
| External packages | `serverExternalPackages` **already includes** `playwright`, `playwright-core`, `@prisma/client`, `prisma`, `pg`, `pino`, `sharp` | No config needed for these |
| Server Actions | 1 MB body limit; `allowedOrigins` CSRF check; config still under `experimental.serverActions` | **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be pinned and identical across all web containers** — mandatory for our multi-container deploy |
| Parallel routes | Every slot now requires an explicit `default.tsx` or the build fails | Provide `default.tsx` returning `null` for any slot we add |
| `after()` | Stable, but calling `cookies()`/`headers()` inside it **throws in a Server Component** (fine in Route Handlers / Server Functions) | Read request state before `after()` and close over the values |
| Images | Defaults changed: `qualities: [75]`, `minimumCacheTTL` 4 h, `maximumRedirects` 3, local IPs blocked | Declare `images.qualities` explicitly if we need anything other than 75 |
| Node | **≥ 20.9.0** required | Base images pin Node 22 LTS |
| Removed | AMP, `next lint`, `serverRuntimeConfig`/`publicRuntimeConfig`, `experimental.dynamicIO`, `experimental.useCache`, `experimental.ppr` | Do not reference these |
| Deprecated | `next/legacy/image`, `images.domains` (→ `remotePatterns`), `preferredRegion`, `unstable_cache` (→ `use cache`), `unstable_noStore` (→ `connection()`) | Avoid in new code |

**ASSUMPTION:** The project stays on the Next.js 16.x line through initial launch. A major-version upgrade is a scheduled maintenance task, not an ambient assumption.

## 0.5 Deployment Posture

**Decision: fully containerized, single provider.** Web and workers both ship as Docker images to one platform, with managed PostgreSQL and Redis from that same platform.

- **Primary target:** Fly.io (regional placement in `lhr`/`fra` for UK/EU data proximity, straightforward multi-process apps, private networking between web and workers).
- **Cost-optimized alternative:** Hetzner + Coolify, or Railway. Because everything is a container with no platform-specific primitives, migration is a deploy-config change.
- **Explicitly not used:** Vercel-specific features. No reliance on CDN-level ISR, no platform `waitUntil` contract for `after()`, no edge runtime.

Rationale: the workload is Chromium-heavy and long-running. Browser scans need multi-minute execution, hundreds of MB of RAM per context, and predictable CPU. That is a container workload, not a serverless one. Running the web tier in the same container model removes an entire class of "works on Vercel, not in the worker" divergence.

## 0.6 Commercial Posture

- **Billing currency:** USD via Stripe, with GBP and EUR display prices on the pricing page and localized Stripe Prices for checkout.
- **AI provider:** OpenAI as the default concrete implementation behind an `AIProvider` interface. Model IDs live in configuration; a provider swap is a config change plus one adapter class.

---

# Part I — Product Strategy

## 1.1 Vision

Every website an agency manages is a live, mutating system. A marketing team installs a new pixel through Google Tag Manager. A plugin update changes how the consent banner loads. A theme update inlines a font from a third-party CDN. A developer ships a chat widget that drops four cookies before anyone clicks anything.

None of these changes announce themselves. The agency finds out when the client forwards a complaint, or a regulator's letter, or a competitor's audit.

**Privacy Drift Monitor watches every client website continuously, in a real browser, and tells the agency the moment its privacy and consent behavior changes.**

## 1.2 Mission

Give agencies a continuous, evidence-backed record of how each client website actually behaves around consent and tracking — so they can detect regressions early, explain them credibly, fix them quickly, prove the work, and charge for it.

## 1.3 The Core Promise

> Monitor every client website automatically for consent, tracking, cookie, third-party script, and privacy-related changes — detect issues early, explain what happened, provide actionable fix guidance, and help agencies prove and monetize ongoing monitoring.

## 1.4 Ideal Customer Profile

**Firmographics**

| Attribute | ICP |
|---|---|
| Business type | Digital / web development / WordPress / SEO / PPC / marketing agency |
| Team size | 3–50 people |
| Websites managed | 10–200 client sites |
| Client geography | UK and EU (primary), plus any agency serving EU visitors |
| Existing offering | Website care plans, retainers, hosting, maintenance |
| Tech profile | Predominantly WordPress; some Shopify, Webflow, headless |
| Current privacy approach | Installed a CMP once at launch; no ongoing verification |
| Buying trigger | A client asked "are we compliant?" and the agency had no way to answer with evidence |

**Anti-ICP** (do not build for these)
- Single-site brands wanting a one-time compliance audit → they need a consultant, not monitoring.
- Enterprise legal/privacy teams needing DPIA workflows, RoPA, DSAR handling → different product, different buyer.
- Developers wanting a CI-time privacy linter → adjacent, but a different purchase and integration surface.

## 1.5 Buyer Persona vs. User Personas

The **buyer** is the agency owner or operations lead. The **users** are account managers and developers. The **beneficiary** is the client. This separation drives the product: the buyer needs proof and margin, the users need speed and clarity, the client needs a simple, branded artifact.

### Persona A — Agency Owner / Director ("Priya")
- **Role:** Runs a 12-person WordPress agency with 80 client sites on care plans.
- **Jobs to be done:** Know the portfolio's overall health without opening 80 tabs. Prove that the retainer buys something real. Add a line item to care plans without adding headcount.
- **Pains:** Cannot answer "which of our clients has a problem right now?" Manual spot-checks don't scale and aren't recorded. Care plans feel like an unjustified subscription to clients.
- **Success looks like:** A portfolio dashboard, a monthly branded report per client that goes out automatically, and a defensible £X/month uplift on every care plan.
- **Primary surfaces:** Dashboard, Reports, Billing, Branding.

### Persona B — Account Manager ("Tom")
- **Role:** Owns 25 client relationships; not deeply technical.
- **Jobs to be done:** Understand what an alert means. Explain it to a non-technical client without sounding alarmist or evasive. Track whether the dev team fixed it.
- **Pains:** Technical findings are unreadable. Translating them takes 30 minutes and risks saying something wrong. No way to see resolution status.
- **Success looks like:** Opens an issue, reads a plain-English explanation, clicks "Generate client message," edits two sentences, sends it.
- **Primary surfaces:** Issues, AI client-message generator, Reports, Client portal.

### Persona C — Developer ("Marcus")
- **Role:** Fixes the sites. Deeply skeptical of automated scanners.
- **Jobs to be done:** See the exact request, the exact cookie, the exact consent state. Reproduce it. Fix it. Verify the fix.
- **Pains:** Scanners that say "you have a violation" with no evidence. False positives that waste an afternoon. No re-verification loop.
- **Success looks like:** Opens evidence, sees `connect.facebook.net/en_US/fbevents.js` fired at 1,842 ms under `consent_state=not_given`, with the initiator chain, the screenshot, and the rule ID. Fixes it. Clicks "Re-scan to verify."
- **Primary surfaces:** Website detail → Evidence, Scan detail, Issue detail, AI fix guidance.

### Persona D — Client ("Sarah, marketing lead at the client company")
- **Role:** The agency's contact. Non-technical. Never logs into anything if she can avoid it.
- **Jobs to be done:** Know the site is being watched. Know if something's wrong. Have something to show her own boss.
- **Pains:** Doesn't know what she's paying the agency for. Gets vague reassurance instead of status.
- **Success looks like:** A monthly branded PDF in her inbox, and (optionally) a simple portal with a health score and a short list of current items.
- **Primary surfaces:** Emailed PDF report; Client Portal (read-only, simplified).

### Persona E — SaaS Admin (us)
- **Role:** Operates the platform.
- **Jobs to be done:** Keep scans succeeding. Catch queue backlogs before customers do. Manage the tracker database. Contain AI spend. Investigate abuse. Support customers without impersonating them carelessly.
- **Primary surfaces:** Admin panel — scan queue, failed scans, tracker DB, AI usage, system health, agency management, audit log.

## 1.6 Jobs To Be Done (consolidated)

| # | JTBD | Persona | Product answer |
|---|---|---|---|
| J1 | "Tell me when a client site starts behaving differently around tracking." | A, B | Privacy Drift engine + alerts |
| J2 | "Tell me which of my 80 sites needs attention *today*." | A | Dashboard Attention Center, portfolio health |
| J3 | "Show me proof, not an opinion." | C | Evidence system, raw network/cookie/screenshot records |
| J4 | "Explain this in language I can forward to a client." | B | AI issue explanation + client message generator |
| J5 | "Tell me exactly how to fix it." | C | AI fix recommendation with verification steps |
| J6 | "Prove the fix worked." | C, A | Verification re-scan and issue → Verified transition |
| J7 | "Give me something branded to send monthly." | A, D | White-label PDF reports, scheduled |
| J8 | "Let me sell this as a service line." | A | Client portal, white-label, per-client reporting |
| J9 | "Don't make me babysit it." | A | Scheduled scans, digests, quiet hours |
| J10 | "Don't cry wolf." | C | Confidence scoring, ignore rules, FP suppression |

## 1.7 Product Differentiators

1. **Drift, not snapshots.** Competitors run a scan and grade you. We maintain a longitudinal record and alert on *change*. A site that was fine in January and broke in March is the actual problem agencies have.
2. **Consent-state attribution.** Every network request, cookie, and storage key is tagged with the consent state it occurred under, across four separate simulated visitor journeys. This is the technical foundation everything else rests on and is genuinely hard to build.
3. **Evidence-first, AI-second.** Findings are deterministic and inspectable. AI adds interpretation on top. Most competitors either have no AI or have AI as the detector.
4. **Multi-site portfolio management.** Built for someone with 80 sites, not one. Grouping, bulk actions, per-client rollups, portfolio dashboards.
5. **Agency-native commercial layer.** White-label reports, client portals, branding isolation — the product is designed to be resold.
6. **Reject-All and Withdrawal testing.** Most tools test "does a banner exist." We test whether Reject All actually rejects and whether withdrawal actually stops tracking — which is where real regressions hide.

## 1.8 Competitive Positioning

| Category | Examples | Their shape | Our wedge |
|---|---|---|---|
| CMP vendors | Cookiebot, CookieYes, Usercentrics, Complianz | Sell the banner; scan to populate their own cookie declaration | We are vendor-neutral and monitor whether *their* product is working. Selling to the agency, not the site owner. |
| One-off audit tools | Free cookie checkers, Lighthouse-style scanners | Single snapshot, single URL, no history | Continuous monitoring, portfolio scale, drift detection |
| Enterprise privacy suites | OneTrust, TrustArc | DPIA/RoPA/DSAR governance for legal teams; six-figure contracts | Technical, agency-priced, no legal-workflow surface |
| Uptime/care-plan monitors | Uptime Robot, ManageWP, WP Umbrella | Uptime, updates, backups, performance | Same buyer, same care-plan budget, adjacent slot they don't fill |

**Positioning statement:**
> For web agencies managing multiple client websites, Privacy Drift Monitor is a continuous privacy and consent monitoring platform that detects when a site's tracking behavior changes and provides the technical evidence and plain-English explanation needed to fix it — unlike one-off cookie scanners, which grade a single snapshot and leave you to notice the next regression yourself.

## 1.9 Value Proposition by Persona

- **Owner:** "Know the privacy health of every client site, automatically, and turn it into a billable service line."
- **Account manager:** "Understand and explain any privacy issue in under five minutes."
- **Developer:** "Get the exact request, cookie, and consent state — then verify your fix."
- **Client:** "See that your site is being watched, with a monthly report."

## 1.10 Use Cases

**Primary**
1. Continuous monitoring of a portfolio of client sites for consent/tracking regressions.
2. Detecting a newly-added tracker (e.g. marketing installed a TikTok pixel via GTM without telling anyone).
3. Verifying that Reject All genuinely blocks non-essential tracking.
4. Producing monthly white-labeled monitoring reports per client.
5. Onboarding audit of a newly-won client's site.

**Secondary**
6. Pre-launch verification before a site goes live.
7. Post-incident evidence gathering ("when did this start?").
8. Lead generation via the public free scanner.
9. Justifying a care-plan price increase with a demonstrated deliverable.
10. Vendor inventory — knowing which third parties each client site talks to.

## 1.11 Non-Goals and Product Boundaries

**Explicitly out of scope — permanently:**
- Legal advice, compliance certification, or any assertion that a site "is compliant."
- DPIA, RoPA, DSAR, or privacy-governance workflow.
- Acting as a CMP. We monitor consent tools; we do not sell one.
- Automatically modifying client websites.

**Out of scope for v1 (may return later):**
- SEO, performance, accessibility, or security scanning. Adjacent temptations that would dilute the product.
- Full-site crawling of hundreds of pages per scan.
- Mobile-app SDK monitoring.
- Native Shopify/Webflow apps.

**Boundary statement to repeat in the UI and in sales material:**
> Privacy Drift Monitor is a technical monitoring system. It records observable browser behavior and flags potential issues for review. It does not provide legal advice and does not determine legal compliance.

## 1.12 Approved Terminology

This vocabulary is **binding on UI copy, email templates, PDF reports, and every AI prompt.**

| Use | Never use |
|---|---|
| Potential issue | Violation |
| Potential consent violation *(only with qualifier)* | Illegal / unlawful |
| Tracker detected before consent | GDPR breach |
| Review recommended | You must / You are required to |
| Technical evidence | Proof of non-compliance |
| Observed request / detected behavior | Confirmed violation |
| Technical monitoring | Compliance certification |
| This may require review by your privacy advisor | This is legal advice |
| Detected · Not detected · Could not be determined | Compliant · Non-compliant |

**Implementation note:** ship `packages/shared/src/copy/terminology.ts` exporting the approved phrases, and a CI check (`scripts/check-terminology.ts`) that greps `apps/`, `packages/`, and `emails/` for the forbidden list. AI system prompts include the forbidden list explicitly (Part VIII §8.7).

---

# Part II — Scope & Roadmap

## 2.1 MVP Boundary

The MVP is defined by one sentence: **an agency can add a client website, have it scanned on a schedule, be alerted when its privacy behavior changes, understand why, and send the client a branded report.**

### In MVP

| Area | Included |
|---|---|
| Tenancy | Agency accounts, team members, roles, invitations |
| Auth | Clerk (email + Google), Clerk Organizations ↔ Agency mapping |
| Clients | CRUD, website assignment, contacts |
| Websites | CRUD, validation, grouping, pause/resume, CSV import/export, scan frequency |
| Scanner | Playwright/Chromium, homepage + up to N configured pages, 4 consent phases |
| Consent | Adapters for CookieYes, Cookiebot, Complianz, OneTrust, Usercentrics + generic heuristic |
| Detection | Network requests, cookies, localStorage/sessionStorage, scripts, third-party domains |
| Trackers | Seeded vendor database with categories and risk levels |
| Rules | Deterministic rule engine, ~24 launch rules |
| Drift | Scan-to-scan diff, drift events, drift feed |
| Scoring | Explainable 0–100 Privacy Health Score |
| Evidence | Full evidence records + screenshots in S3 |
| Issues | Lifecycle, filters, assignment, ignore rules |
| Alerts | Email + in-app; immediate / daily / weekly; quiet hours |
| Reports | 3 types, white-labeled, async PDF to S3 |
| Client portal | Read-only overview, issues, reports, scan history |
| AI | Issue explanation, fix recommendation, drift summary, client message |
| Billing | Stripe checkout + portal, 4 plans, trials, entitlements |
| Public | Marketing site, pricing, free scanner, legal pages |
| Admin | Agencies, scans, queue, tracker DB, AI usage, system health, flags |

### Deliberately excluded from MVP
Slack/Teams/webhooks · public API · Jira/Trello/Asana · WordPress plugin · natural-language search · Privacy Copilot · sitemap-driven crawling · multi-region scanning · scheduled report auto-send beyond monthly · SSO/SAML · custom domains for the client portal.

## 2.2 Feature Inventory

Priority: **P0** = MVP-blocking, **P1** = MVP-complete, **P2** = fast-follow, **P3** = later.
Difficulty: **S / M / L / XL**. Business value: **1–5**.

| Feature | User pain solved | Priority | MVP? | Dependencies | Difficulty | Value |
|---|---|---|---|---|---|---|
| Agency account + team | Multiple staff need access with different rights | P0 | ✅ | Clerk | M | 4 |
| Client records | Sites must roll up to a billable client | P0 | ✅ | Agency | S | 4 |
| Website CRUD + validation | Adding a site must fail loudly on bad URLs | P0 | ✅ | SSRF guard | M | 5 |
| CSV import/export | 80 sites can't be added by hand | P1 | ✅ | Website CRUD | S | 4 |
| Website grouping | Portfolio needs structure | P1 | ✅ | Website CRUD | S | 3 |
| Playwright scan engine | Static scanners miss runtime behavior | P0 | ✅ | Worker, Redis | XL | 5 |
| Consent adapter framework | Every site uses a different CMP | P0 | ✅ | Scan engine | XL | 5 |
| Four-phase consent testing | The real regressions hide in Reject/Withdraw | P0 | ✅ | Adapters | L | 5 |
| Network request capture | Foundation of all detection | P0 | ✅ | Scan engine | M | 5 |
| Cookie capture + attribution | Cookies are what clients ask about | P0 | ✅ | Scan engine | M | 5 |
| Storage capture | Trackers hide in localStorage | P0 | ✅ | Scan engine | M | 4 |
| Tracker vendor database | Raw domains mean nothing to an AM | P0 | ✅ | Seed data | L | 5 |
| Tracker classification engine | Turn requests into named vendors | P0 | ✅ | Vendor DB | L | 5 |
| Deterministic rule engine | Findings must be reproducible | P0 | ✅ | All collectors | L | 5 |
| Evidence storage | Developers won't trust unevidenced claims | P0 | ✅ | S3, schema | M | 5 |
| Screenshots | Visual proof of banner state | P1 | ✅ | S3 | M | 4 |
| **Privacy Drift engine** | The core differentiator | P0 | ✅ | Scan history | L | 5 |
| Privacy Health Score | One number for the portfolio view | P1 | ✅ | Rule engine | M | 4 |
| Issue lifecycle | Findings must be workable, not just listed | P0 | ✅ | Rule engine | M | 5 |
| Ignore rules / FP suppression | One false positive destroys trust | P1 | ✅ | Issues | M | 5 |
| Verification re-scan | Prove the fix worked | P1 | ✅ | Scan engine | M | 4 |
| Dashboard | "What needs me today?" | P0 | ✅ | Everything | M | 5 |
| Scan scheduling | Monitoring must be automatic | P0 | ✅ | BullMQ repeatable | M | 5 |
| Email alerts | Agencies live in email | P0 | ✅ | Resend | M | 5 |
| In-app notifications | Context-switch-free triage | P1 | ✅ | Schema | S | 3 |
| Digests + quiet hours | Alert fatigue kills the product | P1 | ✅ | Alerts | M | 4 |
| PDF reports | The billable artifact | P0 | ✅ | Worker, S3 | L | 5 |
| White-label branding | Agencies resell; branding must be theirs | P0 | ✅ | Reports | M | 5 |
| Client portal | Client-facing proof of work | P1 | ✅ | Portal auth | L | 4 |
| AI issue explanation | AMs can't read raw findings | P0 | ✅ | AIProvider | M | 5 |
| AI fix recommendation | Devs want the shortest path | P1 | ✅ | AIProvider | M | 4 |
| AI drift summary | "What changed this week?" in one paragraph | P1 | ✅ | Drift engine | M | 4 |
| AI client message | Turns 30 minutes into 2 | P1 | ✅ | AIProvider | S | 5 |
| Stripe billing | Revenue | P0 | ✅ | Stripe | L | 5 |
| Entitlements service | Plan logic must live in one place | P0 | ✅ | Plans | M | 4 |
| Free public scanner | Top of funnel | P1 | ✅ | Scan engine, abuse controls | L | 4 |
| Marketing site | Acquisition | P0 | ✅ | — | M | 4 |
| Admin panel | Operating the platform | P0 | ✅ | RBAC | L | 4 |
| Audit log | Trust, support, forensics | P1 | ✅ | Schema | S | 3 |
| Feature flags | Safe rollout | P1 | ✅ | Schema | S | 3 |
| Slack alerts | Some agencies live in Slack | P2 | ❌ | Alerts | M | 3 |
| Outbound webhooks | Custom integration | P2 | ❌ | Alerts | M | 3 |
| Public REST API | Power users, integrations | P2 | ❌ | Auth, keys | L | 3 |
| Sitemap-driven page discovery | Deeper coverage | P2 | ❌ | Scanner | M | 3 |
| AI root-cause analysis | "Why did this happen?" | P2 | ❌ | AI, drift | L | 4 |
| AI unknown-tracker classification | Long tail of vendors | P2 | ❌ | AI | M | 4 |
| Jira / Trello / Asana | Dev workflow | P3 | ❌ | API | M | 2 |
| Privacy Copilot | Conversational analysis | P3 | ❌ | AI, query layer | XL | 4 |
| Natural-language search | Portfolio querying | P3 | ❌ | Query layer | L | 3 |
| WordPress plugin | Distribution + convenience | P3 | ❌ | API | L | 4 |
| Automated fix verification | Close the loop fully | P3 | ❌ | Verification scan | L | 4 |

## 2.3 Post-Launch Roadmap

**V1.1 — Reduce friction (≈6 weeks after launch)**
Slack integration · outbound webhooks · 4–6 additional CMP adapters driven by real miss data · sitemap-based page discovery · tracker DB expansion from unknown-domain telemetry · client portal polish · scheduled report auto-send.

**V1.5 — Depth (≈3 months)**
AI root-cause analysis · AI unknown-tracker classification · developer task generation · public REST API with scoped keys · Jira/Trello integration · custom scan schedules · comparison view between arbitrary scans · per-client aggregate reporting.

**V2 — Platform (≈6–9 months)**
Privacy Copilot (scoped conversational assistant) · natural-language portfolio search over a controlled query layer · WordPress plugin (connect + status + deep link only) · Shopify/Webflow connectors · automated fix verification workflow · advanced reseller features (agency sub-accounts, margin reporting) · multi-region scanning.

## 2.4 The Moat

The defensibility is **not** the AI. Anyone can call an LLM. The moat compounds from:

1. **Historical scan data.** After 12 months of monitoring 5,000 sites, we hold a longitudinal record of privacy behavior that cannot be back-filled. A new competitor starts with zero history and therefore cannot detect drift for months.
2. **The consent-state engine.** Reliably driving arbitrary CMPs across four consent journeys, in iframes, on SPAs, behind bot protection, is months of accumulated edge-case handling. Each customer site that breaks an adapter improves the adapter.
3. **Tracker intelligence.** A vendor database refined by real observations — including the long tail of regional and niche vendors — plus per-vendor cookie and script signatures.
4. **The evidence model.** A schema that ties every finding to a reproducible browser event is a design investment competitors typically skip and then cannot retrofit.
5. **Agency workflow.** Multi-site management, white-label reporting, client portals, and the resale motion create switching costs at the *business model* level, not just the data level.
6. **AI grounded in proprietary evidence.** The AI is only differentiated because of what it is grounded in. The moat is the grounding, not the model.

```mermaid
flowchart TD
  A[More agencies] --> B[More sites monitored]
  B --> C[More scan history]
  B --> D[More CMP edge cases hit]
  B --> E[More unknown domains observed]
  C --> F[Better drift detection]
  D --> G[Better consent adapters]
  E --> H[Richer tracker database]
  F --> I[Better product]
  G --> I
  H --> I
  I --> A
```

---

# Part III — Information Architecture & Page Specifications

## 3.1 Complete Information Architecture

```
PUBLIC (marketing.* / apex)
├── /                          Home
├── /features                  Feature overview
│   ├── /features/consent-testing
│   ├── /features/tracker-detection
│   ├── /features/privacy-drift
│   └── /features/white-label-reports
├── /how-it-works              Pipeline explainer
├── /pricing                   Plans + FAQ
├── /free-scanner              Lead-gen scanner
│   └── /free-scanner/[token]  Public result page
├── /resources                 Hub
│   ├── /blog                  Index
│   ├── /blog/[slug]           Article
│   └── /guides/[slug]         Long-form guides
├── /about
├── /contact
├── /login                     Clerk
├── /signup                    Clerk
├── /legal/terms
├── /legal/privacy
├── /legal/cookie-policy
└── /legal/disclaimer

AGENCY APP (authenticated, /app)
├── /app                                   Dashboard
├── /app/onboarding                        First-run wizard
├── /app/websites                          List
│   ├── /app/websites/new                  Add flow
│   ├── /app/websites/import               CSV import
│   └── /app/websites/[websiteId]          Detail
│       ├── ?tab=overview
│       ├── ?tab=issues
│       ├── ?tab=trackers
│       ├── ?tab=cookies
│       ├── ?tab=consent
│       ├── ?tab=changes
│       ├── ?tab=scans
│       ├── ?tab=evidence
│       ├── ?tab=reports
│       ├── ?tab=ai
│       └── ?tab=settings
├── /app/clients                           List
│   ├── /app/clients/new
│   └── /app/clients/[clientId]            Detail
├── /app/issues                            Cross-portfolio issue queue
│   └── /app/issues/[issueId]              Detail
├── /app/trackers                          Portfolio vendor inventory
│   └── /app/trackers/[trackerId]          Vendor detail
├── /app/scans                             Scan history (all sites)
│   └── /app/scans/[scanId]                Scan detail
├── /app/drift                             Privacy Drift feed
├── /app/reports                           Report library
│   ├── /app/reports/new                   Generate
│   └── /app/reports/[reportId]            Detail / download
├── /app/alerts                            Alert rules + history
├── /app/notifications                     Notification center
├── /app/ai                                AI assistant (flagged)
├── /app/team                              Members + invitations
├── /app/billing                           Plan, usage, invoices
├── /app/settings
│   ├── /app/settings/general
│   ├── /app/settings/branding
│   ├── /app/settings/notifications
│   ├── /app/settings/scanning
│   ├── /app/settings/ai
│   ├── /app/settings/security
│   └── /app/settings/integrations
└── /app/help

ADMIN (/admin, SUPER_ADMIN only)
├── /admin                     Ops dashboard
├── /admin/agencies            + /[agencyId]
├── /admin/users
├── /admin/websites
├── /admin/scans               + /[scanId]
├── /admin/queue               Live BullMQ view
├── /admin/issues
├── /admin/trackers            Vendor DB CRUD  + /[trackerId]
├── /admin/ai-usage
├── /admin/billing
├── /admin/system-health
├── /admin/logs                Audit + system logs
├── /admin/feature-flags
└── /admin/settings

CLIENT PORTAL (/portal, separate simplified session)
├── /portal                    Overview
├── /portal/issues             + /[issueId]
├── /portal/reports            + /[reportId]
├── /portal/scans
└── /portal/settings           Contact + notification prefs only
```

**Route-group mapping in `apps/web/src/app`:**

```
src/app/
├── (marketing)/          → public pages, own layout, static-friendly
├── (auth)/               → /login, /signup, Clerk catch-all routes
├── (app)/                → /app/**, AppShell layout, auth-gated
├── (admin)/              → /admin/**, SUPER_ADMIN-gated
├── (portal)/             → /portal/**, portal-session-gated
└── api/                  → Route Handlers
```

Route groups keep four distinct layouts and four distinct auth postures physically separated, so an unauthenticated page can never accidentally inherit an authenticated shell.

---

## 3.2 Public Website — Page Specifications

Shared across all marketing pages:
- **Layout:** `(marketing)/layout.tsx` — sticky transparent-on-scroll header, footer, cookie banner (our own — we must be exemplary), skip-to-content link.
- **Header:** logo · Features · How It Works · Pricing · Resources · **Free Scanner** (ghost) · Login · **Start Free Trial** (primary).
- **Footer:** 4 columns (Product / Resources / Company / Legal), the disclaimer line, social links, copyright.
- **SEO defaults:** `generateMetadata` per page; canonical URL; OG image via `opengraph-image.tsx`; JSON-LD `Organization` + `SoftwareApplication` in the root marketing layout.
- **Analytics:** `page_viewed` on every page with `{ path, referrer, utm_* }`.
- **Responsive:** single-column below 768px; nav collapses to a `Sheet` drawer.
- **Rendering:** static by default; no `cookies()`/`headers()` in marketing pages so they prerender at build.

---

### `/` — Homepage

| | |
|---|---|
| **Purpose** | Convert an agency visitor into a trial signup or a free scan |
| **Audience** | Persona A (owner) primarily, B secondarily |
| **Primary CTA** | Start Free Trial (14 days, no card) |
| **Secondary CTA** | Scan a website free |

**Sections**

1. **Hero** — H1: *"Detect privacy and consent changes across every client website — automatically."* Sub: *"Privacy Drift Monitor watches your clients' sites in a real browser, tests what happens before consent, after Reject All, and after withdrawal — and tells you the moment something changes."* Two CTAs, plus an inline URL field that deep-links into the free scanner. Right side: dashboard screenshot with an animated "3 trackers added" drift card.
   *UX:* URL field validates on blur; Enter submits to `/free-scanner?url=`. Reduced-motion users get a static image.

2. **Problem** — Three cards: *"Plugins update themselves." / "Marketing adds pixels through GTM." / "Nobody checks until a client complains."* Framing, not fear.

3. **How it works (condensed)** — 4-step horizontal stepper: Add sites → We scan in a real browser → We compare against last time → You get told what changed. Links to `/how-it-works`.

4. **Core benefits** — 3 columns: *Catch regressions early · Explain them in seconds · Prove the work monthly.*

5. **Runtime scanning** — Explains why a real browser matters: a static HTML fetch cannot see GTM-injected pixels, lazy-loaded widgets, or SPA-route tracking. Side-by-side "static scanner sees / we see" visual.

6. **Privacy Drift** — The differentiator section. Animated diff card: `+3 trackers · +5 third-party domains · Reject All regression`. Copy: *"A snapshot tells you today. Drift tells you what changed."*

7. **AI explanations** — Screenshot of an issue with plain-English explanation. Explicit trust copy: *"Grounded in recorded browser evidence. Every explanation links to the request, cookie, and screenshot behind it."*

8. **Agency workflow** — Portfolio grid mock: 80 sites, 3 needing attention. Copy aimed at Persona A.

9. **White-label reports** — Branded PDF mockup with a placeholder agency logo.

10. **Client portal** — Simplified portal screenshot; "give clients a login, not a spreadsheet."

11. **Social proof** — Logos + 2–3 testimonials. **Until real customers exist this section renders a "Built with agencies in the UK and EU" trust strip instead — never fabricated logos or invented testimonials.**

12. **Pricing preview** — 4 compact plan cards, link to `/pricing`.

13. **FAQ** — 6 accordion items: Does it slow my client's site? (No — we visit externally, we don't install anything.) Do you replace my CMP? (No.) Is this legal advice? (No.) What if the site is behind a login? What CMPs do you support? How often do you scan?

14. **Final CTA** — Repeat trial CTA + free scanner.

**Components:** `Hero`, `ProblemGrid`, `StepperCompact`, `BenefitColumns`, `ComparisonVisual`, `DriftDemoCard`, `FeatureScreenshot`, `LogoStrip`, `PricingPreview`, `FAQAccordion`, `CTABand`.
**Analytics:** `hero_cta_clicked`, `hero_url_submitted`, `pricing_preview_plan_clicked`, `faq_item_opened`, `cta_band_clicked`.
**States:** hero URL field — invalid URL inline error; screenshots use `next/image` with blur placeholders.

---

### `/features` — Feature Overview

**Purpose:** Convert an evaluating visitor who needs to know it's technically real.
**Primary CTA:** Start Free Trial · **Secondary:** Free scan.

Sticky sub-nav (anchor links) over 12 feature blocks, each: icon · headline · 2-sentence body · screenshot or diagram · optional "learn more" to a sub-page.

| Block | Key message |
|---|---|
| Runtime browser scans | Real Chromium, real page execution — not an HTML fetch |
| Consent testing | Four journeys: no consent, Reject All, Accept All, withdraw |
| Tracker detection | Named vendors and categories, not raw domains |
| Cookie monitoring | Full attributes, attributed to consent state |
| Privacy Drift | Change detection across scans |
| Risk scoring | Transparent, rule-based severity |
| Evidence | Every finding backed by a recorded event |
| Alerts | Email + in-app, immediate or digested |
| Reports | Branded PDFs on demand or monthly |
| AI assistant | Explanations and fix guidance over recorded evidence |
| White-label | Your logo, colors, and contact details |
| Client portal | Read-only client access |

Sub-pages `/features/consent-testing`, `/features/tracker-detection`, `/features/privacy-drift`, `/features/white-label-reports` follow one template: hero · how it works (3 steps) · technical detail (with a real evidence screenshot) · limitations (honest) · FAQ · CTA. The limitations block is a deliberate trust play and also serves the §57 requirement.

**Analytics:** `feature_block_viewed` (IntersectionObserver, once per block), `feature_learn_more_clicked`.

---

### `/how-it-works` — Pipeline Explainer

**Purpose:** Make a skeptical technical evaluator believe the mechanism.

Vertical scrollytelling through 8 stages, each with a visual:

```
Add Websites → Scan → Test Consent → Detect Trackers
→ Compare Changes → Alert → Explain → Report
```

1. **Add Websites** — paste URLs or import CSV; we validate reachability and store a baseline.
2. **Scan** — headless Chromium loads the page like a first-time visitor and records every network request, cookie, and storage write.
3. **Test Consent** — the same page is loaded four times in four isolated browser contexts: no interaction, Reject All, Accept All, withdraw. Everything recorded is tagged with which journey it happened in.
4. **Detect Trackers** — requests, scripts, cookies, and storage keys are matched against a vendor database to produce named vendors with categories.
5. **Compare Changes** — the new scan is diffed against the previous one to produce drift events.
6. **Alert** — rules fire; issues are created; alerts go out by email and in-app.
7. **Explain** — AI reads the *verified findings* and writes an explanation grounded in the evidence.
8. **Report** — a branded PDF is generated asynchronously and stored for the client.

Include the pipeline Mermaid diagram (Part VII §7.4) rendered as an SVG asset. Add a "What we can and can't see" honesty block near the bottom.

**Analytics:** `how_it_works_stage_viewed`, `how_it_works_cta_clicked`.

---

### `/pricing` — Plans

**Purpose:** Qualify and convert. **Primary CTA:** Start Free Trial. **Secondary:** Talk to us (Agency plan).

**Sections:** headline · monthly/annual toggle (annual = 2 months free) · currency selector (USD / GBP / EUR — display only; **billing is USD**, with localized Stripe Prices where available) · 4 plan cards · full comparison table · usage explainer ("what counts as a scan?") · white-label callout · FAQ (10 items) · CTA.

Full plan definitions, entitlement dimensions, and margin rationale are in Part IX §9.2–§9.4.

**UX:** annual toggle animates price and shows "save $X"; the "Most popular" plan is visually elevated; the comparison table becomes a horizontally scrollable card stack on mobile; every entitlement row has a tooltip.
**Analytics:** `pricing_viewed`, `pricing_interval_toggled`, `pricing_currency_changed`, `pricing_plan_cta_clicked {plan, interval}`, `pricing_faq_opened`.
**SEO:** JSON-LD `Product` + `Offer` per plan.

---

### `/free-scanner` — Public Lead-Generation Scanner

The highest-risk public surface: it accepts an arbitrary URL from an unauthenticated user and drives a browser at it. Abuse controls are not optional.

**Flow**

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Validating: submit URL
  Validating --> Idle: invalid / blocked (inline error)
  Validating --> Challenge: passes format + SSRF checks
  Challenge --> Queued: Turnstile token verified
  Challenge --> Idle: challenge failed
  Queued --> Running: worker picks up (priority: low)
  Running --> Results: scan completes or partially completes
  Running --> Failed: unreachable / timeout / blocked
  Results --> Gated: show limited findings
  Gated --> [*]: signup CTA
  Failed --> [*]: explain + offer retry
```

**Restrictions for anonymous scans**

| Control | Value | Rationale |
|---|---|---|
| Consent phases | `no-consent` only | Full 4-phase costs ~4× and is the paid value |
| Pages | Homepage only | Cost |
| Timeout | 45 s hard | Bound worker occupancy |
| Screenshot | 1 (banner state) | Cost |
| Results retained | 7 days, then purged | Data minimization |
| Findings shown | Count of all + full detail on top 3 by severity | Enough value to be credible, enough gap to convert |
| Evidence detail | Domain + tracker name only; no full URLs, no cookie values | Prevents scraping our detection logic |
| AI explanation | Not available | Cost + abuse |
| Drift | Not available (needs history) | Natural upsell |

**Abuse controls**

| Layer | Rule |
|---|---|
| Turnstile | Cloudflare Turnstile required before enqueue; token verified server-side, single-use |
| IP rate limit | 3 scans / hour, 10 / day per IP (Redis sliding window) |
| Domain rate limit | 1 scan / 24 h per registrable domain, globally across all anonymous users |
| Global circuit breaker | If the free-scan queue exceeds 200 waiting jobs, new submissions get "high demand, try later" |
| Queue isolation | Dedicated `scan:free` queue, low priority, capped concurrency — **cannot starve paying customers** |
| SSRF | Full guard (Part X §10.3), identical to authenticated scans |
| Blocklist | Admin-maintained domain blocklist; automatic block after 3 consecutive failures on a domain |
| Email gate | Results page is viewable without email; **the PDF download and the "monitor this site" action require an email** |

**Results page (`/free-scanner/[token]`)**
Health score gauge · consent banner detected? (CMP name if known) · trackers found before consent (count + top 3 named) · cookies before consent (count) · third-party domains (count) · a blurred "locked" panel listing what monitoring would add (Reject All testing, withdrawal testing, drift, alerts, reports) · CTA: **"Monitor this website — start free trial"** which pre-fills the URL into signup.

Token is a 32-byte URL-safe random ID; the page is public but unguessable; `noindex`.

**Conversion funnel + events**
`free_scan_submitted` → `free_scan_completed` → `free_scan_result_viewed` → `free_scan_email_captured` → `free_scan_signup_clicked` → `signup_completed` (attributed via a `free_scan_token` cookie carried through signup).

**Error states:** `Website unreachable` · `Scan timed out` · `This site is protected by a bot challenge we can't pass` · `We can't scan this address` (SSRF block — deliberately vague) · `Too many scans from your network` · `We're at capacity right now`.

---

### `/login` and `/signup`

Clerk-hosted components mounted at catch-all routes `(auth)/login/[[...rest]]/page.tsx` and `(auth)/signup/[[...rest]]/page.tsx`, styled with the Clerk `appearance` object to match our tokens.

- **Methods:** email + password, Google OAuth, email magic link.
- **After signin:** redirect to `/app`; if the user has no agency, to `/app/onboarding`.
- **After signup:** always `/app/onboarding`.
- **Invitation flow:** `/signup?invitation=<token>` binds the new user to the inviting agency and pre-fills email; the token is validated server-side before Clerk renders.
- **Free-scan carry-through:** `free_scan_token` cookie is read in the onboarding wizard to pre-fill the first website.

---

### Legal Pages

All four render MDX from `content/legal/*.mdx` through one `LegalLayout` (max-w prose, generated table of contents, "Last updated" date, print stylesheet).

| Page | Must contain |
|---|---|
| `/legal/terms` | Service definition, acceptable use (**explicit prohibition on scanning sites you don't control or have permission to scan**), account terms, payment terms, trial terms, cancellation, limitation of liability, warranty disclaimer, IP, governing law, changes |
| `/legal/privacy` | What we collect (account data, scan data, usage analytics), lawful bases, our sub-processors (Clerk, Stripe, Resend, OpenAI, our host, our object storage), retention periods per data class, data-subject rights, international transfers, security measures, contact |
| `/legal/cookie-policy` | Our own cookies enumerated with purpose and duration — this page must be exemplary; a privacy monitoring product with a bad cookie policy is not credible |
| `/legal/disclaimer` | The central legal boundary statement |

**Disclaimer core text (also embedded in every PDF report and shown at onboarding):**

> Privacy Drift Monitor is a technical monitoring service. It observes and records the behavior of websites in an automated browser and applies deterministic rules to that recorded behavior in order to surface potential issues for human review.
>
> It does not provide legal advice, does not constitute a legal assessment, and does not certify compliance with the GDPR, the UK GDPR, the ePrivacy Directive, or any other law or regulation.
>
> Automated scanning has technical limitations. It may not detect every tracking technology, may not be able to interact with every consent management platform, and may report behavior that is expected in context. Findings are described as *potential* issues and are intended as a starting point for review by you and, where appropriate, by a qualified legal advisor.
>
> You are responsible for determining the legal obligations that apply to any website you monitor and for deciding what action to take.

---

### `/resources`, `/blog`, `/guides`, `/about`, `/contact`

- **`/resources`** — hub linking blog, guides, and a "CMP compatibility" reference table showing which platforms we support and at what confidence. That table is genuinely useful SEO and doubles as honest limitation disclosure.
- **`/blog` + `/blog/[slug]`** — MDX in `content/blog/`, front-matter (title, description, publishedAt, updatedAt, author, tags, ogImage). `generateStaticParams` + `generateMetadata`. JSON-LD `Article`. Reading time, ToC, related posts, newsletter capture.
- **`/guides/[slug]`** — same machinery, long-form, gated download optional.
- **`/about`** — mission, team, why we built it, contact.
- **`/contact`** — form (name, email, agency, site count, message, topic) → Zod validated → Turnstile → Resend to support + confirmation to sender → `contact_form_submitted`. Success/error inline states; honeypot field.

---

## 3.3 Authenticated Agency App — Shared Shell

**Layout** (`(app)/layout.tsx`, Server Component):
- Resolves the Clerk session, maps to `AgencyMember`, and injects `AgencyContext` (agency id, name, plan, entitlements, role, branding, timezone) via a Client Component provider.
- Redirects: no session → `/login`; session but no agency → `/app/onboarding`; suspended agency → `/app/billing?suspended=1`.

**Sidebar** (collapsible, persisted to `localStorage`):
```
Dashboard · Websites · Clients · Issues [badge: open count]
Trackers · Privacy Drift · Scans · Reports
──────────
Alerts · Notifications [badge: unread]
AI Assistant  (flag: ai_assistant)
──────────
Team · Billing · Settings · Help
```
Items are filtered by role — a Viewer never sees Billing.

**Header:** breadcrumbs · global search (`⌘K` → `Command` palette over websites, clients, issues, trackers) · scan-activity indicator (live count of running scans) · notification bell · user menu (profile, agency switcher if multi-agency, theme, sign out).

**Global behaviors:**
- Every list page: `Skeleton` rows on load, purposeful empty state, error boundary with retry.
- Every destructive action: `AlertDialog` confirmation; irreversible ones require typing the resource name.
- Every mutation: `Toast` on success/failure; optimistic update where safe, rollback on error.
- Keyboard: `⌘K` search, `g d` dashboard, `g w` websites, `g i` issues, `?` shortcuts sheet, `Esc` closes overlays. Focus is trapped in dialogs and restored on close.
- Mobile: sidebar → `Sheet`; tables → card lists; filter bars → bottom `Drawer`.

---

## 3.4 `/app` — Dashboard

**Purpose:** answer "what needs my attention right now?" in under five seconds.
**Permissions:** all roles. Viewer sees the same widgets minus action buttons.

**Widgets**

1. **Summary strip** — 7 stat tiles: Websites Monitored · Healthy · Warnings · Critical · Scans Today · New Issues (24 h) · Drift Events (7 d). Each tile is a filter link into the relevant list. Trend arrow vs. the previous equivalent period.
   *API:* `GET /api/dashboard/summary`

2. **Attention Center** — the most important component on the page. A prioritized, deduplicated list of things a human should look at, ordered by a computed urgency score:
   - Critical issues (newest first)
   - New trackers detected in the last 7 days
   - Consent regressions (Reject All stopped working)
   - Failed scans (3+ consecutive failures on one site)
   - Websites with no successful scan in > 2× their scan interval
   Each row: severity dot · website · one-line description · relative time · quick actions (View · Acknowledge · Re-scan). Empty state: *"Nothing needs your attention. 47 websites monitored, all scanned within the last 24 hours."*
   *API:* `GET /api/dashboard/attention`

3. **Privacy Health Trend** — line chart, portfolio average score over 30/60/90 days, with drift events as annotation markers. Hovering a marker shows what changed.
   *API:* `GET /api/dashboard/health-trend?days=30`

4. **Privacy Drift Summary** — 7-day rollup: *"7 websites changed · 3 trackers added · 2 consent regressions · 1 new unknown vendor."* Each clause links into `/app/drift` pre-filtered.
   *API:* `GET /api/dashboard/drift-summary?days=7`

5. **Websites Needing Attention** — compact table, top 10 by lowest health score, columns: site · client · score · open issues · last scan.

6. **Recent Activity** — reverse-chronological feed: scan completed, issue created, issue resolved, website added, report generated, member joined. Paginated by cursor, 20 at a time.
   *API:* `GET /api/dashboard/activity?cursor=`

**States:** skeletons per widget (independent, so a slow widget doesn't block the page); each widget has its own error boundary showing "Couldn't load — retry"; the whole-page empty state (zero websites) replaces everything with an onboarding CTA card.
**Mobile:** widgets stack; summary strip becomes a 2-column grid; chart height reduced; Attention Center rows become cards.
**Analytics:** `dashboard_viewed`, `attention_item_clicked {type}`, `dashboard_widget_error {widget}`.

---

## 3.5 `/app/websites` — Website Management

**Layout:** filter bar · view toggle (table / grid) · results · pagination.

**Table columns:** checkbox · Website (favicon + domain + name) · Client · Status (Active/Paused/Error badge) · Health Score (colored pill) · Open Issues (severity-split badges) · Trackers (count) · Last Scan (relative + status icon) · Next Scan · row actions (`⋯` → View, Scan now, Edit, Pause/Resume, Move to group, Archive).

**Grid view:** cards with a screenshot thumbnail, domain, score ring, issue counts, last scan. Better for small portfolios and for visual recognition.

**Filters:** search (domain/name, debounced 300 ms) · client · group · status · health-score range · has-critical-issues · scan frequency · last-scan-before. Filters are URL-serialized (`?client=x&status=active`) so views are shareable and back-navigable.

**Sort:** health score, last scan, open issues, domain, date added.

**Bulk actions** (selection-aware toolbar): Scan now · Pause · Resume · Assign to client · Move to group · Change frequency · Export selected · Archive. Bulk scan checks entitlement capacity first and reports "12 of 15 queued — monthly scan limit reached."

**Entry points:** `Add Website` (primary) · `Import CSV` · `Export CSV`.

**Permissions:** view — all; add/edit/pause — Manager+; archive/delete — Admin+; scan now — Developer+.
**Empty state:** *"No websites yet. Add your first client website to start monitoring privacy behavior."* + Add + Import buttons + link to the free scanner.
**Mobile:** cards only; filters in a bottom drawer; bulk selection via long-press.
**API:** `GET /api/websites` (cursor paginated), `POST /api/websites/bulk`, `GET /api/websites/export`.
**Analytics:** `websites_viewed`, `website_filter_applied {filter}`, `websites_bulk_action {action, count}`, `websites_view_toggled {view}`.

---

## 3.6 Add Website Flow

A 4-step `Dialog` wizard (`/app/websites/new`, also reachable as a modal).

```mermaid
flowchart TD
  A[Step 1: Enter URL] --> B{Format valid?}
  B -->|No| A
  B -->|Yes| C[Normalize: lowercase host, strip www?, resolve scheme]
  C --> D{SSRF guard passes?}
  D -->|No| E[Reject: 'We can't monitor this address']
  D -->|Yes| F[Reachability probe: DNS + HEAD/GET]
  F -->|DNS fail| G[Error: domain not found]
  F -->|TLS fail| H[Warn: certificate problem — allow with acknowledgment]
  F -->|4xx/5xx| I[Warn: returned status N — allow, monitoring may be limited]
  F -->|Redirect| J[Show final URL, ask which to monitor]
  F -->|Bot challenge| K[Warn: protected by a challenge, scans may be partial]
  F -->|OK| L[Step 2: Client + group assignment]
  J --> L
  H --> L
  I --> L
  K --> L
  L --> M[Step 3: Scan frequency + priority + page list]
  M --> N{Entitlement capacity available?}
  N -->|No| O[Upgrade prompt]
  N -->|Yes| P[Step 4: Review + create]
  P --> Q[Persist Website + queue baseline scan]
  Q --> R[Redirect to website detail, scan progress live]
```

**Step 1 — URL.** Single input, `https://` prefix hint, paste-friendly. Validation runs server-side via a Server Action (`validateWebsiteUrl`) so the SSRF guard and DNS resolution happen where they can be trusted. Shows a live status line: *Checking DNS… Checking reachability… Looks good.*

**Normalization rules** (`packages/shared/src/url/normalize.ts`):
- Lowercase scheme and host; strip default ports; strip fragment; strip trailing slash on the root path.
- Preserve path if the user supplied one (some clients monitor a specific landing page).
- `http://` is upgraded to `https://` for the probe; if HTTPS fails and HTTP succeeds, store `http://` and raise a `PDM-R022` insecure-transport issue (Medium).
- `www` is **not** stripped — `www.x.com` and `x.com` can behave differently. Store the canonical form the server actually reached after redirects, and record `originalUrl` separately.
- Store `registrableDomain` (eTLD+1 via the Public Suffix List) as a separate indexed column — the drift engine and third-party classification both need it.

**Validation error matrix**

| Condition | Behavior | User message |
|---|---|---|
| Malformed URL | Block | "That doesn't look like a valid website address." |
| Non-http(s) scheme | Block | "We can only monitor http and https addresses." |
| Resolves to private/loopback/link-local/metadata IP | Block, log security event | "We can't monitor this address." (deliberately vague) |
| DNS NXDOMAIN | Block | "We couldn't find that domain. Check the spelling." |
| TLS certificate invalid | Allow with acknowledgment checkbox | "This site has a certificate problem. We can still monitor it, but browsers may warn visitors." |
| Connection refused / timeout | Allow with warning | "We couldn't reach this site right now. We'll add it and keep trying." |
| HTTP 401/403 | Allow with warning | "This site requires authentication. We can only monitor publicly reachable pages." |
| Cloudflare / bot challenge detected | Allow with warning | "This site is protected by a bot challenge. Some scans may be incomplete." |
| Redirect chain > 3 | Block probe, allow manual final URL | "This address redirects too many times." |
| Redirects to a different registrable domain | Ask | "This redirects to `example.org`. Which should we monitor?" |
| Already monitored by this agency | Block | "You're already monitoring this website." + link |
| Entitlement limit reached | Block | "You've reached your plan's website limit (25 of 25)." + upgrade CTA |

**Step 2 — Assignment.** Client combobox with inline "Create new client"; optional group; optional internal label and notes.
**Step 3 — Scan config.** Frequency (Daily / Weekly / Monthly, gated by plan) · priority (Normal / High, High gated) · additional pages (up to plan limit; default: homepage only) · alert profile (Default / Critical only / Silent).
**Step 4 — Review.** Summary card, "Run first scan now" checkbox (default on), Create.

On create: `Website` row is persisted, an `AuditLog` entry is written, a baseline scan is enqueued at high priority, and the user lands on the website detail page with a live scan progress panel (Part XI §11.7).

---

## 3.7 `/app/clients` — Client Management

**List:** table — Client (logo/initials + name) · Websites (count) · Health (average score) · Open Issues · Portal Access (Enabled/Disabled badge) · Last Report · actions.
**Filters:** search, has-portal-access, has-critical-issues, sort by name/health/site count.

**Client detail (`/app/clients/[clientId]`)** — tabs:
- **Overview** — aggregate health, site count, open issues by severity, recent activity, next scheduled report.
- **Websites** — assigned sites, assign/unassign.
- **Issues** — issues across all this client's sites.
- **Reports** — reports scoped to this client; generate new.
- **Portal** — enable/disable, invited portal users, invitation status, revoke access, portal activity log.
- **Settings** — name, logo, primary contact (name/email/phone), billing reference, internal notes (**never shown in the portal or in reports**), archive.

**Data model:** `Client { id, agencyId, name, slug, logoUrl?, contactName?, contactEmail?, contactPhone?, notes?, portalEnabled, archivedAt? }` — see Part V.
**Permissions:** view all; create/edit Manager+; portal toggle Admin+; archive Admin+.
**Empty state:** *"No clients yet. Clients group websites together for reporting and portal access."*

---

## 3.8 `/app/websites/[websiteId]` — Website Detail

**Header:** favicon · domain (external link) · client chip · status badge · health score ring with delta vs. previous scan · actions (`Scan now`, `Generate report`, `Pause`, `⋯`).
**Sub-header:** last scan (relative + duration + status) · next scan · CMP detected · scan frequency.
**Tabs** are URL-driven (`?tab=`) so every tab is linkable and back-navigable.

### Tab: Overview
Score breakdown card (the five weighted components with their point contributions — see Part IV §4.12) · open issues by severity · tracker summary donut by category · consent test result matrix (4 phases × pass/fail/undetermined) · 30-day score sparkline · latest banner screenshot · "what changed since last scan" mini-diff.

### Tab: Issues
Filtered issue table scoped to this website: severity · title · rule ID · status · first detected · last seen · assignee. Bulk acknowledge/ignore. Same component as `/app/issues` with a locked website filter.

### Tab: Trackers
Table of detected trackers: vendor (logo + name) · category badge · risk level · **first seen under consent state** (the critical column — `Before consent` in red) · request count · first detected date · last seen · confidence. Filter by category, consent state, new-since-last-scan. Row expands to show the matching requests and cookies. "Unknown" vendors are grouped at the bottom with a "Suggest classification" action (V1.5 AI).

### Tab: Cookies
Table: name · domain · party (1st/3rd) · category (via vendor mapping) · expiry (session / duration) · `Secure` · `HttpOnly` · `SameSite` · **set under consent state** · first detected. Grouped by consent phase with a comparison toggle: *Before consent (7) · After Reject (7) · After Accept (34) · After Withdraw (12)*. Cookies present after Reject All that are non-essential are highlighted.

### Tab: Consent
The CMP report card. CMP detected (name, version if available, detection confidence) · banner screenshots for each phase · per-phase result cards:

| Phase | What we did | Result |
|---|---|---|
| No consent | Loaded the page, touched nothing, waited 10 s | 3 marketing trackers fired ❌ |
| Reject All | Clicked "Reject All" | 1 marketing tracker still firing ❌ |
| Accept All | Clicked "Accept All" | 14 trackers fired ✅ (expected) |
| Withdraw | Re-opened preferences, withdrew consent | 2 trackers continued ❌ |

Each result links to its evidence. If a phase could not be executed, it renders `Could not be determined` with the reason (adapter not found / button not located / timeout) — never a pass.

### Tab: Changes (Privacy Drift)
Timeline of drift events, newest first. Each event card: date · scan link · change type badge · human summary (*"Meta Pixel added"*) · before/after mini-table · severity · linked issue if one was created · AI drift narrative (if generated). Filters: change type, severity, date range. Compare-any-two-scans selector at the top.

### Tab: Scans
Table: started · duration · status (Completed / Partial / Failed) · trigger (Scheduled / Manual / Verification / API) · pages · issues found · score · initiated by. Row → scan detail. Failed rows show the error category inline.

### Tab: Evidence
The developer's tab. Faceted browser over all evidence for the most recent scan (with a scan selector): network requests (filter by domain, resource type, consent state, third-party, tracker) · cookies · storage entries · console errors · screenshots. Request rows expand to show method, status, resource type, initiator chain, timestamp offset, size, and the tracker it matched. Export as JSON/CSV (permission-gated, audit-logged).

### Tab: Reports
Reports scoped to this website; generate new; download; delete.

### Tab: AI
AI-generated artifacts for this website: latest drift summary, per-issue explanations already generated, client message drafts. Each shows model, token cost, generation time, and a "regenerate" action (entitlement-checked). Every artifact has a "view underlying evidence" link.

### Tab: Settings
Name/label · client assignment · group · monitored pages list · scan frequency · priority · alert profile · issue ignore rules for this site · custom consent adapter override (advanced, with selector overrides for `acceptSelector` / `rejectSelector` / `preferencesSelector`) · basic-auth credentials for staging sites (encrypted at rest, Admin+ only) · pause · archive · delete.

**Permissions:** Viewer sees all tabs read-only except Evidence export and Settings (hidden). Developer gets Evidence + Scan now. Manager+ gets everything except delete.

---

## 3.9 `/app/scans/[scanId]` — Scan Detail

**Header:** website · started/finished timestamps (in the user's timezone) · duration · status badge · trigger · scanner version · Chromium version · re-run action.

**Sections**

1. **Metadata card** — scan ID (copyable), scanner engine version, browser build, viewport, user agent, worker ID, region, queue wait time, total duration, per-phase durations.
2. **Phase timeline** — horizontal timeline of the four consent phases with duration bars and status icons; clicking a phase filters everything below to that phase.
3. **Results summary** — trackers found, cookies set, third-party domains contacted, requests captured, storage keys written, issues created, score with delta.
4. **Consent test results** — the same matrix as the website Consent tab, scoped to this scan.
5. **Evidence viewer** — the core technical component:
   - **Requests** — virtualized table (thousands of rows): time offset · method · URL (truncated, expandable) · resource type · status · size · domain · 1st/3rd party · consent phase · matched tracker. Filters: phase, third-party only, tracker-matched only, resource type, domain search. Row expands to headers-summary (**redacted per Part X §10.6**), initiator chain, and timing.
   - **Cookies** — as the website Cookies tab, scoped to this scan, with a phase comparison diff.
   - **Storage** — localStorage/sessionStorage keys with truncated, redacted values.
   - **Console** — captured console errors and page errors (useful for explaining a partial scan).
   - **Screenshots** — gallery per phase, lightbox, download.
6. **Issues created by this scan** — list with severity and rule ID.
7. **Errors and warnings** — if `PARTIAL` or `FAILED`: a structured explanation of what failed, at which phase, with the error code, plus what could not therefore be tested. This block is prominent, not buried.

**Performance:** the requests table can hold 5,000+ rows — use TanStack Virtual, server-side pagination at 200/page, and lazy-load evidence bodies on expand.
**Permissions:** Developer+ for the evidence viewer; Viewer sees summary sections only.

---

## 3.10 `/app/issues` and `/app/issues/[issueId]`

**List** — the cross-portfolio triage queue.
Columns: severity · title · website · client · rule ID · status · assignee · first detected · last seen · age.
Filters: severity (multi) · status (multi) · website · client · category · assignee · date range · rule ID · has-evidence · confidence threshold.
Saved views: "My critical issues", "New this week", "Unassigned", "Consent regressions". Stored per user in `UserPreference`.
Bulk: acknowledge · assign · ignore (with reason) · resolve · generate report.

**Detail page** — a strict, repeatable narrative order:

1. **Header** — severity badge · title · website · status dropdown · assignee picker · actions (Acknowledge, Resolve, Ignore, Reopen, Re-scan to verify, Create report).
2. **What happened** — one deterministic sentence produced by the rule engine (never AI): *"A Meta Pixel request was observed before any consent was given."*
3. **Why this matters technically** — static, rule-authored copy explaining the technical significance in approved terminology. Not AI-generated, because it must be identical every time.
4. **Evidence** — the request(s), cookie(s), storage entries, screenshot, consent state, timestamp offset, detection rule ID, and confidence. Expandable to the full evidence viewer.
5. **When detected** — first seen, last seen, occurrence count, the scan that first surfaced it, and a sparkline of occurrences over time.
6. **What changed** — if the issue originated from a drift event, the before/after diff.
7. **AI explanation** — generated on demand (button) or automatically for Critical issues if the agency has enabled it. Shows: summary · technical reason · likely cause · confidence · evidence references (each a link) · a persistent "AI-generated from the evidence above" label · thumbs up/down feedback.
8. **Recommended action** — AI fix recommendation: ordered steps · affected system (CMP / GTM / theme / plugin / hard-coded) · risk of the fix · verification steps · confidence.
9. **Developer task** — copy-to-clipboard formatted task text (title, description, evidence links, acceptance criteria).
10. **Activity** — status changes, assignments, comments, re-scans, all timestamped and attributed.

**Issue lifecycle** (state machine in Part VI §6.5).
**Permissions:** view all; status change Developer+; ignore Manager+ (with mandatory reason); assign Manager+.
**Empty state:** *"No potential privacy issues detected in the latest scan."* — with the scan date so it's clear the emptiness is fresh, not stale.

---

## 3.11 Remaining App Pages (specified)

### `/app/trackers` — Portfolio Tracker Inventory
Which vendors appear across the whole portfolio and where. Table: vendor · category · risk · websites affected (count → drill-down) · total detections · first seen in portfolio · trend (7 d/30 d). Filters: category, risk, new-this-period, unknown-only. A "Portfolio vendor exposure" chart. Detail page `/app/trackers/[trackerId]`: vendor profile (domains, cookies, scripts, documentation link), all agency websites where it appears with consent-state breakdown, timeline of when it appeared on each.

### `/app/drift` — Privacy Drift Feed
Chronological feed across every website. Filters: change type, severity, website, client, date range. Grouped by day with day-level rollups (*"March 14 — 4 websites changed"*). Each event card: website · type badge · summary · before → after · linked scan · linked issue · AI narrative. This page is the product's signature view; it should feel like a monitoring timeline, not a table.

### `/app/reports` — Report Library
List: name · type · scope (agency / client / website) · period · generated · generated by · status (Queued/Generating/Ready/Failed) · size · actions (Download, View, Regenerate, Delete, Share link).
`/app/reports/new`: type selector (Scan / Issue / Monthly Monitoring / Website Health / Privacy Drift) → scope selector → period → options (include evidence appendix, include AI summary, include resolved issues, include screenshots) → branding preview → Generate. Generation is asynchronous with a live progress indicator and an email/in-app notification on completion.
`/app/reports/[reportId]`: metadata, inline PDF preview (`<iframe>` on a signed URL), download, regenerate, share (time-limited signed link, audit-logged).

### `/app/alerts` — Alert Rules & History
Two tabs. **Rules:** list of alert rules with type, scope (all sites / group / client / single site), channels, schedule (immediate / daily digest / weekly digest), threshold, quiet hours, enabled toggle. Create/edit in a dialog. **History:** every alert sent — type, trigger, channel, recipients, sent time, delivery status from Resend webhooks.

### `/app/notifications` — Notification Center
Unread/All tabs · filter by type · mark all read · each row deep-links to the issue/site/report/scan. Cursor-paginated. The header bell shows unread count and a popover of the latest five.

### `/app/ai` — AI Assistant (feature-flagged)
MVP: a task-oriented panel, not a chat. Cards for the available AI actions (Explain an issue · Summarize this week's drift · Draft a client message · Summarize a website's status), each opening a form with a scoped selector and producing a validated, evidence-linked output. Shows remaining AI credits for the period. V2 replaces this with the conversational Copilot (Part VIII §8.10).

### `/app/team` — Team & Invitations
Members table (avatar, name, email, role, status, last active, joined) with role change and remove. Pending invitations with resend/revoke. Invite dialog (email + role + optional website-scope restriction). Role reference table shown inline. Seat count vs. plan limit with an upgrade prompt at the ceiling.

### `/app/billing`
Current plan card (name, price, interval, renewal date, status) · usage meters (websites, scans this period, AI credits, team seats, storage) each with a percentage bar and an over-limit state · Change plan (opens Stripe Checkout for upgrades, Stripe Portal for downgrades/cancellation) · Manage billing (Stripe Portal) · invoice history (from Stripe, cached) · payment method · billing email · VAT/tax ID field. Trial banner with days remaining. Past-due banner with a retry-payment CTA.

### `/app/settings/*`
- **General** — agency name, website, logo, address, timezone, date format, default scan frequency, default alert profile.
- **Branding** — logo (light + dark), primary/accent colors with contrast validation, company name, report footer text, custom disclaimer text, contact email, portal subdomain preference. Live preview of a report cover and a portal header. **Entitlement-gated on `whiteLabel`.**
- **Notifications** — per-type channel matrix (in-app / email), digest frequency, quiet hours with timezone, per-website overrides, weekly summary opt-in.
- **Scan Settings** — default frequency, default page limit, default priority, screenshot policy (always / on change / never), evidence retention (within plan limits), custom user-agent suffix, respect-robots.txt toggle (**default on**), global ignore rules (domain patterns to exclude from third-party classification, e.g. the agency's own CDN).
- **AI Settings** — enable/disable AI features globally, auto-explain critical issues toggle, model tier preference (Standard / Advanced, mapped to concrete models in config), monthly credit cap, per-feature toggles, usage chart.
- **Security** — active sessions (via Clerk), 2FA enforcement for the agency (Clerk org setting), audit log viewer with filters and CSV export, API keys (V1.5, placeholder disabled state), IP allowlist (V2 placeholder).
- **Integrations** — connected services. MVP shows Stripe/Resend/Clerk as platform-managed (informational), with Slack, Webhooks, Jira, Trello, Zapier and WordPress as "Coming soon" cards that capture interest (`integration_interest_registered`) — this is cheap demand data.

### `/app/help`
Searchable help articles (MDX), FAQ, "Contact support" form that pre-fills agency/user context, system status link, changelog link, keyboard shortcut reference.

### `/app/onboarding`
See Part XI §11.9.

---

## 3.12 Admin Panel (`/admin`)

Gated by `SUPER_ADMIN`, which is **not** an agency role — it is a platform-level flag on `User` checked in `(admin)/layout.tsx` and re-checked in every admin route handler. Admin access is fully audit-logged, including reads of tenant data.

| Page | Contents |
|---|---|
| `/admin` | Total agencies (by plan) · active websites · scans today (succeeded/partial/failed) · failed-scan rate · critical issues created today · AI spend today/MTD · MRR · queue depths · worker health · error rate · p95 API latency |
| `/admin/agencies` | Search/filter by plan, status, size, signup date. Detail: profile, members, websites, usage vs. entitlements, billing state, scan history, AI spend, support notes, actions (suspend, reactivate, extend trial, grant credits, change plan, **impersonate — time-limited, reason-required, heavily audit-logged**) |
| `/admin/users` | All users, agency memberships, last active, Clerk link, disable |
| `/admin/websites` | All monitored websites across tenants; find problem sites (consecutive failures, chronic timeouts, bot-challenge sites); force re-scan; blocklist |
| `/admin/scans` | All scans, filter by status/error category/duration/worker; detail identical to the agency scan view plus worker logs and the raw job payload |
| `/admin/queue` | Live BullMQ state per queue: waiting, active, completed, failed, delayed, paused. Actions: retry job, retry all failed, remove, pause/resume queue, drain. Job inspector showing data, attempts, stack trace, timings |
| `/admin/issues` | Cross-tenant issue analytics: rule firing frequency, false-positive feedback rate per rule, severity distribution — the primary input for rule tuning |
| `/admin/trackers` | Vendor DB CRUD: name, category, risk, domain patterns, script patterns, cookie patterns, docs URL, confidence, aliases. Bulk import/export JSON. **Unknown-domain queue** — observed domains not matching any vendor, ranked by frequency across tenants, with one-click "create vendor from this domain" |
| `/admin/ai-usage` | Requests, tokens, cost by feature/model/agency/day; error rate; latency p50/p95; top spenders; cap breaches |
| `/admin/billing` | Subscriptions, MRR/ARR, churn, failed payments, trials ending, Stripe webhook event log with replay |
| `/admin/system-health` | DB connections/latency, Redis memory/latency, S3 reachability, worker heartbeats, browser pool utilization, external-service status (Clerk, Stripe, Resend, OpenAI), recent incidents |
| `/admin/logs` | Audit log (all tenants, filterable) and system log stream with severity filter and full-text search |
| `/admin/feature-flags` | Flags with global/plan/agency-level targeting, percentage rollout, kill switches |
| `/admin/settings` | Platform config: plan definitions, default entitlements, scanner defaults, AI model mapping, maintenance mode, announcement banner |

---

## 3.13 Client Portal (`/portal`)

A separate, deliberately smaller surface. Security design in Part VI §6.10.

| Page | Contents |
|---|---|
| `/portal` | Agency-branded header · health score gauge with plain-language interpretation · monitoring status ("Monitored daily · last checked 3 hours ago") · current items needing attention (count by severity, **no internal notes, no rule IDs, no raw evidence**) · recent changes (simplified drift, e.g. "A new tracking service was detected on 14 March") · latest report download |
| `/portal/issues` | Simplified list: severity as plain words (Needs attention / Worth reviewing / Informational) · what it means (the static rule copy only) · status (Open / Being worked on / Resolved) · when detected. Detail page shows the client-safe explanation and, if generated, the AI client summary — never the developer fix guidance or the raw evidence |
| `/portal/reports` | Report list, download PDFs |
| `/portal/scans` | Date, status, "checked successfully" / "partially checked", score. No technical detail |
| `/portal/settings` | Contact details, notification preferences (report delivery, critical alerts), nothing else |

**Never exposed in the portal:** internal notes, agency-internal issue assignments, rule IDs, raw network requests, cookie values, evidence exports, other clients' anything, agency billing, AI cost data, scanner version details.

**Branding:** every portal render resolves branding from the owning agency (Part VI §6.9) with an explicit `agencyId`-scoped query. A shared branding cache keyed only by `agencyId` prevents leakage.

---

## 3.14 Page Inventory

| Page | URL | Auth | Role | Purpose | Primary CTA | Secondary CTA | Major components | API dependencies |
|---|---|---|---|---|---|---|---|---|
| Home | `/` | No | — | Convert to trial/free scan | Start Free Trial | Scan a website free | Hero, DriftDemoCard, PricingPreview, FAQAccordion | — |
| Features | `/features` | No | — | Prove technical depth | Start Free Trial | Free scan | FeatureBlock, StickySubnav | — |
| Feature sub-pages | `/features/[topic]` | No | — | Deep dive | Start Free Trial | Back to features | FeatureDeepDive, LimitationsBlock | — |
| How It Works | `/how-it-works` | No | — | Explain the mechanism | Start Free Trial | Free scan | ScrollStepper, PipelineDiagram | — |
| Pricing | `/pricing` | No | — | Qualify + convert | Start Free Trial | Talk to us | PlanCard, ComparisonTable, IntervalToggle | `GET /api/public/plans` |
| Free Scanner | `/free-scanner` | No | — | Lead generation | Scan now | See pricing | UrlInput, Turnstile, ScanProgress | `POST /api/public/free-scan` |
| Free Scan Result | `/free-scanner/[token]` | No | — | Show value, convert | Monitor this website | Download PDF (email-gated) | ScoreGauge, LockedPanel, FindingCard | `GET /api/public/free-scan/[token]` |
| Resources | `/resources` | No | — | SEO hub | Read the blog | CMP compatibility table | ResourceGrid, CmpTable | — |
| Blog index | `/blog` | No | — | SEO | Read post | Subscribe | PostCard, TagFilter | — |
| Blog post | `/blog/[slug]` | No | — | SEO | Start Free Trial | Related posts | MdxRenderer, TOC, AuthorCard | — |
| About | `/about` | No | — | Trust | Start Free Trial | Contact | TeamGrid, MissionBlock | — |
| Contact | `/contact` | No | — | Inbound | Send message | Book a call | ContactForm, Turnstile | `POST /api/public/contact` |
| Login | `/login` | No | — | Authenticate | Sign in | Sign up | Clerk `<SignIn/>` | Clerk |
| Signup | `/signup` | No | — | Register | Create account | Sign in | Clerk `<SignUp/>` | Clerk |
| Terms | `/legal/terms` | No | — | Legal | — | — | LegalLayout | — |
| Privacy | `/legal/privacy` | No | — | Legal | — | — | LegalLayout | — |
| Cookie Policy | `/legal/cookie-policy` | No | — | Legal | — | — | LegalLayout, CookieTable | — |
| Disclaimer | `/legal/disclaimer` | No | — | Legal boundary | — | — | LegalLayout | — |
| Onboarding | `/app/onboarding` | Yes | Any | Activate | Add first website | Skip for now | OnboardingWizard | `POST /api/agencies`, `POST /api/websites` |
| Dashboard | `/app` | Yes | Any | Triage | View attention item | Add website | SummaryStrip, AttentionCenter, HealthTrendChart, DriftSummary, ActivityFeed | `GET /api/dashboard/*` |
| Websites | `/app/websites` | Yes | Any | Manage portfolio | Add Website | Import CSV | WebsiteTable, WebsiteGrid, FilterBar, BulkToolbar | `GET /api/websites` |
| Add Website | `/app/websites/new` | Yes | Manager+ | Onboard a site | Create & scan | Cancel | AddWebsiteWizard, UrlValidator | `POST /api/websites/validate`, `POST /api/websites` |
| Import Websites | `/app/websites/import` | Yes | Manager+ | Bulk onboard | Import | Download template | CsvUploader, ImportPreview | `POST /api/websites/import` |
| Website Detail | `/app/websites/[id]` | Yes | Any | Single-site truth | Scan now | Generate report | WebsiteHeader, TabNav + 11 tab panels | `GET /api/websites/[id]/*` |
| Clients | `/app/clients` | Yes | Any | Manage clients | Add Client | — | ClientTable, FilterBar | `GET /api/clients` |
| Client Detail | `/app/clients/[id]` | Yes | Any | Client rollup | Generate report | Enable portal | ClientHeader, TabNav | `GET /api/clients/[id]/*` |
| Issues | `/app/issues` | Yes | Any | Triage queue | Acknowledge | Bulk assign | IssueTable, FilterBar, SavedViews | `GET /api/issues` |
| Issue Detail | `/app/issues/[id]` | Yes | Any | Understand + act | Resolve | Re-scan to verify | IssueNarrative, EvidencePanel, AiExplanation, FixRecommendation | `GET /api/issues/[id]`, `POST /api/ai/explain` |
| Trackers | `/app/trackers` | Yes | Any | Vendor exposure | View websites | Filter by category | TrackerTable, ExposureChart | `GET /api/trackers` |
| Tracker Detail | `/app/trackers/[id]` | Yes | Any | Vendor profile | View affected sites | Vendor docs | TrackerProfile, AffectedSitesTable | `GET /api/trackers/[id]` |
| Scans | `/app/scans` | Yes | Any | Scan history | View scan | Re-run | ScanTable, FilterBar | `GET /api/scans` |
| Scan Detail | `/app/scans/[id]` | Yes | Developer+ | Technical truth | Re-run scan | Export evidence | ScanMetadata, PhaseTimeline, EvidenceViewer | `GET /api/scans/[id]/*` |
| Privacy Drift | `/app/drift` | Yes | Any | See what changed | View event | Filter | DriftFeed, DayGroup, DiffCard | `GET /api/drift` |
| Reports | `/app/reports` | Yes | Any | Report library | Generate report | Download | ReportTable, StatusBadge | `GET /api/reports` |
| Generate Report | `/app/reports/new` | Yes | Manager+ | Create artifact | Generate | Cancel | ReportWizard, BrandingPreview | `POST /api/reports` |
| Report Detail | `/app/reports/[id]` | Yes | Any | View/download | Download PDF | Share link | PdfPreview, ShareDialog | `GET /api/reports/[id]` |
| Alerts | `/app/alerts` | Yes | Manager+ | Configure alerting | Create rule | View history | AlertRuleTable, AlertHistoryTable | `GET /api/alerts` |
| Notifications | `/app/notifications` | Yes | Any | Catch up | Mark all read | Filter | NotificationList | `GET /api/notifications` |
| AI Assistant | `/app/ai` | Yes | Manager+ | AI tasks | Run action | View usage | AiActionCards, CreditMeter | `POST /api/ai/*` |
| Team | `/app/team` | Yes | Admin+ | Manage access | Invite member | Change role | MemberTable, InviteDialog, RoleMatrix | `GET /api/team` |
| Billing | `/app/billing` | Yes | Owner | Manage subscription | Change plan | Manage billing | PlanCard, UsageMeters, InvoiceTable | `GET /api/billing/*` |
| Settings — General | `/app/settings/general` | Yes | Admin+ | Agency config | Save | — | SettingsForm | `PATCH /api/agency` |
| Settings — Branding | `/app/settings/branding` | Yes | Admin+ | White-label | Save | Preview | BrandingForm, LivePreview | `PATCH /api/agency/branding` |
| Settings — Notifications | `/app/settings/notifications` | Yes | Any | Alert prefs | Save | — | NotificationMatrix, QuietHours | `PATCH /api/notification-preferences` |
| Settings — Scanning | `/app/settings/scanning` | Yes | Admin+ | Scan defaults | Save | — | ScanSettingsForm, IgnoreRules | `PATCH /api/agency/scan-settings` |
| Settings — AI | `/app/settings/ai` | Yes | Admin+ | AI config | Save | View usage | AiSettingsForm, UsageChart | `PATCH /api/agency/ai-settings` |
| Settings — Security | `/app/settings/security` | Yes | Admin+ | Security + audit | Export log | Manage sessions | AuditLogTable, SessionList | `GET /api/audit-logs` |
| Settings — Integrations | `/app/settings/integrations` | Yes | Admin+ | Connections | Connect | Register interest | IntegrationGrid | `GET /api/integrations` |
| Help | `/app/help` | Yes | Any | Self-serve support | Contact support | Search articles | HelpSearch, ArticleList, SupportForm | `POST /api/support/ticket` |
| Admin Dashboard | `/admin` | Yes | Super Admin | Operate platform | Investigate | — | OpsStatGrid, QueueHealth, ErrorRateChart | `GET /api/admin/*` |
| Admin Agencies | `/admin/agencies` | Yes | Super Admin | Tenant management | Suspend | Impersonate | AgencyTable, AgencyDetail | `GET /api/admin/agencies` |
| Admin Queue | `/admin/queue` | Yes | Super Admin | Queue ops | Retry failed | Pause queue | QueueBoard, JobInspector | `GET /api/admin/queues` |
| Admin Trackers | `/admin/trackers` | Yes | Super Admin | Vendor DB | Add vendor | Import JSON | TrackerCrudTable, UnknownDomainQueue | `GET/POST /api/admin/trackers` |
| Admin AI Usage | `/admin/ai-usage` | Yes | Super Admin | Cost control | Set caps | Export | AiCostChart, TopSpenders | `GET /api/admin/ai-usage` |
| Admin System Health | `/admin/system-health` | Yes | Super Admin | Monitor | Acknowledge | — | HealthGrid, DependencyStatus | `GET /api/admin/health` |
| Admin Feature Flags | `/admin/feature-flags` | Yes | Super Admin | Rollout control | Toggle flag | Set targeting | FlagTable, TargetingEditor | `GET/PATCH /api/admin/flags` |
| Portal Overview | `/portal` | Portal | Client | Client status | Download report | View issues | PortalHeader, ScoreGauge, SimpleIssueList | `GET /api/portal/overview` |
| Portal Issues | `/portal/issues` | Portal | Client | Client-safe issues | View detail | — | SimpleIssueList | `GET /api/portal/issues` |
| Portal Reports | `/portal/reports` | Portal | Client | Get reports | Download | — | ReportList | `GET /api/portal/reports` |
| Portal Scans | `/portal/scans` | Portal | Client | Monitoring proof | — | — | SimpleScanList | `GET /api/portal/scans` |
| Portal Settings | `/portal/settings` | Portal | Client | Preferences | Save | — | PortalSettingsForm | `PATCH /api/portal/settings` |

---

# Part IV — The Scanner

This is the product. Everything else is a presentation layer over what this subsystem records. It lives in `packages/scanner`, is imported by `apps/worker`, and must be independently testable without a database.

## 4.1 Architecture Overview

```mermaid
flowchart TD
  subgraph Orchestration
    J[Scan Job<br/>BullMQ] --> O[ScanOrchestrator]
    O --> SM[Scan State Machine]
  end

  subgraph Browser
    O --> BP[BrowserPool]
    BP --> CTX[Isolated BrowserContext<br/>one per consent phase]
    CTX --> PG[Page]
  end

  subgraph Instrumentation
    PG --> NR[NetworkRecorder]
    PG --> CR[CookieRecorder]
    PG --> SR[StorageRecorder]
    PG --> CO[ConsoleRecorder]
    PG --> SC[ScreenshotCapture]
  end

  subgraph Consent
    PG --> CD[CMP Detector]
    CD --> AD[ConsentAdapter<br/>resolved]
    AD --> PH[Phase Driver]
  end

  NR & CR & SR & CO & SC & PH --> EC[EvidenceCollector<br/>normalize + redact + tag with consent state]
  EC --> RAW[(RawScanEvidence)]

  RAW --> TC[TrackerClassifier]
  TC --> RE[RuleEngine]
  RE --> F[Verified Findings]
  F --> DE[DriftEngine<br/>diff vs previous scan]
  F & DE --> RS[RiskEngine + HealthScore]
  RS --> P[(Postgres)]
  EC --> S3[(S3: screenshots, evidence blobs)]
```

**Hard boundary:** nothing downstream of `EvidenceCollector` may add facts. The classifier, rule engine, drift engine and risk engine only *interpret* recorded evidence. This makes the entire pipeline replayable — given stored raw evidence, re-running analysis must produce identical findings, which is how we tune rules safely (Part IV §4.14).

## 4.2 Browser Lifecycle and Pooling

### Browser pool

One Chromium **browser process** is expensive to launch (~300–600 ms) but cheap to derive contexts from. One **context** is cheap (~30 ms) and provides complete storage isolation. Therefore:

- **Reuse browsers, never reuse contexts.**
- `BrowserPool` maintains `SCAN_BROWSER_POOL_SIZE` (default 2 per worker) long-lived Chromium instances.
- Each browser is recycled after `SCAN_BROWSER_MAX_USES` contexts (default 50) or `SCAN_BROWSER_MAX_AGE_MS` (default 30 min), whichever comes first — Chromium leaks memory over long sessions.
- A browser that crashes is removed and replaced; in-flight scans on it fail with `BROWSER_CRASHED` and are retried on a different browser.
- Pool acquisition is bounded by a semaphore matching worker concurrency; a scan that cannot acquire a browser within 60 s fails with `BROWSER_POOL_TIMEOUT` and is retried with backoff.

```ts
// packages/scanner/src/browser/pool.ts
export interface BrowserPool {
  acquire(): Promise<PooledBrowser>;   // semaphore-bounded
  release(b: PooledBrowser): Promise<void>;
  drain(): Promise<void>;              // graceful shutdown
  stats(): { total: number; busy: number; uses: number[] };
}
```

### Launch arguments

```ts
const launchOptions: LaunchOptions = {
  headless: true,
  chromiumSandbox: true,           // keep the sandbox; see container notes below
  args: [
    '--disable-dev-shm-usage',      // /dev/shm is small in containers
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=IsolateOrigins,site-per-process', // fewer processes, lower RAM
    '--js-flags=--max-old-space-size=512',
  ],
  timeout: 30_000,
};
```

**Container note:** we keep `chromiumSandbox: true` and grant the container `SYS_ADMIN` via a seccomp profile rather than passing `--no-sandbox`. We are executing untrusted third-party JavaScript from arbitrary websites; disabling the Chromium sandbox in that situation is not acceptable. Details in Part X §10.4.

### Context settings

```ts
const contextOptions: BrowserContextOptions = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  userAgent: SCAN_USER_AGENT,            // see below
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  ignoreHTTPSErrors: false,              // we WANT to see cert failures
  javaScriptEnabled: true,
  serviceWorkers: 'block',               // SWs cause non-deterministic replays
  bypassCSP: false,                      // never weaken the page's own security
  extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
  recordHar: undefined,                  // we record ourselves; HAR is too heavy
  permissions: [],                       // grant nothing
  geolocation: undefined,
  colorScheme: 'light',
  reducedMotion: 'reduce',               // faster, more stable screenshots
};
```

**User agent policy.** We use a real, current Chrome UA string with an appended identifier:

```
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)
Chrome/<version> Safari/537.36 PrivacyDriftMonitor/1.0 (+https://<app>/bot)
```

Rationale: we must be identifiable (ethical, and it lets site owners allowlist us), but we must not use a UA so unusual that CMPs behave differently. `/bot` is a public page explaining who we are, how to allowlist us, and how to request exclusion. We publish a stable egress IP range so agencies can allowlist us at the WAF. `SCAN_RESPECT_ROBOTS` defaults to `true`; agencies may disable it **only for websites they have confirmed ownership of**, and that toggle is audit-logged.

### Cleanup contract

Every phase is wrapped in `try/finally`. The `finally` block closes the page, closes the context, and releases pool capacity — even on timeout, crash, or abort. A leaked context is a memory leak that will take down a worker within hours, so this is enforced by a lint rule and covered by an integration test that asserts context count returns to zero after a forced-failure scan.

## 4.3 Resource Interception Policy

Aggressive blocking is tempting for cost but **dangerous for correctness** — a blocked script is a tracker we fail to observe. Policy:

| Resource type | Action | Rationale |
|---|---|---|
| `document`, `script`, `xhr`, `fetch`, `websocket`, `eventsource` | **Always allow** | These carry all tracking behavior |
| `stylesheet` | Allow | Can contain `url()` beacons and affects banner rendering |
| `image` | **Record then abort after headers** | We need the request (tracking pixels are images) but not the bytes |
| `media` | Abort after headers | Large, rarely tracking-relevant |
| `font` | Record, allow (needed for screenshot fidelity) | Third-party fonts are a real privacy finding |
| `manifest`, `other` | Allow | Cheap |

Critically: **an aborted request is still a recorded request.** We register the route handler *after* attaching the network listener so the request event fires before the abort. This gives us full tracking visibility at a fraction of the bandwidth. Screenshots are taken with images allowed for the banner-state capture only (a second lightweight pass), so visual evidence remains usable.

`SCAN_BLOCK_MEDIA` (default `true`) controls the media/image body abort; it can be disabled per-website for sites where a video player is the tracking vector.

## 4.4 Navigation, Timeouts, and Retry

```ts
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SCAN_NAV_TIMEOUT_MS });
await settle(page, { networkIdleMs: 2000, maxWaitMs: SCAN_SETTLE_MAX_MS });
await page.waitForTimeout(SCAN_OBSERVE_MS); // deliberate post-load observation window
```

We deliberately do **not** use `waitUntil: 'networkidle'` as the primary gate — tracking scripts often keep long-poll connections open, which would time out every scan. Instead: `domcontentloaded`, then a custom `settle()` that waits for a 2 s quiet period in our own request counter, capped at `SCAN_SETTLE_MAX_MS` (default 15 s), then a fixed **10 s observation window** (`SCAN_OBSERVE_MS`) during which late-firing trackers (the common case for GTM-injected pixels) are recorded. Then we scroll the page once to the bottom and back — lazy-loaded widgets and scroll-triggered pixels are a real and frequent finding.

| Timeout | Env var | Default | Applies to |
|---|---|---|---|
| Navigation | `SCAN_NAV_TIMEOUT_MS` | 30 000 | Single `page.goto` |
| Settle | `SCAN_SETTLE_MAX_MS` | 15 000 | Post-load quiet-period wait |
| Observation | `SCAN_OBSERVE_MS` | 10 000 | Fixed listening window |
| Consent interaction | `SCAN_CONSENT_TIMEOUT_MS` | 15 000 | Locating + clicking a banner control |
| Per phase | `SCAN_PHASE_TIMEOUT_MS` | 90 000 | Whole consent phase |
| Per page | `SCAN_PAGE_TIMEOUT_MS` | 120 000 | All phases for one page |
| Whole scan | `SCAN_TIMEOUT_MS` | 600 000 | Job-level hard ceiling |

**Retry policy** (see also Part VII §7.6): navigation is retried up to 2 times **within** the job for transient network classes (`ECONNRESET`, `ETIMEDOUT`, HTTP 502/503/504) with 2 s then 5 s backoff. Deterministic failures (DNS NXDOMAIN, SSRF block, 404 on the target, TLS name mismatch) are **not** retried — retrying them wastes browser time and delays real work.

## 4.5 Instrumentation — What We Record

### NetworkRecorder

Attached before navigation via `page.on('request' | 'response' | 'requestfailed')` plus a CDP session for redirect chains.

Per request we store:

| Field | Source | Notes |
|---|---|---|
| `url` | `request.url()` | **Sanitized** — see Part X §10.6 |
| `method` | `request.method()` | |
| `resourceType` | `request.resourceType()` | |
| `initiatorType`, `initiatorUrl` | CDP `Network.requestWillBeSent` | The initiator chain is what tells a developer *which script* caused it |
| `timestampMs` | Monotonic offset from navigation start | Relative, not wall-clock — makes scans comparable |
| `status`, `statusText` | `response.status()` | Null if failed |
| `failureText` | `requestfailed` | |
| `resourceSize`, `transferSize` | Response headers | |
| `host`, `registrableDomain` | Parsed via PSL | |
| `isThirdParty` | `registrableDomain !== site.registrableDomain` | |
| `consentPhase` | Injected by the phase driver | **The single most important field in the system** |
| `pageUrl` | Which monitored page | |
| `redirectChain` | CDP | Redirect hops are frequently how trackers hide |
| `setCookieCount` | Response headers (names only, no values) | |

**Volume control:** a page can generate thousands of requests. We persist:
- All third-party requests (always).
- All requests matching a tracker signature (always).
- First-party requests: aggregated by `(host, resourceType)` with counts, plus the first 200 individually. Full first-party detail is not evidence-relevant and is the bulk of the volume.

### CookieRecorder

Snapshotted via `context.cookies()` at four points in every phase: **after navigation**, **after settle**, **after the consent interaction**, and **at phase end**. Diffing snapshots gives us *when* a cookie appeared relative to the consent action, which is far stronger evidence than a single end-state snapshot.

Fields: `name`, `domain`, `path`, `expires` (→ `isSession`, `durationDays`), `secure`, `httpOnly`, `sameSite`, `party` (1st/3rd relative to the monitored site), `consentPhase`, `snapshotPoint`, `size`. **Values are stored only as a SHA-256 hash plus a length**, except for a small allowlist of consent-signal cookies (`CookieConsent`, `cookieyes-consent`, `OptanonConsent`, `cmplz_*`, `usercentrics`) where the value encodes the consent state itself and is genuinely diagnostic — those are stored raw but redacted of any embedded identifiers.

### StorageRecorder

Executed in-page after settle and at phase end:

```ts
const storage = await page.evaluate(() => ({
  local: Object.entries(localStorage).map(([k, v]) => ({ key: k, size: v.length })),
  session: Object.entries(sessionStorage).map(([k, v]) => ({ key: k, size: v.length })),
}));
```

**Keys only, plus value length and a hash.** Values commonly contain personal data and session tokens. A configurable allowlist of known-benign keys (consent-state keys) may store a truncated value. IndexedDB is enumerated at database-and-store-name level only (`indexedDB.databases()`), because several major trackers persist there and the name alone is the signal; we do not read records.

### ConsoleRecorder

`page.on('console')` filtered to `error` and `warning`, plus `page.on('pageerror')`. Capped at 100 entries. This is what makes a `PARTIAL` scan explainable — "the CMP script threw before initializing" is a genuinely useful finding.

### ScreenshotCapture

| Screenshot | When | Why |
|---|---|---|
| `banner-initial` | After settle, before any consent interaction | Proof the banner existed and what it offered |
| `banner-preferences` | After opening the preferences panel (if reached) | Proof of granular options |
| `post-reject` | After Reject All completes | Proof the banner dismissed |
| `full-page` | End of the `no-consent` phase only | Context for reports |

Viewport PNGs, quality-optimized to WebP at upload, max 400 KB each. Governed by the agency's screenshot policy setting (`always` / `on-change` / `never`); `on-change` (default) captures only when the scan produced a drift event or a new issue, cutting storage cost substantially.

## 4.6 The Consent Engine

The hardest and most valuable subsystem. Websites do not share a consent implementation, so the engine is a **plugin architecture with a confidence-scored resolution cascade**.

### The adapter interface

```ts
// packages/scanner/src/consent/types.ts
export type ConsentPhase = 'no_consent' | 'reject_all' | 'accept_all' | 'withdraw';

export interface CmpDetection {
  cmpId: string;                 // 'cookiebot' | 'cookieyes' | ... | 'generic' | 'none'
  cmpName: string;
  version?: string;
  confidence: number;            // 0..1
  signals: string[];             // ['script:consent.cookiebot.com', 'global:Cookiebot', 'dom:#CybotCookiebotDialog']
}

export interface ConsentActionResult {
  ok: boolean;
  method: 'adapter_selector' | 'api_call' | 'accessible_name' | 'text_match' | 'dom_heuristic';
  confidence: number;            // 0..1
  selectorUsed?: string;
  elementText?: string;
  inIframe: boolean;
  durationMs: number;
  bannerDismissed: boolean;      // verified by re-querying the banner root
  error?: ConsentErrorCode;
}

export interface ConsentAdapter {
  readonly id: string;
  readonly name: string;
  readonly priority: number;                       // lower runs first
  detect(page: Page): Promise<CmpDetection | null>;
  waitForBanner(page: Page, timeoutMs: number): Promise<boolean>;
  acceptAll(page: Page): Promise<ConsentActionResult>;
  rejectAll(page: Page): Promise<ConsentActionResult>;
  openPreferences(page: Page): Promise<ConsentActionResult>;
  withdraw(page: Page): Promise<ConsentActionResult>;
  readConsentState?(page: Page): Promise<Record<string, boolean> | null>; // CMP API if available
}
```

### Resolution cascade

```mermaid
flowchart TD
  A[Page settled] --> B[Run all adapter.detect in parallel]
  B --> C{Any known CMP<br/>confidence >= 0.7?}
  C -->|Yes| D[Use highest-confidence known adapter]
  C -->|No| E{Banner-like element present?}
  E -->|Yes| F[GenericBannerAdapter]
  E -->|No| G[NoBannerAdapter → cmpId='none']
  D --> H[Execute phase action]
  F --> H
  G --> I[Record: no consent mechanism detected]
  H --> J{Action succeeded AND<br/>banner verified dismissed?}
  J -->|Yes| K[Phase result: EXECUTED with confidence]
  J -->|No| L[Phase result: UNDETERMINED + reason]
  L --> M[Scan marked PARTIAL for this phase]
```

**Rule: an adapter failure never becomes a pass.** If we could not click Reject All, the Reject phase result is `UNDETERMINED`, the scan is `PARTIAL`, and the UI says "we could not test Reject All on this site" — it never says the site passed.

### Known CMP adapters (MVP)

| Adapter | Detection signals | Accept | Reject | Preferences | Withdraw |
|---|---|---|---|---|---|
| **Cookiebot** | `window.Cookiebot`; script host `consent.cookiebot.com`; `#CybotCookiebotDialog` | `Cookiebot.submitCustomConsent(true,true,true)` or `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll` | `#CybotCookiebotDialogBodyButtonDecline` | `#CybotCookiebotDialogBodyLevelButtonCustomize` | `Cookiebot.withdraw()` then reload |
| **CookieYes** | `window.cookieyes`; host `cdn-cookieyes.com`; `.cky-consent-container` | `.cky-btn-accept` | `.cky-btn-reject` | `.cky-btn-customize` | Clear `cookieyes-consent` cookie + reload, then verify banner returns |
| **Complianz** | `window.cmplz_*`; `#cmplz-cookiebanner-container`; cookies `cmplz_*` | `.cmplz-accept` | `.cmplz-deny` | `.cmplz-manage-options` | `cmplz_deny_all()` if exposed, else clear `cmplz_*` cookies + reload |
| **OneTrust** | `window.OneTrust`, `window.Optanon`; host `cdn.cookielaw.org`; `#onetrust-banner-sdk` | `#onetrust-accept-btn-handler` | `#onetrust-reject-all-handler` (fallback: preferences → reject all) | `#onetrust-pc-btn-handler` | `OneTrust.RejectAll()` |
| **Usercentrics** | `window.UC_UI`; host `app.usercentrics.eu`; `#usercentrics-root` (**shadow DOM**) | `UC_UI.acceptAllConsents()` then `UC_UI.closeCMP()` | `UC_UI.denyAllConsents()` then `UC_UI.closeCMP()` | `UC_UI.showSecondLayer()` | `UC_UI.denyAllConsents()` |
| **Generic** | Any banner-like element (see below) | Heuristic cascade | Heuristic cascade | Heuristic cascade | Cookie-clear + reload |
| **None** | Nothing matched | — | — | — | — |

**Preference over API calls.** Where a CMP exposes a documented JS API, we call it *and* verify the DOM outcome. API calls are far more reliable than clicking, but we still assert the banner dismissed, because a silent API failure would otherwise look like success.

**Shadow DOM and iframes.** Usercentrics renders into a shadow root; OneTrust and several others render into iframes. The adapter framework handles both:
- Playwright locators pierce open shadow roots natively.
- For iframes, `findConsentFrame(page)` enumerates `page.frames()` and scores each by URL patterns (known CMP hosts) and by content heuristics (presence of consent keywords), returning the highest scorer. Every action then runs against that frame.
- Closed shadow roots cannot be pierced — that yields `CONSENT_SHADOW_ROOT_CLOSED` and an `UNDETERMINED` phase.

### GenericBannerAdapter — the heuristic cascade

Runs when no known CMP is identified. Four ordered strategies; the first that produces a high-confidence hit wins, and the confidence of the strategy is carried into the finding.

**Step 1 — Locate the banner root.** Score every element that is: fixed/sticky positioned, in the bottom or top 30% of the viewport (or a centered modal), `z-index > 1000`, visible, containing ≥ 2 interactive elements, and whose text matches a consent keyword set (`cookie`, `consent`, `privacy`, `tracking`, `gdpr`, plus localized equivalents for de/fr/es/it/nl/pl). Highest score wins; ties broken by z-index.

**Step 2 — Accessible name matching (confidence 0.9).** Query buttons/links within the banner root by ARIA accessible name against ordered pattern lists:

```ts
const REJECT_PATTERNS = [
  /^reject all$/i, /^decline all$/i, /^deny all$/i, /^refuse all$/i,
  /^reject$/i, /^decline$/i, /^only necessary$/i, /^necessary only$/i,
  /^essential only$/i, /^continue without accepting$/i,
  /^alle ablehnen$/i, /^tout refuser$/i, /^rechazar todo$/i,
  /^rifiuta tutto$/i, /^alles weigeren$/i, /^odrzuć wszystko$/i,
];
```

Accessible-name matching is used *first* because it handles icon buttons, `aria-label`, and nested markup that plain text matching misses.

**Step 3 — Visible text matching (confidence 0.75).** Same pattern lists against trimmed `innerText`, with exact matches ranked above `startsWith` above `includes`. **Negative patterns are essential**: an element whose text matches `/manage|settings|preferences|customi[sz]e|more info|learn more/i` must never be selected as the Reject control.

**Step 4 — DOM heuristics (confidence 0.5).** Class/id/data-attribute pattern matching (`[class*="reject"]`, `[data-cc-action="reject"]`, `[id*="decline"]`), with the same negative filters.

**Step 5 — Preference-panel fallback for Reject.** Many CMPs have no top-level Reject. If Reject was not found: open preferences, toggle every non-necessary category off, then click Save/Confirm. This is recorded as `method: 'dom_heuristic'` with confidence 0.6 and is surfaced in the UI as *"Reject was performed via the preferences panel"* — because a site with no top-level reject is itself a finding (`PDM-R012`).

**Confidence floor.** If the best available strategy yields confidence < `SCAN_CONSENT_MIN_CONFIDENCE` (default 0.5), the phase is `UNDETERMINED`. We would rather report "we couldn't test this" than report a wrong result.

### Withdrawal testing

The hardest phase and the one most competitors skip. Strategy per adapter, in order:
1. **Documented API** (`Cookiebot.withdraw()`, `UC_UI.denyAllConsents()`, `OneTrust.RejectAll()`).
2. **UI path** — find a persistent "Cookie settings" / floating badge / footer link, open it, deny all, save.
3. **Cookie clearing** — delete the CMP's known consent cookies and localStorage keys, reload, and verify the banner reappears (which proves consent was actually withdrawn).

The phase begins from an **Accept All** state (we accept, verify trackers fired, then withdraw), because withdrawal is only meaningful after consent was given. This means the withdraw phase is the only one that performs two consent actions; both are recorded.

### Per-website adapter override

`Website.consentOverride` (JSON) lets an agency pin `adapterId` and supply explicit `acceptSelector`, `rejectSelector`, `preferencesSelector`, `withdrawSelector`, and `bannerRootSelector`. When present these take absolute precedence and are recorded with `method: 'adapter_selector'`, confidence 1.0. This is the escape hatch that makes bespoke CMPs supportable without a code deploy, and it is exposed in the website Settings tab.

### Consent error codes

`CONSENT_NO_BANNER_FOUND` · `CONSENT_BANNER_TIMEOUT` · `CONSENT_BUTTON_NOT_FOUND` · `CONSENT_CLICK_FAILED` · `CONSENT_BANNER_NOT_DISMISSED` · `CONSENT_IFRAME_NOT_FOUND` · `CONSENT_SHADOW_ROOT_CLOSED` · `CONSENT_API_THREW` · `CONSENT_AMBIGUOUS_CONTROL` · `CONSENT_LOW_CONFIDENCE` · `CONSENT_PREFERENCES_UNREACHABLE` · `CONSENT_WITHDRAW_UNSUPPORTED`.

## 4.7 Scan State Machine

```mermaid
stateDiagram-v2
  [*] --> SCAN_QUEUED
  SCAN_QUEUED --> SCAN_STARTED: worker picks up
  SCAN_QUEUED --> FAILED: entitlement revoked / website archived
  SCAN_STARTED --> NAVIGATING: browser + context acquired
  SCAN_STARTED --> FAILED: BROWSER_POOL_TIMEOUT / BROWSER_CRASHED
  NAVIGATING --> BANNER_DETECTED: page settled, CMP resolved
  NAVIGATING --> FAILED: DNS / SSRF_BLOCKED / NAV_TIMEOUT / TLS
  BANNER_DETECTED --> NO_CONSENT_TEST
  NO_CONSENT_TEST --> REJECT_TEST: phase complete or undetermined
  NO_CONSENT_TEST --> PARTIAL: phase crashed
  REJECT_TEST --> ACCEPT_TEST
  REJECT_TEST --> PARTIAL
  ACCEPT_TEST --> WITHDRAW_TEST
  ACCEPT_TEST --> PARTIAL
  WITHDRAW_TEST --> ANALYZING
  WITHDRAW_TEST --> PARTIAL
  PARTIAL --> ANALYZING: analyze what we did collect
  ANALYZING --> COMPLETED: all phases executed
  ANALYZING --> PARTIAL_COMPLETED: some phases undetermined
  ANALYZING --> FAILED: analysis crashed
  COMPLETED --> [*]
  PARTIAL_COMPLETED --> [*]
  FAILED --> [*]
```

**Transition rules**

| From → To | Trigger | Side effects |
|---|---|---|
| `SCAN_QUEUED` → `SCAN_STARTED` | Worker claims job | `startedAt` set; `workerId` recorded; usage counter incremented |
| `NAVIGATING` → `FAILED` | Unrecoverable nav error | Error code + message stored; `consecutiveFailures++` on Website; alert if ≥ 3 |
| any phase → `PARTIAL` | Phase throws or times out | Phase marked `UNDETERMINED` with reason; **remaining phases still attempted** |
| `ANALYZING` → `PARTIAL_COMPLETED` | ≥ 1 phase undetermined | Score computed but flagged `incomplete`; **no clean verdict permitted**; issues only from executed phases |
| `ANALYZING` → `COMPLETED` | All 4 phases executed | Full score; drift computed; baseline updated |
| any → `FAILED` | Job exhausted retries | Failure alert; issue `PDM-R023` (scan failure) created after 3 consecutive |

Persisted as `Scan.status` plus a `ScanPhase` row per phase carrying its own status, timings, and error. The state machine is implemented as a pure reducer in `packages/scanner/src/state/machine.ts` and unit-tested exhaustively over every transition and illegal transition.

## 4.8 Tracker Detection Engine

### Vendor database

```ts
interface TrackerVendor {
  id: string;
  name: string;                       // 'Meta Pixel'
  slug: string;                       // 'meta-pixel'
  vendorCompany: string;              // 'Meta Platforms, Inc.'
  category: TrackerCategory;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  domainPatterns: string[];           // ['connect.facebook.net', '*.facebook.com', 'facebook.com']
  scriptPatterns: string[];           // ['fbevents.js', 'fbq(']
  cookiePatterns: string[];           // ['_fbp', '_fbc', 'fr']
  storagePatterns: string[];          // ['fbssls_*']
  requestPathPatterns: string[];      // ['/tr?', '/tr/']
  documentationUrl: string;
  privacyPolicyUrl: string;
  dataProcessingLocation?: string;    // 'US' — relevant for EU transfer discussion
  baseConfidence: number;             // 0..1
  aliases: string[];
  isEssentialCandidate: boolean;      // e.g. a CDN or CMP that is often legitimately pre-consent
}
```

**Categories:** `NECESSARY` · `ANALYTICS` · `MARKETING` · `ADVERTISING` · `FUNCTIONAL` · `SOCIAL` · `UNKNOWN`.

Seed set: ≈250 vendors covering the realistic long tail for UK/EU agency sites — Google (Analytics 4, Ads, Tag Manager, Fonts, reCAPTCHA, DoubleClick), Meta, Microsoft (Clarity, Bing UET), TikTok, LinkedIn, X, Pinterest, Snap, Reddit, Hotjar, Mouseflow, FullStory, Crazy Egg, Matomo, Plausible, Fathom, Segment, Amplitude, Mixpanel, HubSpot, Salesforce/Pardot, Marketo, ActiveCampaign, Mailchimp, Klaviyo, Intercom, Drift, Crisp, Tawk, Zendesk, Freshdesk, Trustpilot, Yotpo, Judge.me, Stripe, PayPal, Klarna, Cloudflare, jsDelivr, unpkg, Cloudinary, Vimeo, YouTube, Wistia, SoundCloud, Spotify, Google Maps, Mapbox, Typeform, Calendly, Hotjar, VWO, Optimizely, Criteo, Taboola, Outbrain, AdRoll, plus the major CMPs themselves.

Stored as `packages/database/seed/trackers.json`, versioned in git, loaded by `pnpm db:seed`, and editable at runtime through `/admin/trackers`. Seed updates are idempotent upserts keyed on `slug`.

### Classification algorithm

```
For each captured artifact (request | script | cookie | storage key):
  1. Exact host match against domainPatterns          → confidence 1.00
  2. Wildcard host match (*.vendor.com)               → confidence 0.95
  3. Registrable-domain match                         → confidence 0.90
  4. Script filename/content-signature match          → confidence 0.85
  5. Cookie name exact match                          → confidence 0.90
  6. Cookie name pattern match                        → confidence 0.75
  7. Storage key pattern match                        → confidence 0.70
  8. Request path pattern match (host already 3P)     → confidence 0.65
  → Take the highest-confidence match.
  → No match AND third-party  → UNKNOWN vendor record keyed by registrableDomain.
```

**Corroboration boost.** If the same vendor is matched by two independent signal types (e.g. a `connect.facebook.net` request *and* an `_fbp` cookie), confidence is raised to `min(1, max + 0.1)` and the detection is flagged `corroborated: true`. Rules that create Critical issues require either confidence ≥ 0.9 or corroboration — this single constraint eliminates most would-be false positives.

**Unknown vendors** are first-class: recorded with their registrable domain, request count, consent phase, and a global occurrence counter that feeds `/admin/trackers`' unknown-domain queue. Frequently-seen unknowns become new seed vendors. In V1.5, `classifyTracker()` (Part VIII) proposes a category for admin approval — the AI never writes to the vendor DB directly.

**Deliberately no LLM in the MVP classification path.** Classification is a detection decision, and P1 forbids the LLM from making those. AI classification arrives in V1.5 strictly as an *admin-reviewed suggestion*.

### Essential-service handling

Some third parties legitimately load before consent: the CMP itself, Cloudflare's challenge infrastructure, reCAPTCHA on a form, a payment provider's fraud script on a checkout page. These carry `isEssentialCandidate: true`, which downgrades the severity of a pre-consent detection from Critical to Info and changes the message to *"An essential-category service was observed before consent. This is often expected — review whether it is necessary for this page."* Getting this wrong in either direction destroys trust, so the flag is curated manually and never inferred.

## 4.9 Cookie Analysis

Collected as described in §4.5. Analysis produces, per cookie: the vendor and category (via `cookiePatterns` matching, else first-party/unknown), the earliest consent phase in which it appeared, whether it persists after Reject All, whether it persists after withdrawal, and its lifetime bucket (`session` / `< 24h` / `< 30d` / `< 1y` / `> 1y` — excessive lifetimes are an Info finding, `PDM-R021`).

**Comparison matrix** — the core cookie output, rendered directly in the UI:

| | Before consent | After Reject All | After Accept All | After Withdraw | Previous scan |
|---|---|---|---|---|---|
| Necessary | 3 | 3 | 3 | 3 | 3 |
| Analytics | 2 ⚠️ | 2 ⚠️ | 6 | 4 ⚠️ | 0 |
| Marketing | 1 ⚠️ | 0 | 12 | 2 ⚠️ | 1 |
| Unknown | 0 | 0 | 3 | 1 | 0 |

Every ⚠️ cell links to the specific cookies and the rule that flagged them.

## 4.10 Privacy Drift Engine

The differentiator. Compares the current completed scan to the previous **`COMPLETED`** scan of the same website (never to a `PARTIAL` or `FAILED` one — comparing against an incomplete scan generates phantom "removals" and is the single largest false-positive risk in the entire product).

### Fingerprint normalization

Naive set-diffing produces noise. Before diffing, each artifact is reduced to a stable fingerprint:

| Artifact | Fingerprint | Normalization applied |
|---|---|---|
| Third-party domain | `registrableDomain` | Lowercase; subdomain folding (`cdn1.x.com`, `cdn2.x.com` → `x.com`) unless the subdomain is a known distinct vendor |
| Tracker | `vendorId` | Deduplicated across signal types |
| Cookie | `name::domain` | Session-ID suffixes collapsed: `_gac_UA-12345` → `_gac_*`; numeric/hex suffixes ≥ 8 chars replaced with `*`; `__cf_bm`-style rotating names normalized by known pattern |
| Script | `registrableDomain + normalizedPath` | Cache-busters stripped (`?v=`, `?ver=`, `?_=`, hashes in filenames `app.a3f9b2.js` → `app.*.js`) |
| Storage key | `normalizedKey` | Same numeric/hex-suffix collapsing as cookies |
| Consent behavior | `phase::vendorCategory::fired` | Boolean matrix, not counts |

Normalization rules live in `packages/scanner/src/drift/normalize.ts`, are pure functions, and are covered by a dedicated fixture suite (§4.15) precisely because they are the FP-control surface.

### Diff algorithm

```ts
// packages/scanner/src/drift/diff.ts
export function computeDrift(prev: ScanFingerprints, curr: ScanFingerprints): DriftEvent[] {
  const events: DriftEvent[] = [];
  for (const dim of ['trackers','domains','cookies','scripts','storage'] as const) {
    const p = new Set(prev[dim]);
    const c = new Set(curr[dim]);
    const added   = [...c].filter(x => !p.has(x));
    const removed = [...p].filter(x => !c.has(x));
    if (added.length)   events.push(mk(`${dim}_added`, added, prev, curr));
    if (removed.length) events.push(mk(`${dim}_removed`, removed, prev, curr));
  }
  events.push(...consentBehaviorDrift(prev.consentMatrix, curr.consentMatrix));
  return events.filter(e => !isSuppressed(e));
}
```

### Detected change types

| Type | Severity | Creates an issue? |
|---|---|---|
| `TRACKER_ADDED` | High (Critical if marketing/advertising **and** pre-consent) | Yes |
| `TRACKER_REMOVED` | Info | No — recorded, notable in reports |
| `UNKNOWN_VENDOR_ADDED` | High | Yes |
| `COOKIE_ADDED` | Medium (High if pre-consent, non-necessary) | Yes if non-necessary |
| `COOKIE_REMOVED` | Info | No |
| `THIRD_PARTY_DOMAIN_ADDED` | Low → Medium (Medium if the domain also fired pre-consent) | Only at Medium+ |
| `THIRD_PARTY_DOMAIN_REMOVED` | Info | No |
| `SCRIPT_ADDED` / `SCRIPT_REMOVED` | Low / Info | No |
| `CONSENT_BEHAVIOR_CHANGED` | High | Yes |
| `CONSENT_REGRESSION` — Reject All previously blocked a category, now doesn't | **Critical** | Yes |
| `CMP_CHANGED` — different CMP detected | Medium | Yes (context matters) |
| `CMP_REMOVED` — banner previously present, now absent | **Critical** | Yes |
| `TRACKER_COUNT_DELTA` beyond threshold (> 50% or > 10 absolute) | Medium | Yes, as a single rollup |
| `SCORE_DROP` > 15 points | High | Yes, as a rollup |

### Baseline management

- The first `COMPLETED` scan sets `Website.baselineScanId`.
- Drift is always computed against the **previous completed scan**, not the baseline — otherwise every scan after a legitimate change would re-report it forever.
- The baseline is used for the "since you started monitoring" view in reports.
- An agency can explicitly **accept a change**, which suppresses that specific fingerprint from future `*_ADDED` events for that website (`DriftSuppression` rows). This is how "yes, we added Hotjar deliberately" is handled without disabling monitoring.
- Re-baselining is available (Admin+) after an intentional site rebuild, and is audit-logged.

### Worked example

```
Previous scan (2026-03-01, COMPLETED):
  22 third-party domains, 8 trackers, Reject All blocked all marketing

Current scan (2026-03-08, COMPLETED):
  27 third-party domains, 11 trackers, Reject All allowed 1 marketing tracker

Drift events produced:
  THIRD_PARTY_DOMAIN_ADDED   +5   analytics.tiktok.com, ...       Medium
  TRACKER_ADDED              +3   TikTok Pixel, Hotjar, Criteo    High
  CONSENT_REGRESSION          1   TikTok Pixel fires after Reject Critical
  SCORE_DROP                 -22  78 → 56                         High

Issues created: 2 (PDM-R004 consent regression, PDM-R013 new tracker rollup)
Alert: immediate (Critical present)
```

## 4.11 Risk Engine and Rule Inventory

Deterministic, transparent, versioned. Each rule is a pure function from evidence to zero or more findings.

```ts
// packages/scanner/src/rules/types.ts
export interface Rule {
  id: string;                     // 'PDM-R001'
  version: number;                // bump on logic change; stored on the Issue
  title: string;
  category: IssueCategory;
  severity: Severity | ((ctx: RuleContext) => Severity);
  requiredEvidence: EvidenceKind[];
  minConfidence: number;
  falsePositiveRisk: 'low' | 'medium' | 'high';
  evaluate(ctx: RuleContext): Finding[];
  message(f: Finding): string;    // deterministic, approved terminology
  technicalReason(f: Finding): string;
  recommendedAction(f: Finding): string;
}
```

Rules are registered in `packages/scanner/src/rules/registry.ts` with explicit precedence: a more specific rule suppresses a more general one (e.g. `PDM-R001` pre-consent marketing tracker suppresses `PDM-R003` pre-consent third-party domain for the same artifact) so a user sees one issue, not four.

### Scan Rule Inventory

| Rule ID | Condition | Evidence required | Severity | User message | FP risk | Recommended action |
|---|---|---|---|---|---|---|
| **PDM-R001** | Marketing/advertising tracker request observed in `no_consent` phase | NetworkRequest + TrackerDetection (conf ≥ 0.9 or corroborated) | **Critical** | "A marketing tracker was detected before consent was given." | Low | Move the tag behind consent in your CMP/GTM; verify with a re-scan |
| **PDM-R002** | Analytics tracker request observed in `no_consent` phase | NetworkRequest + TrackerDetection | **High** | "An analytics tracker was detected before consent was given." | Low | Gate analytics on consent, or configure consent-mode |
| **PDM-R003** | Non-essential third-party domain contacted in `no_consent` phase, no vendor match | NetworkRequest | Medium | "A third-party service was contacted before consent was given." | Medium | Identify the service and determine whether it needs consent |
| **PDM-R004** | Marketing/advertising tracker still fires in `reject_all` phase | NetworkRequest (phase=reject_all) + TrackerDetection + ConsentActionResult(ok) | **Critical** | "A marketing tracker continued to load after Reject All was selected." | Low | Your consent signal is not reaching this tag; check CMP↔GTM wiring |
| **PDM-R005** | Analytics tracker still fires in `reject_all` phase | Same | **High** | "An analytics tracker continued to load after Reject All was selected." | Low | As above |
| **PDM-R006** | Non-necessary cookie present after `reject_all` | Cookie(phase=reject_all) + category ≠ NECESSARY | **High** | "A non-essential cookie remained after Reject All was selected." | Medium | Ensure the CMP clears cookies on rejection |
| **PDM-R007** | Known non-essential tracker continues after `withdraw` | NetworkRequest(phase=withdraw) + TrackerDetection + withdraw ok | **Critical** | "Tracking continued after consent was withdrawn." | Medium | Verify your CMP's withdrawal handler actually removes tags |
| **PDM-R008** | Non-necessary cookie persists after `withdraw` | Cookie(phase=withdraw) | High | "A non-essential cookie remained after consent was withdrawn." | Medium | Ensure cookies are deleted on withdrawal |
| **PDM-R009** | No consent mechanism detected, yet non-essential third-party trackers fire | CmpDetection(cmpId='none') + TrackerDetection | **Critical** | "No consent mechanism was detected, and tracking services were observed." | Low | Install and configure a consent management platform |
| **PDM-R010** | CMP detected but banner never appeared within timeout | CmpDetection + ConsentActionResult(CONSENT_BANNER_TIMEOUT) | Medium | "A consent tool was found but its banner did not appear during the scan." | High | Check the CMP's script loading and geo-targeting rules |
| **PDM-R011** | Accept All present but no Reject All at the top level | ConsentActionResult(reject via preferences fallback) | Medium | "Rejecting required opening a preferences panel; no direct reject control was found." | Low | Consider offering an equally prominent reject control |
| **PDM-R012** | Reject control could not be located at all | ConsentActionResult(CONSENT_BUTTON_NOT_FOUND) | Medium | "We could not find a way to reject non-essential cookies." | High | Review the banner's controls; add a selector override if we missed it |
| **PDM-R013** | New tracker vendor since previous completed scan | DriftEvent(TRACKER_ADDED) | High (Critical if pre-consent marketing) | "A new tracking service was detected on this website." | Low | Confirm this was intended and that it is consent-gated |
| **PDM-R014** | New unknown vendor since previous scan | DriftEvent(UNKNOWN_VENDOR_ADDED) | High | "An unrecognized third-party service was detected." | Medium | Identify the service; tell us and we'll add it to our database |
| **PDM-R015** | New non-necessary cookie since previous scan | DriftEvent(COOKIE_ADDED) | Medium | "A new cookie was detected on this website." | Medium | Confirm intent and update your cookie declaration |
| **PDM-R016** | New third-party domain since previous scan | DriftEvent(THIRD_PARTY_DOMAIN_ADDED) | Low (Medium if pre-consent) | "This website started contacting a new third-party domain." | Medium | Identify the source of the new request |
| **PDM-R017** | Consent regression — Reject All previously blocked a category, now does not | DriftEvent(CONSENT_REGRESSION) + both scans COMPLETED | **Critical** | "Reject All previously blocked this category and no longer does." | Low | Something changed in the CMP or tag configuration since the last scan |
| **PDM-R018** | CMP removed — banner previously detected, now absent | DriftEvent(CMP_REMOVED) | **Critical** | "The consent banner we previously detected is no longer appearing." | Medium | Check whether the CMP plugin/script was removed or is failing to load |
| **PDM-R019** | CMP changed to a different platform | DriftEvent(CMP_CHANGED) | Medium | "This website's consent platform appears to have changed." | Low | Verify the new platform is configured correctly |
| **PDM-R020** | Third-party font/CDN request in `no_consent` phase | NetworkRequest(resourceType=font, 3P) | Low | "A third-party font service was contacted before consent." | Medium | Consider self-hosting fonts |
| **PDM-R021** | Cookie lifetime exceeds 13 months | Cookie.durationDays > 395 | Info | "A cookie with a lifetime over 13 months was detected." | Low | Review whether this duration is necessary |
| **PDM-R022** | Site served over HTTP, or mixed content observed | NetworkRequest(scheme=http) | Medium | "This website was reached over an insecure connection." | Low | Enable HTTPS and redirect all traffic to it |
| **PDM-R023** | 3+ consecutive failed scans | Scan.status=FAILED ×3 | High | "We have been unable to scan this website." | Low | Check that the site is reachable and not blocking our scanner |
| **PDM-R024** | Scan incomplete — one or more consent phases undetermined | ScanPhase.status=UNDETERMINED | Info | "Some consent tests could not be completed on this scan." | Low | See which tests were skipped and why |
| **PDM-R025** | Website unreachable | Scan.status=FAILED, error∈{DNS,TIMEOUT,CONN_REFUSED} | High | "This website could not be reached." | Low | Verify the site is online and the address is correct |

**Note on PDM-R010 and PDM-R012** — both are marked high false-positive risk deliberately. They fire when *our scanner* struggled, and must be worded as scanner limitations rather than site defects. Their UI copy leads with "We could not…" not "This site does not…".

### Severity definitions

| Severity | Definition | UI treatment | Alert default |
|---|---|---|---|
| **Critical** | Non-essential tracking observed without or against a consent signal, or a monitoring capability was lost | Red, top of every list, dashboard Attention Center | Immediate email |
| **High** | Behavior that likely needs review, or a significant change | Orange | Immediate or daily digest |
| **Medium** | Notable change or configuration weakness | Amber | Daily digest |
| **Low** | Minor observation | Blue | Weekly digest |
| **Info** | Context, no action implied | Gray | In-app only |

## 4.12 Privacy Health Score

A 0–100 explainable score. **It is a deduction model, not a black box** — every point lost has a named cause stored on the scan.

```
Score = 100 − Σ(component penalties), floored at 0
```

| Component | Weight | Penalty rules |
|---|---|---|
| **Consent controls** | 35 | No CMP detected: −35. CMP present but banner never shown: −20. Reject only via preferences: −8. Reject control not found: −12. Withdrawal untestable: −6. |
| **Tracker behavior** | 30 | Per pre-consent marketing tracker: −10 (max −20). Per pre-consent analytics tracker: −6 (max −12). Per tracker surviving Reject All: −12 (max −24). Per tracker surviving withdrawal: −8 (max −16). Component capped at −30. |
| **Change stability** | 15 | Per Critical drift event in the last 30 days: −8. Per High: −4. Per Medium: −1.5. Capped at −15. Decays: events older than 30 days stop counting. |
| **Unknown vendors** | 10 | Per unknown third-party vendor: −2.5, capped at −10. |
| **Cookie & storage behavior** | 10 | Non-necessary cookies before consent: −1.5 each (max −6). Non-necessary cookies after Reject All: −2 each (max −8). Excessive-lifetime cookies: −0.5 each (max −2). Capped at −10. |

**Rationale for the weighting.** Consent controls carry the largest weight because their absence invalidates everything else — a site with no banner cannot be assessed on tracker gating. Tracker behavior is second because it is the observable consequence. Change stability is included at 15 because this is a *monitoring* product: a site that keeps changing is riskier than a static one at the same instantaneous state, and this weight is what makes the score a monitoring signal rather than an audit snapshot. Unknown vendors at 10 reflects genuine uncertainty without over-punishing our own database gaps. Cookies at 10 because most cookie findings are downstream of tracker findings and would otherwise double-count.

**Explainability contract.** `Scan.scoreBreakdown` stores a JSON array of `{ component, penalty, reason, issueIds }`. The UI renders exactly this — the answer to "why did my score drop?" is always a database read, never an LLM call.

**Handling of incomplete scans.** A `PARTIAL_COMPLETED` scan computes a score **only from executed phases**, marks `scoreConfidence: 'partial'`, and the UI displays it as `56*` with a footnote naming the untested phases. Portfolio averages exclude partial scans unless every recent scan is partial, in which case the portfolio tile shows "limited data."

**Handling of ignored issues and false positives.** An issue set to `IGNORED` is excluded from scoring from the moment it is ignored forward. Historical scores are **not** recomputed — the score is a record of what we knew at the time, and silently rewriting history would break the trend chart's credibility. A `FALSE_POSITIVE` resolution additionally records feedback against the rule (§4.14).

**Recovery.** Fixing an issue removes its penalty on the next completed scan. Change-stability penalties decay over 30 days. There is no artificial ceiling on recovery speed — a site that fixes everything returns to 100 on the next clean scan, which is exactly the behavior an agency wants to show a client.

## 4.13 Evidence System

Every finding is backed by immutable evidence. This is the product's credibility mechanism.

```ts
interface IssueEvidence {
  id: string;
  issueId: string;
  scanId: string;
  agencyId: string;                    // denormalized for tenant-scoped access
  kind: 'network_request' | 'cookie' | 'storage_entry' | 'screenshot'
      | 'console_error' | 'consent_action' | 'drift_diff';
  pageUrl: string;
  consentPhase: ConsentPhase;
  observedAtMs: number;                // offset from navigation start
  detectionRuleId: string;
  detectionRuleVersion: number;
  confidence: number;
  payload: Json;                       // kind-specific, sanitized
  s3Key?: string;                      // screenshots / large blobs
  createdAt: Date;
}
```

**Retention** (also Part V §5.8, plan-dependent):

| Data class | Starter | Growth | Agency | Rationale |
|---|---|---|---|---|
| Scan record + findings + score | 12 mo | 24 mo | 36 mo | Drift history is the product |
| Aggregated fingerprints | Same as scan | Same | Same | Small, needed for drift |
| Full network request rows | 30 d | 90 d | 180 d | Bulk of storage; older detail is rarely opened |
| Cookie/storage rows | 90 d | 180 d | 365 d | Smaller, more frequently referenced |
| Screenshots | 30 d | 90 d | 180 d | Largest objects |
| Evidence attached to an **open** issue | **Retained regardless** until the issue closes + 30 d | | | An open issue without its evidence is useless |
| Console logs | 14 d | 30 d | 30 d | Debugging only |
| Free-scan results | 7 d | — | — | Data minimization |

A nightly `cleanup` job enforces retention per agency plan (Part VII §7.2), always exempting evidence bound to open issues.

**Immutability.** Evidence rows are insert-only. Corrections happen by superseding, never by update. The evidence table has no `updatedAt`.

## 4.14 False Positive / False Negative Strategy

A single confident false positive costs more trust than ten missed detections. The controls:

1. **Confidence thresholds by severity.** A rule may only emit Critical with detection confidence ≥ 0.9 or corroboration across two signal types. High requires ≥ 0.75. Below 0.5, findings are recorded as `UNVERIFIED` and surfaced in a separate, clearly-labeled "Needs review" section rather than as issues.
2. **Rule precedence.** The registry defines suppression pairs so one root cause yields one issue.
3. **The `UNVERIFIED` state.** A real status, not a hidden one. Users can promote it to an issue or dismiss it, and each action is feedback.
4. **User feedback loop.** Every issue offers `Resolve → Fixed` / `Resolve → False positive` / `Ignore`. False-positive resolutions write an `IssueFeedback` row (`ruleId`, `ruleVersion`, `agencyId`, `reason`, free text) surfaced in `/admin/issues` as a per-rule FP rate.
5. **Ignore rules.** Scoped ignores at three levels: this issue · this rule on this website · this vendor on this website. Stored as `IgnoreRule` and applied *at issue-creation time* so ignored findings never generate noise or alerts again. Ignores are visible, listed in settings, and reversible — never silent.
6. **Rule tuning workflow.** Because analysis is replayable over stored raw evidence, a proposed rule change is validated by re-running the new rule version against the last 30 days of stored evidence in a staging environment and diffing the findings. A rule change that would have produced > 20% more Critical issues is blocked from release pending review.
7. **Known false-negative sources — documented, not hidden.** Server-side tracking (CAPI, Measurement Protocol) is invisible to a browser scanner. Trackers that fire only on specific interactions we don't perform (form submit, checkout). Geo-gated tags that don't serve our egress region. Content behind authentication. Sites that detect and behave differently for automation. All of these are listed on `/features/*` limitation blocks and in the report appendix.

## 4.15 Scanner Test Fixtures

A local fixture server (`packages/scanner/fixtures/`, an Express app serving static pages, run in CI via Docker Compose) provides deterministic targets. Without these, scanner regressions are undetectable.

| # | Fixture | Asserts |
|---|---|---|
| F01 | No CMP, no trackers | Clean scan, score 100, `cmpId='none'`, no issues |
| F02 | No CMP, GA4 + Meta Pixel firing | PDM-R009 Critical; both vendors classified |
| F03 | CookieYes banner, correct gating | All 4 phases execute; no issues; adapter confidence 1.0 |
| F04 | Cookiebot banner, correct gating | Cookiebot adapter selected; API path used |
| F05 | Complianz banner, correct gating | Complianz adapter selected |
| F06 | OneTrust banner, correct gating | OneTrust adapter; reject via `#onetrust-reject-all-handler` |
| F07 | Usercentrics in **shadow DOM** | Shadow-piercing works; `UC_UI` API path used |
| F08 | Custom banner, plain text buttons | GenericBannerAdapter, accessible-name strategy, confidence ≥ 0.9 |
| F09 | Custom banner, icon-only reject with `aria-label` | Accessible-name strategy succeeds where text matching would fail |
| F10 | Custom banner, **only** "Manage preferences" | PDM-R011; reject via preferences fallback |
| F11 | **Pre-consent GA4** | PDM-R002 High, evidence has `consentPhase='no_consent'` |
| F12 | **Pre-consent Meta Pixel** | PDM-R001 Critical |
| F13 | **Reject All fails** — marketing tag fires anyway | PDM-R004 Critical |
| F14 | **Accept All works** | No issue from the accept phase; 14 trackers recorded |
| F15 | **Withdrawal fails** — tags continue after withdraw | PDM-R007 Critical |
| F16 | New tracker vs. a seeded previous scan | PDM-R013 + `TRACKER_ADDED` drift event |
| F17 | Unknown vendor (`weird-analytics.example`) | PDM-R014; unknown vendor recorded with domain |
| F18 | Third-party CDN + Google Fonts only | PDM-R020 Low only; no Critical |
| F19 | **SPA** (client-routed) with route-change tracking | Requests after a client-side route change are captured |
| F20 | **Heavy JS** — 5 s deferred tracker injection | The 10 s observation window catches it |
| F21 | **Iframe-hosted CMP** | Consent frame located and driven |
| F22 | Simulated bot challenge (interstitial that never resolves) | Scan → `PARTIAL`/`FAILED` with `BOT_CHALLENGE`, never a false clean |
| F23 | **Slow site** — 20 s TTFB | Navigation timeout handled; retried once; clean failure |
| F24 | **Broken site** — 500 on the document | `FAILED` with `HTTP_ERROR`, PDM-R025 |
| F25 | Cookie with a 5-year expiry | PDM-R021 Info |
| F26 | Rotating cookie names (`_cf_bm_<random>` per load) | Normalization collapses them; **no** spurious drift event |
| F27 | Cache-busted script URLs (`app.<hash>.js`) | Normalization collapses; no spurious `SCRIPT_ADDED` |
| F28 | Identical site scanned twice | **Zero drift events** — the single most important regression test |
| F29 | HTTP-only site | PDM-R022 |
| F30 | `robots.txt` disallowing our UA | Scan is skipped with a clear status when `respectRobots` is on |

**CI contract:** F01–F30 run on every PR that touches `packages/scanner`. F28 is a hard gate — any change producing spurious drift fails the build.

## 4.16 Scan Cost Control

Browser time is the dominant variable cost in the entire product. The levers below are consolidated here because they are decided together — and every one is constrained by a single rule: **never compromise evidence quality to reduce cost.** A cheaper scan that misses a tracker is not cheaper, it is worthless.

| Lever | Mechanism | Saving | Evidence impact |
|---|---|---|---|
| **Homepage-first** | Default `monitoredPaths: ['/']`; extra pages are opt-in and plan-limited | Linear — a 5-page scan costs 5× | None. Most tracking is site-wide; page count adds sub-linear detection gain (Open Question 4) |
| **Configurable page limits** | `SCAN_MAX_PAGES` + per-plan `maxPagesPerScan` | Bounds the worst case | None |
| **Browser reuse** | Pool reuses Chromium *processes* across scans; contexts are never reused | ~500 ms saved per phase (~25% of a short scan) | **None** — context isolation is preserved, which is the property that matters |
| **Resource body abortion** | Images and media recorded then aborted after headers (§4.3) | ~70% of bandwidth and a meaningful share of page-load time | **None** — the request is still fully recorded; only the bytes are discarded |
| **Screenshot policy** | `ON_CHANGE` by default: capture only when the scan produced a drift event or new issue | ~80% of screenshot storage and upload time | Minor — unchanged scans lose a visual record that duplicates the previous one |
| **Bounded retries** | Deterministic failures never retried (§4.4, §7.6) | Avoids burning browser minutes on 404s and DNS failures | None |
| **Scan budgets** | Per-plan `maxScansPerMonth`, checked in the scheduler *before* a browser is acquired | Hard ceiling per tenant | None |
| **Priority scheduling** | Manual and baseline scans jump scheduled work; free scans are on an isolated low-priority queue | Better utilization, not less compute | None |
| **Per-agency concurrency cap** | Redis counter, `min(planConcurrency, 5)` | Prevents one tenant monopolizing the pool | None |
| **Jittered scheduling** | Stable hash spreads daily scans across a 6-hour window | Flattens peak worker count, which is what actually drives the bill | None |

**Explicitly rejected cost measures:** blocking scripts or XHR (would hide the tracking we exist to find); skipping the withdrawal phase (it is where the highest-value findings are); shortening the 10 s observation window (GTM-injected pixels commonly fire late); reusing browser contexts across consent phases (would destroy consent-state attribution — the single most important field in the system).

## 4.17 Documented Scanner Limitations

These must be stated plainly on `/features/*`, in the report appendix, and in the help center. A monitoring product that overstates its coverage is worse than one that is honest about its edges.

**We cannot detect:**

| Limitation | Why | What we do about it |
|---|---|---|
| **Server-side tracking** (Meta CAPI, GA4 Measurement Protocol, server-side GTM) | It never touches the browser | Documented; the report appendix states that server-side tracking is out of scope |
| **Interaction-triggered tags** (form submit, add-to-cart, checkout) | We do not submit forms or transact | Documented; a V1.5 candidate for scripted journeys |
| **Geo-gated tags** | A tag served only to, say, US visitors will not fire for our EU egress | Documented; multi-region scanning is a V1.5 plan differentiator |
| **Content behind authentication** | We scan publicly reachable pages; basic auth only for staging | Documented in the add-website flow |
| **Sites that detect automation** | Some CMPs and WAFs behave differently for headless browsers | Recorded as `PARTIAL` with a bot-challenge error, never as clean |
| **Closed shadow DOM CMPs** | Not pierceable by any tool | `CONSENT_SHADOW_ROOT_CLOSED` → `UNDETERMINED` |
| **Every tracker in existence** | Our vendor database is finite | Unknown third parties are surfaced as unknown vendors, not silently ignored — the unknown rate is a tracked metric |

**We can produce false positives when:** an essential-category service legitimately loads pre-consent on a specific page (mitigated by `isEssentialCandidate`); a site legitimately changed and the change was intended (mitigated by drift suppression / "accept this change"); our generic adapter clicked the wrong control (mitigated by confidence scoring and selector overrides); or a rule is mis-tuned (mitigated by per-rule FP tracking and replay-based tuning, §4.14).

**We never claim:** that a website is legally compliant or non-compliant · that every tracker has been found · that a clean scan means no privacy risk exists · that our findings substitute for a legal assessment. A scan that could not complete every phase reports `PARTIAL` and names what was not tested (P6).

---

# Part V — Data Architecture

## 5.1 Design Principles

1. **Every tenant-owned row carries `agencyId`**, even when it is reachable through a parent. Denormalized on purpose: it makes tenant scoping a single indexed predicate on every query and makes an accidental cross-tenant join structurally impossible to write without noticing.
2. **UUIDv7 primary keys** (`@default(dbgenerated("uuid_generate_v7()"))` via a Postgres function, or generated in app code). Time-ordered UUIDs give us index locality without exposing sequential counts.
3. **Soft delete only where recovery matters** — `Website`, `Client`, `Agency`, `Report` use `archivedAt`/`deletedAt`. High-volume evidence tables are hard-deleted by the retention job.
4. **Evidence tables are insert-only** and have no `updatedAt`.
5. **Enums in the database** for closed sets, so an invalid state cannot be written by any path.
6. **`createdAt`/`updatedAt` on every mutable model.**
7. **Money as integer minor units** (`Int` cents), never `Float`.
8. **All timestamps `DateTime` (UTC).** Display timezone lives on `Agency.timezone` and `User.timezone` (Part XI §11.11).

## 5.2 Prisma Schema

```prisma
// packages/database/prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["relationJoins", "nativeDistinct"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Identity & Tenancy ─────────────────────────

model User {
  id            String   @id @default(uuid())
  clerkUserId   String   @unique
  email         String   @unique
  firstName     String?
  lastName      String?
  avatarUrl     String?
  timezone      String   @default("Europe/London")
  isSuperAdmin  Boolean  @default(false)
  lastActiveAt  DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  memberships       AgencyMember[]
  auditLogs         AuditLog[]
  notifications     Notification[]
  assignedIssues    Issue[]           @relation("IssueAssignee")
  createdReports    Report[]          @relation("ReportCreator")
  preferences       UserPreference[]
  sentInvitations   Invitation[]      @relation("InvitationInviter")

  @@index([clerkUserId])
  @@index([email])
  @@map("users")
}

model Agency {
  id              String   @id @default(uuid())
  clerkOrgId      String   @unique
  name            String
  slug            String   @unique
  websiteUrl      String?
  timezone        String   @default("Europe/London")
  dateFormat      String   @default("DD/MM/YYYY")
  agencyType      String?              // onboarding signal: 'wordpress' | 'seo' | 'full-service' | ...
  status          AgencyStatus @default(ACTIVE)
  suspendedAt     DateTime?
  suspendedReason String?
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  members            AgencyMember[]
  clients            Client[]
  websites           Website[]
  websiteGroups      WebsiteGroup[]
  scans              Scan[]
  issues             Issue[]
  reports            Report[]
  invitations        Invitation[]
  auditLogs          AuditLog[]
  subscription       Subscription?
  branding           AgencyBranding?
  scanSettings       AgencyScanSettings?
  aiSettings         AgencyAiSettings?
  notificationPrefs  NotificationPreference[]
  alertRules         AlertRule[]
  usageRecords       UsageRecord[]
  aiRequests         AIRequest[]
  driftEvents        PrivacyDriftEvent[]
  ignoreRules        IgnoreRule[]
  driftSuppressions  DriftSuppression[]
  featureFlagOverrides FeatureFlagOverride[]
  portalUsers        PortalUser[]

  @@index([clerkOrgId])
  @@index([slug])
  @@index([status])
  @@map("agencies")
}

enum AgencyStatus { ACTIVE SUSPENDED CANCELLED }

model AgencyMember {
  id        String     @id @default(uuid())
  agencyId  String
  userId    String
  role      AgencyRole @default(VIEWER)
  status    MemberStatus @default(ACTIVE)
  // Optional scoping: if non-empty, this member may only access these websites
  websiteScope String[] @default([])
  joinedAt  DateTime   @default(now())
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId],   references: [id], onDelete: Cascade)

  @@unique([agencyId, userId])
  @@index([agencyId, role])
  @@index([userId])
  @@map("agency_members")
}

enum AgencyRole { OWNER ADMIN MANAGER DEVELOPER VIEWER }
enum MemberStatus { ACTIVE SUSPENDED }

model Invitation {
  id         String   @id @default(uuid())
  agencyId   String
  email      String
  role       AgencyRole
  token      String   @unique          // hashed
  invitedById String
  expiresAt  DateTime
  acceptedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  agency    Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  invitedBy User   @relation("InvitationInviter", fields: [invitedById], references: [id])

  @@unique([agencyId, email])
  @@index([token])
  @@index([expiresAt])
  @@map("invitations")
}

model AgencyBranding {
  id                String  @id @default(uuid())
  agencyId          String  @unique
  companyName       String?
  logoLightUrl      String?
  logoDarkUrl       String?
  primaryColor      String  @default("#2563eb")
  accentColor       String  @default("#0ea5e9")
  contactEmail      String?
  contactPhone      String?
  reportFooterText  String?
  customDisclaimer  String?
  portalWelcomeText String?
  updatedAt         DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  @@map("agency_branding")
}

model AgencyScanSettings {
  id                  String  @id @default(uuid())
  agencyId            String  @unique
  defaultFrequency    ScanFrequency @default(WEEKLY)
  defaultPageLimit    Int     @default(1)
  defaultPriority     ScanPriority  @default(NORMAL)
  screenshotPolicy    ScreenshotPolicy @default(ON_CHANGE)
  respectRobots       Boolean @default(true)
  userAgentSuffix     String?
  ignoredDomains      String[] @default([])   // agency's own CDN etc.
  evidenceRetentionDays Int?                  // capped by plan
  updatedAt           DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  @@map("agency_scan_settings")
}

enum ScreenshotPolicy { ALWAYS ON_CHANGE NEVER }

model AgencyAiSettings {
  id                    String  @id @default(uuid())
  agencyId              String  @unique
  aiEnabled             Boolean @default(true)
  autoExplainCritical   Boolean @default(true)
  modelTier             AiModelTier @default(STANDARD)
  monthlyCreditCap      Int?                    // null = plan default
  featureToggles        Json    @default("{}")  // { explainIssue: true, recommendFix: true, ... }
  updatedAt             DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  @@map("agency_ai_settings")
}

enum AiModelTier { STANDARD ADVANCED }

model UserPreference {
  id        String @id @default(uuid())
  userId    String
  agencyId  String
  key       String            // 'issues.savedViews', 'sidebar.collapsed', ...
  value     Json
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, agencyId, key])
  @@map("user_preferences")
}

// ───────────────────────── Clients & Websites ─────────────────────────

model Client {
  id            String  @id @default(uuid())
  agencyId      String
  name          String
  slug          String
  logoUrl       String?
  contactName   String?
  contactEmail  String?
  contactPhone  String?
  notes         String?              // INTERNAL — never rendered in portal or reports
  portalEnabled Boolean @default(false)
  archivedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  agency      Agency       @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  websites    Website[]
  reports     Report[]
  portalUsers PortalUser[]

  @@unique([agencyId, slug])
  @@index([agencyId, archivedAt])
  @@map("clients")
}

model WebsiteGroup {
  id        String @id @default(uuid())
  agencyId  String
  name      String
  color     String?
  createdAt DateTime @default(now())

  agency   Agency    @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  websites Website[]

  @@unique([agencyId, name])
  @@map("website_groups")
}

model Website {
  id                 String  @id @default(uuid())
  agencyId           String
  clientId           String?
  groupId            String?

  url                String                 // canonical monitored URL
  originalUrl        String                 // exactly what the user typed
  registrableDomain  String                 // eTLD+1, from the PSL
  host               String
  label              String?
  faviconUrl         String?

  monitoringStatus   MonitoringStatus @default(ACTIVE)
  scanFrequency      ScanFrequency    @default(WEEKLY)
  scanPriority       ScanPriority     @default(NORMAL)
  monitoredPaths     String[]         @default(["/"])
  alertProfile       AlertProfile     @default(DEFAULT)
  consentOverride    Json?                  // adapter + selector overrides
  basicAuthSecretRef String?                // reference into the secret store, never the credential
  respectRobots      Boolean?               // null = inherit agency setting

  healthScore        Int?
  scoreConfidence    ScoreConfidence?
  lastScanId         String?
  lastScanAt         DateTime?
  lastSuccessfulScanAt DateTime?
  nextScanAt         DateTime?
  baselineScanId     String?
  consecutiveFailures Int  @default(0)
  detectedCmpId      String?
  openIssueCount     Int  @default(0)       // denormalized counter, maintained transactionally
  criticalIssueCount Int  @default(0)
  trackerCount       Int  @default(0)

  archivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  agency        Agency              @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  client        Client?             @relation(fields: [clientId], references: [id], onDelete: SetNull)
  group         WebsiteGroup?       @relation(fields: [groupId],  references: [id], onDelete: SetNull)
  scans         Scan[]
  issues        Issue[]
  driftEvents   PrivacyDriftEvent[]
  reports       Report[]
  ignoreRules   IgnoreRule[]
  suppressions  DriftSuppression[]

  @@unique([agencyId, url])
  @@index([agencyId, monitoringStatus, archivedAt])
  @@index([agencyId, clientId])
  @@index([agencyId, healthScore])
  @@index([nextScanAt, monitoringStatus])        // the scheduler's hot query
  @@index([registrableDomain])
  @@map("websites")
}

enum MonitoringStatus { ACTIVE PAUSED ERROR }
enum ScanFrequency    { DAILY WEEKLY MONTHLY MANUAL }
enum ScanPriority     { LOW NORMAL HIGH }
enum AlertProfile     { DEFAULT CRITICAL_ONLY SILENT }
enum ScoreConfidence  { FULL PARTIAL }

// ───────────────────────── Scans & Evidence ─────────────────────────

model Scan {
  id             String @id @default(uuid())
  agencyId       String
  websiteId      String

  status         ScanStatus  @default(QUEUED)
  trigger        ScanTrigger
  triggeredById  String?
  idempotencyKey String?     @unique          // prevents duplicate manual scans

  queuedAt       DateTime @default(now())
  startedAt      DateTime?
  finishedAt     DateTime?
  durationMs     Int?
  queueWaitMs    Int?

  scannerVersion String
  browserVersion String?
  workerId       String?
  userAgent      String?
  viewportWidth  Int?
  viewportHeight Int?

  detectedCmpId       String?
  detectedCmpName     String?
  detectedCmpVersion  String?
  cmpConfidence       Float?

  pagesScanned        Int  @default(0)
  requestCount        Int  @default(0)
  thirdPartyDomainCount Int @default(0)
  cookieCount         Int  @default(0)
  storageKeyCount     Int  @default(0)
  trackerCount        Int  @default(0)
  issueCount          Int  @default(0)

  healthScore     Int?
  scoreConfidence ScoreConfidence?
  scoreBreakdown  Json?                       // [{component, penalty, reason, issueIds}]
  fingerprints    Json?                       // normalized sets used by the drift engine

  errorCode    String?
  errorMessage String?
  errorPhase   String?

  createdAt DateTime @default(now())

  agency        Agency              @relation(fields: [agencyId],  references: [id], onDelete: Cascade)
  website       Website             @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  phases        ScanPhase[]
  pages         ScanPage[]
  requests      NetworkRequest[]
  cookies       CookieRecord[]
  storage       StorageEntry[]
  detections    TrackerDetection[]
  screenshots   Screenshot[]
  consoleLogs   ConsoleLog[]
  issues        Issue[]
  evidence      IssueEvidence[]
  driftEvents   PrivacyDriftEvent[] @relation("DriftCurrentScan")
  driftPrevious PrivacyDriftEvent[] @relation("DriftPreviousScan")

  @@index([agencyId, createdAt(sort: Desc)])
  @@index([websiteId, createdAt(sort: Desc)])
  @@index([websiteId, status, finishedAt(sort: Desc)])
  @@index([status, queuedAt])
  @@map("scans")
}

enum ScanStatus  { QUEUED RUNNING COMPLETED PARTIAL FAILED CANCELLED }
enum ScanTrigger { SCHEDULED MANUAL VERIFICATION ONBOARDING API FREE_PUBLIC }

model ScanPhase {
  id            String @id @default(uuid())
  scanId        String
  agencyId      String
  phase         ConsentPhase
  status        PhaseStatus
  startedAt     DateTime?
  finishedAt    DateTime?
  durationMs    Int?
  actionMethod  String?          // 'api_call' | 'accessible_name' | ...
  actionConfidence Float?
  selectorUsed  String?
  elementText   String?
  inIframe      Boolean @default(false)
  bannerDismissed Boolean?
  errorCode     String?
  errorMessage  String?

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)

  @@unique([scanId, phase])
  @@index([scanId])
  @@map("scan_phases")
}

enum ConsentPhase { NO_CONSENT REJECT_ALL ACCEPT_ALL WITHDRAW }
enum PhaseStatus  { EXECUTED UNDETERMINED SKIPPED FAILED }

model ScanPage {
  id          String @id @default(uuid())
  scanId      String
  agencyId    String
  url         String
  path        String
  status      Int?
  loadTimeMs  Int?
  errorCode   String?

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  @@index([scanId])
  @@map("scan_pages")
}

model NetworkRequest {
  id                String @id @default(uuid())
  scanId            String
  agencyId          String
  pageUrl           String
  consentPhase      ConsentPhase

  url               String            // sanitized
  method            String
  resourceType      String
  host              String
  registrableDomain String
  isThirdParty      Boolean
  status            Int?
  failureText       String?
  initiatorType     String?
  initiatorUrl      String?
  timestampMs       Int
  transferSize      Int?
  redirectChain     String[] @default([])
  setCookieCount    Int      @default(0)
  trackerVendorId   String?

  createdAt DateTime @default(now())

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)

  @@index([scanId, consentPhase])
  @@index([scanId, isThirdParty])
  @@index([scanId, registrableDomain])
  @@index([scanId, trackerVendorId])
  @@map("network_requests")
}

model CookieRecord {
  id            String @id @default(uuid())
  scanId        String
  agencyId      String
  consentPhase  ConsentPhase
  snapshotPoint String              // 'after_nav' | 'after_settle' | 'after_action' | 'phase_end'

  name          String
  domain        String
  path          String
  isSession     Boolean
  durationDays  Int?
  secure        Boolean
  httpOnly      Boolean
  sameSite      String?
  isThirdParty  Boolean
  valueHash     String?
  valueLength   Int?
  valueRaw      String?             // ONLY for allowlisted consent-signal cookies
  trackerVendorId String?
  category      TrackerCategory @default(UNKNOWN)

  createdAt DateTime @default(now())

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)

  @@index([scanId, consentPhase])
  @@index([scanId, category])
  @@index([scanId, name])
  @@map("cookie_records")
}

model StorageEntry {
  id           String @id @default(uuid())
  scanId       String
  agencyId     String
  consentPhase ConsentPhase
  storageType  String              // 'localStorage' | 'sessionStorage' | 'indexedDB'
  key          String
  valueLength  Int?
  valueHash    String?
  origin       String
  trackerVendorId String?

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  @@index([scanId, consentPhase])
  @@map("storage_entries")
}

model ConsoleLog {
  id        String @id @default(uuid())
  scanId    String
  agencyId  String
  level     String
  message   String
  source    String?
  createdAt DateTime @default(now())

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  @@index([scanId])
  @@map("console_logs")
}

model Screenshot {
  id           String @id @default(uuid())
  scanId       String
  agencyId     String
  consentPhase ConsentPhase
  kind         String            // 'banner-initial' | 'banner-preferences' | 'post-reject' | 'full-page'
  s3Key        String
  width        Int
  height       Int
  sizeBytes    Int
  createdAt    DateTime @default(now())

  scan Scan @relation(fields: [scanId], references: [id], onDelete: Cascade)
  @@index([scanId, consentPhase])
  @@map("screenshots")
}

// ───────────────────────── Trackers ─────────────────────────

model TrackerVendor {
  id                     String  @id @default(uuid())
  slug                   String  @unique
  name                   String
  vendorCompany          String?
  category               TrackerCategory
  riskLevel              RiskLevel
  domainPatterns         String[]
  scriptPatterns         String[]
  cookiePatterns         String[]
  storagePatterns        String[]
  requestPathPatterns    String[]
  documentationUrl       String?
  privacyPolicyUrl       String?
  dataProcessingLocation String?
  baseConfidence         Float   @default(0.9)
  aliases                String[] @default([])
  isEssentialCandidate   Boolean @default(false)
  isActive               Boolean @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  detections TrackerDetection[]

  @@index([category])
  @@index([slug])
  @@map("tracker_vendors")
}

enum TrackerCategory { NECESSARY ANALYTICS MARKETING ADVERTISING FUNCTIONAL SOCIAL UNKNOWN }
enum RiskLevel       { CRITICAL HIGH MEDIUM LOW }

model TrackerDetection {
  id                String @id @default(uuid())
  scanId            String
  agencyId          String
  websiteId         String
  vendorId          String?                 // null for unknown vendors
  unknownDomain     String?                 // set when vendorId is null
  consentPhase      ConsentPhase
  firstSeenAtMs     Int
  requestCount      Int    @default(1)
  matchedVia        String                  // 'domain_exact' | 'cookie_name' | ...
  confidence        Float
  corroborated      Boolean @default(false)
  evidenceSummary   Json

  createdAt DateTime @default(now())

  scan   Scan           @relation(fields: [scanId],   references: [id], onDelete: Cascade)
  vendor TrackerVendor? @relation(fields: [vendorId], references: [id], onDelete: SetNull)

  @@index([scanId, consentPhase])
  @@index([websiteId, vendorId])
  @@index([agencyId, vendorId])
  @@index([unknownDomain])
  @@map("tracker_detections")
}

// ───────────────────────── Issues & Drift ─────────────────────────

model Issue {
  id             String @id @default(uuid())
  agencyId       String
  websiteId      String
  firstScanId    String
  lastScanId     String

  ruleId         String
  ruleVersion    Int
  fingerprint    String              // stable identity across scans; dedupe key
  category       IssueCategory
  severity       Severity
  status         IssueStatus @default(NEW)
  confidence     Float
  title          String
  message        String              // deterministic, rule-authored
  technicalReason String
  recommendedAction String

  assignedToId   String?
  firstDetectedAt DateTime
  lastSeenAt      DateTime
  occurrenceCount Int @default(1)

  acknowledgedAt  DateTime?
  acknowledgedById String?
  resolvedAt      DateTime?
  resolvedById    String?
  resolution      IssueResolution?
  resolutionNote  String?
  ignoredAt       DateTime?
  ignoredById     String?
  ignoreReason    String?
  verifiedAt      DateTime?
  verificationScanId String?

  driftEventId   String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agency     Agency          @relation(fields: [agencyId],  references: [id], onDelete: Cascade)
  website    Website         @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  scan       Scan            @relation(fields: [lastScanId], references: [id], onDelete: Cascade)
  assignedTo User?           @relation("IssueAssignee", fields: [assignedToId], references: [id], onDelete: SetNull)
  evidence   IssueEvidence[]
  activities IssueActivity[]
  aiOutputs  AIRequest[]
  feedback   IssueFeedback[]

  @@unique([websiteId, fingerprint])
  @@index([agencyId, status, severity])
  @@index([agencyId, createdAt(sort: Desc)])
  @@index([websiteId, status])
  @@index([assignedToId, status])
  @@index([ruleId])
  @@map("issues")
}

enum IssueCategory   { PRE_CONSENT_TRACKING CONSENT_FAILURE CONSENT_MISSING COOKIE_BEHAVIOR NEW_TRACKER UNKNOWN_VENDOR DRIFT SCAN_HEALTH TRANSPORT_SECURITY }
enum Severity        { CRITICAL HIGH MEDIUM LOW INFO }
enum IssueStatus     { NEW ACKNOWLEDGED IN_PROGRESS RESOLVED VERIFIED IGNORED REOPENED UNVERIFIED }
enum IssueResolution { FIXED FALSE_POSITIVE WONT_FIX EXPECTED_BEHAVIOR }

model IssueEvidence {
  id                  String @id @default(uuid())
  issueId             String
  scanId              String
  agencyId            String
  kind                EvidenceKind
  pageUrl             String
  consentPhase        ConsentPhase
  observedAtMs        Int
  detectionRuleId     String
  detectionRuleVersion Int
  confidence          Float
  payload             Json
  s3Key               String?
  createdAt           DateTime @default(now())

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  scan  Scan  @relation(fields: [scanId],  references: [id], onDelete: Cascade)

  @@index([issueId])
  @@index([scanId])
  @@index([agencyId])
  @@map("issue_evidence")
}

enum EvidenceKind { NETWORK_REQUEST COOKIE STORAGE_ENTRY SCREENSHOT CONSOLE_ERROR CONSENT_ACTION DRIFT_DIFF }

model IssueActivity {
  id        String @id @default(uuid())
  issueId   String
  agencyId  String
  actorId   String?
  actorType String            // 'user' | 'system' | 'scanner'
  type      String            // 'status_changed' | 'assigned' | 'comment' | 'rescanned'
  fromValue String?
  toValue   String?
  note      String?
  createdAt DateTime @default(now())

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  @@index([issueId, createdAt])
  @@map("issue_activities")
}

model IssueFeedback {
  id          String @id @default(uuid())
  issueId     String
  agencyId    String
  userId      String
  ruleId      String
  ruleVersion Int
  verdict     String            // 'false_positive' | 'accurate' | 'unclear'
  note        String?
  createdAt   DateTime @default(now())

  issue Issue @relation(fields: [issueId], references: [id], onDelete: Cascade)
  @@index([ruleId, verdict])
  @@map("issue_feedback")
}

model IgnoreRule {
  id         String @id @default(uuid())
  agencyId   String
  websiteId  String?             // null = agency-wide
  scope      String              // 'issue' | 'rule_on_website' | 'vendor_on_website'
  ruleId     String?
  vendorId   String?
  fingerprint String?
  reason     String
  createdById String
  expiresAt  DateTime?
  createdAt  DateTime @default(now())

  agency  Agency   @relation(fields: [agencyId],  references: [id], onDelete: Cascade)
  website Website? @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  @@index([agencyId, websiteId])
  @@map("ignore_rules")
}

model PrivacyDriftEvent {
  id             String @id @default(uuid())
  agencyId       String
  websiteId      String
  currentScanId  String
  previousScanId String

  changeType   DriftChangeType
  severity     Severity
  summary      String
  addedItems   Json      @default("[]")
  removedItems Json      @default("[]")
  beforeValue  Json?
  afterValue   Json?
  issueId      String?
  acknowledged Boolean   @default(false)
  acknowledgedById String?
  aiSummary    String?

  detectedAt DateTime @default(now())

  agency       Agency  @relation(fields: [agencyId],       references: [id], onDelete: Cascade)
  website      Website @relation(fields: [websiteId],      references: [id], onDelete: Cascade)
  currentScan  Scan    @relation("DriftCurrentScan",  fields: [currentScanId],  references: [id], onDelete: Cascade)
  previousScan Scan    @relation("DriftPreviousScan", fields: [previousScanId], references: [id], onDelete: Cascade)

  @@index([agencyId, detectedAt(sort: Desc)])
  @@index([websiteId, detectedAt(sort: Desc)])
  @@index([agencyId, changeType, detectedAt(sort: Desc)])
  @@index([agencyId, severity, detectedAt(sort: Desc)])
  @@map("privacy_drift_events")
}

enum DriftChangeType {
  TRACKER_ADDED TRACKER_REMOVED UNKNOWN_VENDOR_ADDED
  COOKIE_ADDED COOKIE_REMOVED
  THIRD_PARTY_DOMAIN_ADDED THIRD_PARTY_DOMAIN_REMOVED
  SCRIPT_ADDED SCRIPT_REMOVED
  CONSENT_BEHAVIOR_CHANGED CONSENT_REGRESSION
  CMP_CHANGED CMP_REMOVED
  TRACKER_COUNT_DELTA SCORE_DROP
}

model DriftSuppression {
  id          String @id @default(uuid())
  agencyId    String
  websiteId   String
  changeType  DriftChangeType
  fingerprint String
  reason      String?
  createdById String
  createdAt   DateTime @default(now())

  agency  Agency  @relation(fields: [agencyId],  references: [id], onDelete: Cascade)
  website Website @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  @@unique([websiteId, changeType, fingerprint])
  @@map("drift_suppressions")
}

// ───────────────────────── Reports & Notifications ─────────────────────────

model Report {
  id           String @id @default(uuid())
  agencyId     String
  clientId     String?
  websiteId    String?
  createdById  String

  type         ReportType
  status       ReportStatus @default(QUEUED)
  name         String
  periodStart  DateTime?
  periodEnd    DateTime?
  options      Json      @default("{}")
  brandingSnapshot Json?                   // frozen at generation time
  idempotencyKey String? @unique

  s3Key        String?
  sizeBytes    Int?
  pageCount    Int?
  generatedAt  DateTime?
  errorCode    String?
  errorMessage String?
  downloadCount Int @default(0)
  lastDownloadedAt DateTime?

  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agency    Agency   @relation(fields: [agencyId],  references: [id], onDelete: Cascade)
  client    Client?  @relation(fields: [clientId],  references: [id], onDelete: SetNull)
  website   Website? @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  createdBy User     @relation("ReportCreator", fields: [createdById], references: [id])
  shares    ReportShare[]

  @@index([agencyId, createdAt(sort: Desc)])
  @@index([agencyId, clientId])
  @@index([status])
  @@map("reports")
}

enum ReportType   { SCAN ISSUE MONTHLY_MONITORING WEBSITE_HEALTH PRIVACY_DRIFT }
enum ReportStatus { QUEUED GENERATING READY FAILED }

model ReportShare {
  id         String @id @default(uuid())
  reportId   String
  agencyId   String
  token      String   @unique
  expiresAt  DateTime
  createdById String
  revokedAt  DateTime?
  accessCount Int     @default(0)
  createdAt  DateTime @default(now())

  report Report @relation(fields: [reportId], references: [id], onDelete: Cascade)
  @@index([token])
  @@map("report_shares")
}

model Notification {
  id        String @id @default(uuid())
  agencyId  String
  userId    String
  type      NotificationType
  severity  Severity @default(INFO)
  title     String
  body      String
  linkUrl   String?
  entityType String?
  entityId  String?
  readAt    DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt(sort: Desc)])
  @@index([agencyId, createdAt(sort: Desc)])
  @@map("notifications")
}

enum NotificationType {
  CRITICAL_ISSUE NEW_TRACKER CONSENT_REGRESSION PRIVACY_DRIFT
  SCAN_FAILED SCAN_PARTIAL WEBSITE_UNREACHABLE
  REPORT_READY REPORT_FAILED
  MEMBER_JOINED TRIAL_ENDING PAYMENT_FAILED PLAN_CHANGED
  AI_QUOTA_WARNING USAGE_LIMIT_WARNING
}

model NotificationPreference {
  id        String @id @default(uuid())
  agencyId  String
  userId    String
  type      NotificationType
  inApp     Boolean @default(true)
  email     Boolean @default(true)
  digest    DigestFrequency @default(IMMEDIATE)
  updatedAt DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)

  @@unique([userId, agencyId, type])
  @@map("notification_preferences")
}

enum DigestFrequency { IMMEDIATE DAILY WEEKLY NEVER }

model AlertRule {
  id           String @id @default(uuid())
  agencyId     String
  name         String
  enabled      Boolean @default(true)
  scopeType    String            // 'all' | 'group' | 'client' | 'website'
  scopeId      String?
  triggerTypes NotificationType[]
  minSeverity  Severity @default(HIGH)
  channels     String[] @default(["email","in_app"])
  digest       DigestFrequency @default(IMMEDIATE)
  quietHoursStart String?        // 'HH:mm' in the agency timezone
  quietHoursEnd   String?
  recipients   String[] @default([])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agency  Agency      @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  history AlertHistory[]

  @@index([agencyId, enabled])
  @@map("alert_rules")
}

model AlertHistory {
  id           String @id @default(uuid())
  alertRuleId  String?
  agencyId     String
  type         NotificationType
  channel      String
  recipients   String[]
  entityType   String?
  entityId     String?
  status       String            // 'sent' | 'failed' | 'suppressed_quiet_hours' | 'suppressed_digest'
  providerId   String?           // Resend message id
  deliveredAt  DateTime?
  openedAt     DateTime?
  errorMessage String?
  createdAt    DateTime @default(now())

  alertRule AlertRule? @relation(fields: [alertRuleId], references: [id], onDelete: SetNull)
  @@index([agencyId, createdAt(sort: Desc)])
  @@map("alert_history")
}

// ───────────────────────── Client Portal ─────────────────────────

model PortalUser {
  id            String @id @default(uuid())
  agencyId      String
  clientId      String
  email         String
  name          String?
  status        PortalUserStatus @default(INVITED)
  invitedById   String
  inviteToken   String?  @unique     // hashed
  inviteExpiresAt DateTime?
  lastLoginAt   DateTime?
  revokedAt     DateTime?
  createdAt     DateTime @default(now())

  agency   Agency        @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  client   Client        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  sessions PortalSession[]

  @@unique([clientId, email])
  @@index([agencyId])
  @@map("portal_users")
}

enum PortalUserStatus { INVITED ACTIVE REVOKED }

model PortalSession {
  id           String @id @default(uuid())
  portalUserId String
  agencyId     String
  clientId     String
  tokenHash    String   @unique
  expiresAt    DateTime
  ipHash       String?
  userAgent    String?
  revokedAt    DateTime?
  createdAt    DateTime @default(now())

  portalUser PortalUser @relation(fields: [portalUserId], references: [id], onDelete: Cascade)
  @@index([tokenHash])
  @@index([expiresAt])
  @@map("portal_sessions")
}

// ───────────────────────── Billing ─────────────────────────

model Plan {
  id            String  @id @default(uuid())
  key           String  @unique      // 'starter' | 'growth' | 'agency' | 'scale'
  name          String
  description   String?
  isPublic      Boolean @default(true)
  sortOrder     Int     @default(0)

  stripeProductId       String?
  stripePriceMonthlyId  String?
  stripePriceAnnualId   String?
  priceMonthlyCents     Int
  priceAnnualCents      Int
  currency              String @default("usd")

  entitlements Json                  // see EntitlementSet in Part IX

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  subscriptions Subscription[]
  @@map("plans")
}

model Subscription {
  id                   String @id @default(uuid())
  agencyId             String @unique
  planId               String

  stripeCustomerId     String  @unique
  stripeSubscriptionId String? @unique
  status               SubscriptionStatus @default(TRIALING)
  interval             BillingInterval    @default(MONTHLY)

  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  trialEndsAt          DateTime?
  cancelAtPeriodEnd    Boolean @default(false)
  canceledAt           DateTime?
  endedAt              DateTime?

  entitlementOverrides Json?              // admin-granted extras

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  plan   Plan   @relation(fields: [planId],   references: [id])

  @@index([status])
  @@index([stripeCustomerId])
  @@map("subscriptions")
}

enum SubscriptionStatus { TRIALING ACTIVE PAST_DUE CANCELED UNPAID INCOMPLETE INCOMPLETE_EXPIRED PAUSED }
enum BillingInterval    { MONTHLY ANNUAL }

model UsageRecord {
  id          String @id @default(uuid())
  agencyId    String
  periodStart DateTime
  periodEnd   DateTime
  metric      UsageMetric
  quantity    Int      @default(0)
  updatedAt   DateTime @updatedAt

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)

  @@unique([agencyId, periodStart, metric])
  @@index([agencyId, metric])
  @@map("usage_records")
}

enum UsageMetric { SCANS AI_CREDITS REPORTS STORAGE_BYTES WEBSITES SEATS }

model StripeWebhookEvent {
  id            String @id @default(uuid())
  stripeEventId String @unique
  type          String
  status        String            // 'received' | 'processed' | 'failed' | 'ignored'
  payload       Json
  error         String?
  attempts      Int      @default(0)
  processedAt   DateTime?
  createdAt     DateTime @default(now())

  @@index([type, createdAt(sort: Desc)])
  @@index([status])
  @@map("stripe_webhook_events")
}

// ───────────────────────── AI ─────────────────────────

model AIRequest {
  id            String @id @default(uuid())
  agencyId      String
  userId        String?
  feature       AIFeature
  provider      String            // 'openai'
  model         String
  status        AIRequestStatus @default(PENDING)

  entityType    String?
  entityId      String?
  issueId       String?

  inputHash     String            // cache key over the structured evidence context
  promptTokens  Int?
  completionTokens Int?
  totalTokens   Int?
  costMicroCents Int?
  latencyMs     Int?

  output        Json?
  validationErrors Json?
  errorCode     String?
  errorMessage  String?
  fromCache     Boolean @default(false)
  feedbackScore Int?              // -1 | 0 | 1

  createdAt DateTime @default(now())

  agency Agency @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  issue  Issue? @relation(fields: [issueId],  references: [id], onDelete: SetNull)

  @@index([agencyId, createdAt(sort: Desc)])
  @@index([agencyId, feature])
  @@index([inputHash])
  @@index([status])
  @@map("ai_requests")
}

enum AIFeature { EXPLAIN_ISSUE RECOMMEND_FIX SUMMARIZE_DRIFT CLIENT_MESSAGE CLASSIFY_TRACKER ROOT_CAUSE DEVELOPER_TASK WEBSITE_SUMMARY }
enum AIRequestStatus { PENDING SUCCESS VALIDATION_FAILED PROVIDER_ERROR RATE_LIMITED CACHED }

// ───────────────────────── Platform ─────────────────────────

model AuditLog {
  id         String @id @default(uuid())
  agencyId   String?
  userId     String?
  actorType  String            // 'user' | 'system' | 'admin' | 'portal_user'
  action     String            // 'website.created' | 'issue.status_changed' | ...
  entityType String
  entityId   String
  before     Json?
  after      Json?
  ipHash     String?
  userAgent  String?
  metadata   Json?
  createdAt  DateTime @default(now())

  agency Agency? @relation(fields: [agencyId], references: [id], onDelete: Cascade)
  user   User?   @relation(fields: [userId],   references: [id], onDelete: SetNull)

  @@index([agencyId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([action])
  @@map("audit_logs")
}

model FeatureFlag {
  id           String @id @default(uuid())
  key          String @unique
  description  String?
  enabled      Boolean @default(false)
  rolloutPercent Int   @default(0)
  planKeys     String[] @default([])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  overrides FeatureFlagOverride[]
  @@map("feature_flags")
}

model FeatureFlagOverride {
  id       String  @id @default(uuid())
  flagId   String
  agencyId String
  enabled  Boolean
  createdAt DateTime @default(now())

  flag   FeatureFlag @relation(fields: [flagId],   references: [id], onDelete: Cascade)
  agency Agency      @relation(fields: [agencyId], references: [id], onDelete: Cascade)

  @@unique([flagId, agencyId])
  @@map("feature_flag_overrides")
}

model SystemLog {
  id        String @id @default(uuid())
  level     String
  service   String            // 'web' | 'worker:scanner' | 'worker:reports' | ...
  message   String
  context   Json?
  agencyId  String?
  scanId    String?
  createdAt DateTime @default(now())

  @@index([level, createdAt(sort: Desc)])
  @@index([service, createdAt(sort: Desc)])
  @@map("system_logs")
}

model FreeScan {
  id            String @id @default(uuid())
  token         String @unique
  url           String
  registrableDomain String
  ipHash        String
  status        ScanStatus @default(QUEUED)
  healthScore   Int?
  resultSummary Json?
  email         String?
  convertedAgencyId String?
  expiresAt     DateTime
  createdAt     DateTime @default(now())

  @@index([token])
  @@index([registrableDomain, createdAt])
  @@index([ipHash, createdAt])
  @@index([expiresAt])
  @@map("free_scans")
}
```

## 5.3 Index Rationale

| Index | Query it serves | Why |
|---|---|---|
| `websites(nextScanAt, monitoringStatus)` | Scheduler: "which sites are due?" | Runs every minute across all tenants; without it this is a full scan of the largest table |
| `websites(agencyId, monitoringStatus, archivedAt)` | Website list, default filter | The single most-hit list query |
| `websites(agencyId, healthScore)` | Dashboard "needs attention" top-10 | Avoids a sort over the whole tenant |
| `scans(websiteId, createdAt DESC)` | Website scan history; "previous completed scan" lookup for drift | Descending index matches the access pattern exactly |
| `scans(websiteId, status, finishedAt DESC)` | Drift engine's "previous COMPLETED scan" | Composite avoids a filter-then-sort |
| `scans(status, queuedAt)` | Admin queue view; stuck-scan detection | Small, high-value |
| `network_requests(scanId, consentPhase)` | Evidence viewer's default filter | The largest table by row count; every access is scan-scoped |
| `network_requests(scanId, isThirdParty)` | "Third-party only" toggle | Very common filter |
| `network_requests(scanId, registrableDomain)` | Domain drill-down and fingerprint building | Drift engine reads this per scan |
| `cookie_records(scanId, consentPhase)` | Cookie comparison matrix | Four reads per scan detail page |
| `tracker_detections(websiteId, vendorId)` | "Where does Meta appear?" | Portfolio tracker page |
| `tracker_detections(agencyId, vendorId)` | Portfolio vendor exposure | Cross-website aggregate |
| `issues(agencyId, status, severity)` | Issue queue default view + dashboard counts | The hottest list query in the app |
| `issues(websiteId, fingerprint)` UNIQUE | Issue deduplication across scans | **Correctness**, not just speed — prevents duplicate issues |
| `issues(assignedToId, status)` | "My issues" saved view | |
| `issues(ruleId)` | Admin rule analytics / FP rate | |
| `privacy_drift_events(agencyId, detectedAt DESC)` | Drift feed | Primary feed query |
| `privacy_drift_events(websiteId, detectedAt DESC)` | Website Changes tab | |
| `privacy_drift_events(agencyId, changeType, detectedAt DESC)` | Filtered drift feed | |
| `notifications(userId, readAt, createdAt DESC)` | Bell badge + notification center | Partial-index candidate on `readAt IS NULL` |
| `ai_requests(inputHash)` | AI response cache lookup | Direct cost saving |
| `ai_requests(agencyId, createdAt DESC)` | Usage metering and the AI settings chart | |
| `usage_records(agencyId, periodStart, metric)` UNIQUE | Entitlement checks on every scan/AI call | **Correctness** — the upsert target |
| `audit_logs(agencyId, createdAt DESC)` | Audit viewer | |
| `free_scans(ipHash, createdAt)` / `(registrableDomain, createdAt)` | Anonymous rate limiting | Abuse control |

**Partitioning (deferred, planned).** `network_requests`, `cookie_records`, and `audit_logs` are the growth tables. **ASSUMPTION:** at ~1,000 agencies these reach a scale where monthly range partitioning on `createdAt` becomes worthwhile, primarily because it makes retention deletion a partition `DROP` instead of a mass `DELETE`. The schema is designed so partitioning can be introduced without changing application queries (every query is already `scanId`- or `agencyId`-scoped and time-bounded). Do not partition before it is needed.

## 5.4 Denormalized Counters

`Website.openIssueCount`, `criticalIssueCount`, and `trackerCount` are denormalized because the dashboard and website list would otherwise run correlated aggregates over `issues` for every row.

**Maintenance contract:** they are updated **inside the same transaction** as the issue state change, in one place (`packages/database/src/repositories/issue.repository.ts`). A nightly reconciliation job recomputes them and logs any drift as a system error — if reconciliation ever finds a discrepancy, that is a bug in a transaction boundary and must be fixed, not papered over.

## 5.5 Multi-Tenancy Enforcement

Three layers, because one is not enough.

**Layer 1 — Schema.** Every tenant table has `agencyId`. Non-nullable everywhere except `AuditLog` (which records platform-level admin actions) and `SystemLog`.

**Layer 2 — A Prisma client extension.** `packages/database/src/tenant.ts` exports `forAgency(agencyId)`, returning an extended Prisma client that:
- injects `where: { agencyId }` into every `findMany`/`findFirst`/`count`/`aggregate`/`groupBy` on tenant models;
- injects `data: { agencyId }` on every `create`/`createMany`;
- **throws** on `updateMany`/`deleteMany` against a tenant model without an `agencyId` predicate;
- leaves non-tenant models (`Plan`, `TrackerVendor`, `FeatureFlag`, `StripeWebhookEvent`) untouched.

```ts
// usage — the only sanctioned way to read tenant data
const db = forAgency(ctx.agencyId);
const sites = await db.website.findMany({ where: { monitoringStatus: 'ACTIVE' } });
// → SELECT ... WHERE agency_id = $1 AND monitoring_status = 'ACTIVE'
```

**Layer 3 — Lint + review.** An ESLint rule (`no-raw-prisma-in-routes`) forbids importing the raw `prisma` client anywhere under `apps/web/src/app/api/**` or `apps/web/src/server/actions/**`. Raw access is permitted only in `packages/database/src/repositories/**` and in worker jobs, which construct their own tenant scope from the job payload.

**Why not Postgres RLS?** RLS is a strong option and is the natural v2 hardening step. It is deferred because (a) Prisma's connection pooling makes reliably setting a per-request `SET LOCAL` session variable fragile across pooled connections and PgBouncer in transaction mode, and (b) the worker legitimately needs cross-tenant reads for scheduling. The extension gives us equivalent coverage with a testable, framework-native mechanism. **This decision is revisited before the platform holds regulated client data.** If adopted, the migration path is: add `app.current_agency_id` session var, enable RLS per table, keep the extension as defense-in-depth.

**Cross-tenant test suite.** `packages/database/src/__tests__/tenancy.test.ts` asserts, for every tenant model, that a query built via `forAgency(A)` cannot return a row belonging to agency B — including through nested relation reads (`website.include: { scans: true }`). New tenant models are added to a registry that this test iterates, so a forgotten model fails CI.

**S3 isolation:** keys are prefixed `agencies/{agencyId}/…`; the signed-URL issuer asserts the requesting context's `agencyId` matches the key prefix before signing (Part X §10.7).

**Background job isolation:** every job payload carries `agencyId`; the job handler's first action is to construct `forAgency(payload.agencyId)` and use only that client.

## 5.6 Transaction Boundaries

| Operation | Transaction contents |
|---|---|
| Scan completion | Update `Scan` status/metrics/score · insert `Issue` rows (upsert on `(websiteId, fingerprint)`) · insert `IssueEvidence` · insert `PrivacyDriftEvent` · update `Website` counters/score/lastScan · increment `UsageRecord` |
| Issue status change | Update `Issue` · insert `IssueActivity` · update `Website` counters · insert `AuditLog` |
| Website creation | Insert `Website` · insert `AuditLog` · increment `UsageRecord(WEBSITES)` — then enqueue the scan **outside** the transaction |
| Member invitation acceptance | Insert `AgencyMember` · update `Invitation` · insert `AuditLog` · increment `UsageRecord(SEATS)` |
| Subscription change | Update `Subscription` · update `StripeWebhookEvent` · insert `AuditLog` |

**Rule: never enqueue a BullMQ job inside a database transaction.** If the transaction rolls back, the job still exists and will operate on data that was never committed. Enqueue after commit, and make every job idempotent so a post-commit crash before enqueue is recoverable by the reconciliation sweep (Part VII §7.8).

## 5.7 Migrations

- `prisma migrate dev` locally, `prisma migrate deploy` in CI/CD.
- Every migration reviewed in the PR. Migration files are never edited after merge.
- **Destructive changes use expand/contract across three deploys:** (1) add the new column/table, dual-write; (2) backfill and switch reads; (3) drop the old column in a separate, explicitly-approved migration. A migration containing `DROP COLUMN` or `DROP TABLE` requires the `migration:destructive` PR label and a second approver — enforced by a CI check.
- Long-lived index creation uses `CREATE INDEX CONCURRENTLY` in a raw-SQL migration marked as non-transactional.
- Migrations run as a separate deploy step **before** the new application version starts, so the new code never meets an old schema.

## 5.8 Data Retention and Minimization

Implemented by the `cleanup` queue (Part VII §7.2), running nightly, per agency, honoring plan retention (§4.13) and always exempting evidence attached to open issues. Deletion is batched (10k rows per statement, paced) so it never blocks the write path. Every retention run writes a `SystemLog` summary of what it removed.

## 5.9 Database Inventory

| Model | Purpose | Tenant-scoped? | PK | Important relations | Important indexes |
|---|---|---|---|---|---|
| `User` | Platform identity, mirrors Clerk | No (global) | `id` | → `AgencyMember` | `clerkUserId`, `email` |
| `Agency` | The tenant | Is the tenant | `id` | → everything | `clerkOrgId`, `slug`, `status` |
| `AgencyMember` | User ↔ agency with role | Yes | `id` | `User`, `Agency` | `(agencyId, userId)` U, `(agencyId, role)` |
| `Invitation` | Pending team invites | Yes | `id` | `Agency`, `User` | `(agencyId,email)` U, `token` |
| `AgencyBranding` | White-label assets | Yes (1:1) | `id` | `Agency` | `agencyId` U |
| `AgencyScanSettings` | Scan defaults | Yes (1:1) | `id` | `Agency` | `agencyId` U |
| `AgencyAiSettings` | AI config + caps | Yes (1:1) | `id` | `Agency` | `agencyId` U |
| `UserPreference` | Per-user UI state, saved views | Yes | `id` | `User` | `(userId,agencyId,key)` U |
| `Client` | The agency's customer | Yes | `id` | `Website`, `Report`, `PortalUser` | `(agencyId,slug)` U |
| `WebsiteGroup` | Portfolio organization | Yes | `id` | `Website` | `(agencyId,name)` U |
| `Website` | The monitored target | Yes | `id` | `Scan`, `Issue`, `PrivacyDriftEvent` | `(nextScanAt,monitoringStatus)`, `(agencyId,healthScore)` |
| `Scan` | One monitoring run | Yes | `id` | All evidence tables | `(websiteId,createdAt DESC)`, `(websiteId,status,finishedAt DESC)` |
| `ScanPhase` | Per-consent-phase result | Yes | `id` | `Scan` | `(scanId,phase)` U |
| `ScanPage` | Per-page result | Yes | `id` | `Scan` | `scanId` |
| `NetworkRequest` | Recorded request | Yes | `id` | `Scan` | `(scanId,consentPhase)`, `(scanId,isThirdParty)` |
| `CookieRecord` | Recorded cookie | Yes | `id` | `Scan` | `(scanId,consentPhase)`, `(scanId,category)` |
| `StorageEntry` | Recorded storage key | Yes | `id` | `Scan` | `(scanId,consentPhase)` |
| `ConsoleLog` | Console/page errors | Yes | `id` | `Scan` | `scanId` |
| `Screenshot` | Visual evidence in S3 | Yes | `id` | `Scan` | `(scanId,consentPhase)` |
| `TrackerVendor` | Vendor knowledge base | **No — global** | `id` | `TrackerDetection` | `slug` U, `category` |
| `TrackerDetection` | Vendor seen in a scan | Yes | `id` | `Scan`, `TrackerVendor` | `(websiteId,vendorId)`, `(agencyId,vendorId)` |
| `Issue` | A finding to act on | Yes | `id` | `Website`, `Scan`, evidence | `(websiteId,fingerprint)` U, `(agencyId,status,severity)` |
| `IssueEvidence` | Immutable proof | Yes | `id` | `Issue`, `Scan` | `issueId`, `scanId` |
| `IssueActivity` | Issue audit trail | Yes | `id` | `Issue` | `(issueId,createdAt)` |
| `IssueFeedback` | FP signal for rule tuning | Yes | `id` | `Issue` | `(ruleId,verdict)` |
| `IgnoreRule` | Suppression config | Yes | `id` | `Agency`, `Website` | `(agencyId,websiteId)` |
| `PrivacyDriftEvent` | A detected change | Yes | `id` | 2× `Scan`, `Website` | `(agencyId,detectedAt DESC)` |
| `DriftSuppression` | Accepted changes | Yes | `id` | `Website` | `(websiteId,changeType,fingerprint)` U |
| `Report` | Generated artifact | Yes | `id` | `Client`, `Website` | `(agencyId,createdAt DESC)` |
| `ReportShare` | Time-limited share link | Yes | `id` | `Report` | `token` U |
| `Notification` | In-app message | Yes | `id` | `User` | `(userId,readAt,createdAt DESC)` |
| `NotificationPreference` | Per-user channel matrix | Yes | `id` | `Agency` | `(userId,agencyId,type)` U |
| `AlertRule` | Alerting configuration | Yes | `id` | `Agency` | `(agencyId,enabled)` |
| `AlertHistory` | Delivery record | Yes | `id` | `AlertRule` | `(agencyId,createdAt DESC)` |
| `PortalUser` | Client-side portal identity | Yes | `id` | `Client` | `(clientId,email)` U |
| `PortalSession` | Portal session token | Yes | `id` | `PortalUser` | `tokenHash` U, `expiresAt` |
| `Plan` | Product catalog | **No — global** | `id` | `Subscription` | `key` U |
| `Subscription` | Billing state | Yes (1:1) | `id` | `Agency`, `Plan` | `agencyId` U, `stripeCustomerId` U |
| `UsageRecord` | Metered consumption | Yes | `id` | `Agency` | `(agencyId,periodStart,metric)` U |
| `StripeWebhookEvent` | Webhook idempotency + replay | **No — global** | `id` | — | `stripeEventId` U |
| `AIRequest` | AI call log, cache, metering | Yes | `id` | `Agency`, `Issue` | `inputHash`, `(agencyId,createdAt DESC)` |
| `AuditLog` | Sensitive-action trail | Yes (nullable) | `id` | `Agency`, `User` | `(agencyId,createdAt DESC)` |
| `FeatureFlag` | Rollout control | **No — global** | `id` | `FeatureFlagOverride` | `key` U |
| `FeatureFlagOverride` | Per-tenant flag state | Yes | `id` | `FeatureFlag`, `Agency` | `(flagId,agencyId)` U |
| `SystemLog` | Platform diagnostics | Optional | `id` | — | `(level,createdAt DESC)` |
| `FreeScan` | Anonymous lead-gen scan | **No — pre-tenant** | `id` | — | `token` U, `(ipHash,createdAt)` |

---

# Part VI — Application Architecture

## 6.1 Authentication (Clerk)

**Concretely, not generically:**

1. **Signup.** The user creates a Clerk account at `/signup` (email+password, Google, or magic link). Clerk sends the verification email; we do not implement email verification ourselves.
2. **Webhook sync.** Clerk webhooks (`user.created`, `user.updated`, `user.deleted`, `organization.created`, `organizationMembership.created/updated/deleted`) hit `POST /api/webhooks/clerk`. The handler verifies the Svix signature, then upserts our local `User` / `Agency` / `AgencyMember` mirror. **Clerk is the identity source of truth; our tables are a queryable mirror** — we never store passwords or session secrets.
3. **Agency mapping.** One Clerk **Organization** ↔ one `Agency`, joined on `Agency.clerkOrgId`. A user with no organization is routed to `/app/onboarding`, which creates the Clerk org and the `Agency` row together in one Server Action. A user in multiple orgs gets an agency switcher; the active org comes from Clerk's session claim `org_id`.
4. **Role mapping.** Clerk organization roles map to `AgencyRole`. Clerk's `org:admin`/`org:member` is too coarse, so **`AgencyRole` in our database is authoritative** for permissions; Clerk roles are used only for org-management operations inside Clerk's own UI. Role changes go through `PATCH /api/team/members/:id`, which updates both.
5. **Route protection.** `apps/web/src/proxy.ts` (Next 16's replacement for middleware) uses `clerkMiddleware` to protect route groups:

```ts
// apps/web/src/proxy.ts  — NOT middleware.ts (deprecated in Next 16)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublic = createRouteMatcher([
  '/', '/features(.*)', '/how-it-works', '/pricing', '/free-scanner(.*)',
  '/blog(.*)', '/guides(.*)', '/resources', '/about', '/contact', '/legal(.*)',
  '/login(.*)', '/signup(.*)', '/api/webhooks(.*)', '/api/public(.*)', '/bot',
]);
const isPortal = createRouteMatcher(['/portal(.*)', '/api/portal(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isPortal(req)) return;          // portal has its own session scheme (§6.10)
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?)).*)', '/(api|trpc)(.*)'],
};
// NOTE: no `runtime` export — setting it in a proxy file throws in Next 16.
```

6. **Server-side context resolution.** Every authenticated route handler and Server Action begins with:

```ts
// apps/web/src/server/auth/context.ts
export async function requireAgencyContext(): Promise<AgencyContext> {
  const { userId, orgId } = await auth();                 // async in Next 16
  if (!userId) throw new AuthenticationError('NOT_AUTHENTICATED');
  if (!orgId)  throw new AuthorizationError('NO_AGENCY');

  const member = await prisma.agencyMember.findFirst({
    where: { user: { clerkUserId: userId }, agency: { clerkOrgId: orgId }, status: 'ACTIVE' },
    include: { agency: { include: { subscription: { include: { plan: true } } } }, user: true },
  });
  if (!member) throw new AuthorizationError('NOT_A_MEMBER');
  if (member.agency.status === 'SUSPENDED') throw new AuthorizationError('AGENCY_SUSPENDED');

  return {
    userId: member.userId,
    agencyId: member.agencyId,
    role: member.role,
    websiteScope: member.websiteScope,
    entitlements: resolveEntitlements(member.agency),
    timezone: member.user.timezone ?? member.agency.timezone,
  };
}
```

This is the **only** sanctioned way to establish identity server-side. It is cached per request with React `cache()` so repeated calls in one render cost one query.

7. **Server Action authorization.** Because Next 16 proxy does not reliably cover Server Actions, **every Server Action calls `requireAgencyContext()` and an explicit permission check as its first statements.** This is enforced by an ESLint rule requiring that any exported async function in a `'use server'` file begins with a call to a function from the `@/server/auth` module.
8. **API authentication.** Route handlers use the same `requireAgencyContext()`. Webhooks authenticate by signature only (Svix for Clerk, Stripe signature for Stripe) and are excluded from the auth matcher.
9. **Admin authentication.** `/admin` requires `User.isSuperAdmin`, checked in `(admin)/layout.tsx` **and** independently re-checked in every `/api/admin/*` handler via `requireSuperAdmin()`. Layout checks are UX; handler checks are security.
10. **Session handling.** Clerk manages sessions and refresh. We set no session cookies of our own except the portal's (§6.12) and a `free_scan_token` attribution cookie.
11. **Testing.** Auth is covered by: unit tests on `requireAgencyContext` for each failure mode; an integration test that every route under `/api/**` (enumerated by filesystem walk) either appears in a documented public allowlist or returns 401 without a session; and E2E tests for signup, invitation acceptance, agency switching, and suspended-agency redirect.

## 6.2 Authorization — RBAC

Six agency roles plus a platform role.

### Permission matrix

| Action | Owner | Admin | Manager | Developer | Viewer | Client (portal) |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| View dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| View websites | ✓ | ✓ | ✓ | ✓ | ✓ | own only |
| Add website | ✓ | ✓ | ✓ | — | — | — |
| Edit website settings | ✓ | ✓ | ✓ | — | — | — |
| Pause / resume monitoring | ✓ | ✓ | ✓ | — | — | — |
| Archive / delete website | ✓ | ✓ | — | — | — | — |
| Start manual scan | ✓ | ✓ | ✓ | ✓ | — | — |
| View scan results | ✓ | ✓ | ✓ | ✓ | ✓ | simplified |
| View technical evidence | ✓ | ✓ | ✓ | ✓ | — | — |
| Export evidence | ✓ | ✓ | ✓ | ✓ | — | — |
| View issues | ✓ | ✓ | ✓ | ✓ | ✓ | client-safe |
| Change issue status | ✓ | ✓ | ✓ | ✓ | — | — |
| Assign issue | ✓ | ✓ | ✓ | — | — | — |
| Ignore issue / create ignore rule | ✓ | ✓ | ✓ | — | — | — |
| Accept a drift change | ✓ | ✓ | ✓ | — | — | — |
| Manage clients | ✓ | ✓ | ✓ | — | — | — |
| Enable / disable client portal | ✓ | ✓ | — | — | — | — |
| Generate report | ✓ | ✓ | ✓ | — | — | — |
| Download report | ✓ | ✓ | ✓ | ✓ | ✓ | own only |
| Delete report | ✓ | ✓ | — | — | — | — |
| Use AI features | ✓ | ✓ | ✓ | ✓ | — | — |
| Configure AI settings | ✓ | ✓ | — | — | — | — |
| Manage alert rules | ✓ | ✓ | ✓ | — | — | — |
| Manage own notification prefs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invite team member | ✓ | ✓ | — | — | — | — |
| Change member role | ✓ | ✓ | — | — | — | — |
| Remove member | ✓ | ✓ | — | — | — | — |
| Edit agency branding | ✓ | ✓ | — | — | — | — |
| Edit agency scan settings | ✓ | ✓ | — | — | — | — |
| View audit log | ✓ | ✓ | — | — | — | — |
| Manage billing | ✓ | — | — | — | — | — |
| Change plan / cancel | ✓ | — | — | — | — | — |
| Delete agency | ✓ | — | — | — | — | — |
| All admin functions | — | — | — | — | — | — |

**Deviations from the prompt's starting matrix, with rationale:**
- **Developer can change issue status** — they are the ones who fix issues; requiring a Manager to close them creates a bottleneck that would push the team back to Slack.
- **Viewer can download reports** — a Viewer is typically a junior AM or a stakeholder; reports are the client-safe artifact and blocking them makes the role useless.
- **Only Owner manages billing** — Admin gets everything else, but payment method and cancellation stay with one person. Owner is transferable.
- **Manager cannot delete websites** — deletion destroys monitoring history, which is the product's core asset. Archive (reversible) is available to Manager; delete is not.
- **`websiteScope`** — an optional per-member restriction. When non-empty, that member sees only those websites. Useful for agencies with contractors or client-dedicated pods. Enforced in `forAgency()` by adding `id IN (scope)` for `Website` and `websiteId IN (scope)` for its children.

### Implementation

```ts
// packages/shared/src/auth/permissions.ts
export const PERMISSIONS = {
  'website:create': ['OWNER','ADMIN','MANAGER'],
  'website:delete': ['OWNER','ADMIN'],
  'scan:start':     ['OWNER','ADMIN','MANAGER','DEVELOPER'],
  'evidence:view':  ['OWNER','ADMIN','MANAGER','DEVELOPER'],
  'issue:status':   ['OWNER','ADMIN','MANAGER','DEVELOPER'],
  'billing:manage': ['OWNER'],
  // ...one entry per row above
} as const satisfies Record<string, readonly AgencyRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AgencyRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
```

```ts
// apps/web/src/server/auth/require.ts
export async function requirePermission(p: Permission): Promise<AgencyContext> {
  const ctx = await requireAgencyContext();
  if (!can(ctx.role, p)) throw new AuthorizationError('INSUFFICIENT_ROLE', { permission: p });
  return ctx;
}
```

The same `can()` powers UI gating (`<Can permission="website:create">`), so the sidebar, buttons, and API agree by construction. **UI gating is never the security boundary** — every mutation re-checks server-side.

**Resource-level authorization.** Role permission alone is insufficient; the resource must belong to the tenant. Repositories take the context and scope every query, so `getWebsite(ctx, id)` returns `null` (→ 404, never 403) for another tenant's website. Returning 404 rather than 403 avoids confirming that an ID exists in another tenant.

## 6.3 API Architecture

Next.js Route Handlers under `apps/web/src/app/api/`. No separate backend service — the Next.js server is the API, and workers are separate processes that talk to the same database and queue directly.

**Why no NestJS/Express service:** the API surface is CRUD plus job enqueueing; it shares types, validation schemas, and the Prisma client with the frontend; and a second HTTP service would add a network hop, a second deployment, and a duplicated auth layer for zero benefit. Heavy work already lives in workers, which is where a separate service would have been justified.

### Standard handler shape

```ts
// apps/web/src/app/api/websites/[websiteId]/route.ts
import type { NextRequest } from 'next/server';

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/websites/[websiteId]'>) {
  return handle(req, async () => {
    const { websiteId } = await ctx.params;                  // Promise in Next 16
    const auth = await requirePermission('website:update');
    const body = await parseJson(req, updateWebsiteSchema);  // Zod; throws ValidationError
    const website = await websiteService.update(auth, websiteId, body);
    return json(websiteResponseSchema.parse(website));
  });
}
```

`handle()` is the single error boundary (§6.7). `parseJson()` enforces a body-size cap and validates. `json()` sets `Content-Type` and no-store caching. Nothing else may catch errors.

### Conventions

- **Responses:** `{ data: T }` on success; `{ error: { code, message, details? , requestId } }` on failure. Never a bare array (blocks future pagination metadata).
- **Pagination:** cursor-based (`?cursor=&limit=`) for scans, requests, drift events, notifications, audit logs, and activity — anything unbounded and time-ordered. Offset (`?page=&perPage=`) for websites, clients, issues, trackers, and reports, where users expect page numbers and totals and result sets are bounded by plan limits. Documented per endpoint in the inventory.
- **Filtering/sorting:** whitelisted fields only, parsed by Zod enums. No arbitrary field names reach Prisma.
- **Idempotency:** `Idempotency-Key` header on `POST /api/websites/:id/scan` and `POST /api/reports`; stored on the record with a unique constraint; a duplicate key returns the original resource with `200` instead of creating a second one.
- **Rate limits:** per-agency and per-user sliding windows in Redis (`packages/shared/src/rate-limit.ts`), returning `429` with `Retry-After` and `X-RateLimit-*` headers.
- **Caching:** authenticated API responses are `Cache-Control: private, no-store`. Public endpoints (`/api/public/plans`) use `s-maxage`. Route Handler `GET` is not cached by default in Next 16, so no explicit opt-out is needed.

### Server Actions vs. Route Handlers

| Use a **Server Action** for | Use a **Route Handler** for |
|---|---|
| Form submissions from our own UI (settings, website create, issue status) | Anything a non-browser client calls |
| Mutations where a progressive-enhancement form is natural | Webhooks |
| Operations that immediately `revalidatePath` and re-render | Data fetched by client components (SWR/React Query) |
| | File downloads and signed-URL redirects |
| | Anything needing custom status codes or headers |

Every Server Action lives in `apps/web/src/server/actions/*.ts`, starts with `requirePermission()`, validates with the same Zod schema the equivalent route handler uses, and returns a discriminated `{ ok: true, data }` | `{ ok: false, error }` result rather than throwing across the boundary.

### API Inventory

| Method | Endpoint | Purpose | Auth | Role | Input | Output | Rate limit | Queue |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/dashboard/summary` | Stat tiles | Session | Any | — | `DashboardSummary` | 60/min | — |
| GET | `/api/dashboard/attention` | Attention Center | Session | Any | `?limit` | `AttentionItem[]` | 60/min | — |
| GET | `/api/dashboard/health-trend` | Score trend | Session | Any | `?days` | `TrendPoint[]` | 60/min | — |
| GET | `/api/dashboard/drift-summary` | Drift rollup | Session | Any | `?days` | `DriftSummary` | 60/min | — |
| GET | `/api/dashboard/activity` | Activity feed | Session | Any | `?cursor&limit` | `Paged<Activity>` | 60/min | — |
| GET | `/api/websites` | List websites | Session | Any | filters, `?page&perPage&sort` | `Paged<Website>` | 120/min | — |
| POST | `/api/websites` | Create website | Session | Manager+ | `CreateWebsiteInput` | `Website` | 30/min | `scan` (baseline) |
| POST | `/api/websites/validate` | Pre-flight URL check | Session | Manager+ | `{ url }` | `UrlValidationResult` | 20/min | — |
| GET | `/api/websites/:id` | Website detail | Session | Any | — | `WebsiteDetail` | 120/min | — |
| PATCH | `/api/websites/:id` | Update website | Session | Manager+ | `UpdateWebsiteInput` | `Website` | 60/min | reschedules |
| DELETE | `/api/websites/:id` | Archive/delete | Session | Admin+ | `?hard=true` | `204` | 10/min | removes repeatable job |
| POST | `/api/websites/:id/scan` | Manual scan | Session | Developer+ | `{ priority? }`, `Idempotency-Key` | `Scan` | 20/min | `scan` |
| GET | `/api/websites/:id/scans` | Scan history | Session | Any | `?cursor&limit&status` | `Paged<Scan>` | 120/min | — |
| GET | `/api/websites/:id/trackers` | Detected vendors | Session | Any | `?phase&category` | `TrackerDetection[]` | 120/min | — |
| GET | `/api/websites/:id/cookies` | Cookie matrix | Session | Any | `?scanId` | `CookieMatrix` | 120/min | — |
| GET | `/api/websites/:id/consent` | Consent report card | Session | Any | `?scanId` | `ConsentReport` | 120/min | — |
| GET | `/api/websites/:id/drift` | Site drift feed | Session | Any | `?cursor&type` | `Paged<DriftEvent>` | 120/min | — |
| POST | `/api/websites/bulk` | Bulk operations | Session | Manager+ | `{ ids[], action, payload }` | `BulkResult` | 10/min | `scan` ×N |
| POST | `/api/websites/import` | CSV import | Session | Manager+ | multipart CSV | `ImportResult` | 5/hour | `scan` ×N |
| GET | `/api/websites/export` | CSV export | Session | Any | filters | `text/csv` | 10/hour | — |
| GET | `/api/clients` | List clients | Session | Any | `?page&search` | `Paged<Client>` | 120/min | — |
| POST | `/api/clients` | Create client | Session | Manager+ | `CreateClientInput` | `Client` | 30/min | — |
| GET | `/api/clients/:id` | Client detail | Session | Any | — | `ClientDetail` | 120/min | — |
| PATCH | `/api/clients/:id` | Update client | Session | Manager+ | `UpdateClientInput` | `Client` | 60/min | — |
| DELETE | `/api/clients/:id` | Archive client | Session | Admin+ | — | `204` | 10/min | — |
| POST | `/api/clients/:id/portal-users` | Invite portal user | Session | Admin+ | `{ email, name? }` | `PortalUser` | 10/min | `email` |
| DELETE | `/api/clients/:id/portal-users/:puId` | Revoke portal access | Session | Admin+ | — | `204` | 10/min | — |
| GET | `/api/scans/:id` | Scan detail | Session | Any | — | `ScanDetail` | 120/min | — |
| GET | `/api/scans/:id/requests` | Network evidence | Session | Developer+ | `?cursor&phase&thirdParty&type` | `Paged<NetworkRequest>` | 120/min | — |
| GET | `/api/scans/:id/cookies` | Cookie evidence | Session | Developer+ | `?phase` | `CookieRecord[]` | 120/min | — |
| GET | `/api/scans/:id/storage` | Storage evidence | Session | Developer+ | `?phase` | `StorageEntry[]` | 120/min | — |
| GET | `/api/scans/:id/screenshots` | Screenshot URLs | Session | Any | — | `{ url, phase, kind }[]` (signed) | 60/min | — |
| GET | `/api/scans/:id/issues` | Issues from a scan | Session | Any | — | `Issue[]` | 120/min | — |
| GET | `/api/scans/:id/export` | Evidence export | Session | Developer+ | `?format=json\|csv` | file | 5/hour | — |
| POST | `/api/scans/:id/cancel` | Cancel a running scan | Session | Manager+ | — | `Scan` | 10/min | removes job |
| GET | `/api/issues` | Issue queue | Session | Any | filters, `?page&perPage` | `Paged<Issue>` | 120/min | — |
| GET | `/api/issues/:id` | Issue detail | Session | Any | — | `IssueDetail` | 120/min | — |
| PATCH | `/api/issues/:id` | Status/assign/resolve | Session | Developer+ | `UpdateIssueInput` | `Issue` | 60/min | `scan` if verify |
| POST | `/api/issues/:id/ignore` | Create ignore rule | Session | Manager+ | `{ scope, reason, expiresAt? }` | `IgnoreRule` | 30/min | — |
| POST | `/api/issues/:id/feedback` | FP feedback | Session | Developer+ | `{ verdict, note? }` | `204` | 30/min | — |
| POST | `/api/issues/bulk` | Bulk status change | Session | Manager+ | `{ ids[], action }` | `BulkResult` | 10/min | — |
| GET | `/api/trackers` | Portfolio vendors | Session | Any | `?category&risk&page` | `Paged<TrackerSummary>` | 120/min | — |
| GET | `/api/trackers/:id` | Vendor detail | Session | Any | — | `TrackerDetail` | 120/min | — |
| GET | `/api/drift` | Drift feed | Session | Any | `?cursor&type&severity&websiteId` | `Paged<DriftEvent>` | 120/min | — |
| POST | `/api/drift/:id/accept` | Suppress this change | Session | Manager+ | `{ reason? }` | `DriftSuppression` | 30/min | — |
| GET | `/api/reports` | Report library | Session | Any | `?page&type&clientId` | `Paged<Report>` | 120/min | — |
| POST | `/api/reports` | Generate report | Session | Manager+ | `CreateReportInput`, `Idempotency-Key` | `Report` | 20/hour | `report-generation` |
| GET | `/api/reports/:id` | Report metadata | Session | Any | — | `Report` | 120/min | — |
| GET | `/api/reports/:id/download` | Signed PDF URL | Session | Any | — | `302` → signed URL | 60/min | — |
| POST | `/api/reports/:id/share` | Create share link | Session | Manager+ | `{ expiresInDays }` | `ReportShare` | 20/hour | — |
| DELETE | `/api/reports/:id` | Delete report | Session | Admin+ | — | `204` | 20/min | `cleanup` |
| GET | `/api/alerts` | Alert rules | Session | Manager+ | — | `AlertRule[]` | 60/min | — |
| POST | `/api/alerts` | Create rule | Session | Manager+ | `CreateAlertRuleInput` | `AlertRule` | 30/min | — |
| PATCH | `/api/alerts/:id` | Update rule | Session | Manager+ | `UpdateAlertRuleInput` | `AlertRule` | 60/min | — |
| DELETE | `/api/alerts/:id` | Delete rule | Session | Manager+ | — | `204` | 30/min | — |
| GET | `/api/alerts/history` | Delivery history | Session | Manager+ | `?cursor` | `Paged<AlertHistory>` | 60/min | — |
| GET | `/api/notifications` | Notification list | Session | Any | `?cursor&unreadOnly` | `Paged<Notification>` | 120/min | — |
| POST | `/api/notifications/read` | Mark read | Session | Any | `{ ids[] } \| { all: true }` | `204` | 60/min | — |
| POST | `/api/ai/explain` | Explain an issue | Session | Developer+ | `{ issueId }` | `IssueExplanation` | 20/min, credit-metered | `ai` |
| POST | `/api/ai/recommend-fix` | Fix guidance | Session | Developer+ | `{ issueId }` | `FixRecommendation` | 20/min, metered | `ai` |
| POST | `/api/ai/summarize-drift` | Drift narrative | Session | Manager+ | `{ websiteId, days }` | `DriftSummary` | 10/min, metered | `ai` |
| POST | `/api/ai/client-message` | Client email draft | Session | Manager+ | `{ issueIds[] \| websiteId, tone }` | `ClientMessage` | 10/min, metered | `ai` |
| GET | `/api/ai/usage` | Credit usage | Session | Any | `?period` | `AiUsage` | 60/min | — |
| GET | `/api/team` | Members + invites | Session | Any | — | `TeamState` | 60/min | — |
| POST | `/api/team/invitations` | Invite member | Session | Admin+ | `{ email, role, websiteScope? }` | `Invitation` | 20/hour | `email` |
| DELETE | `/api/team/invitations/:id` | Revoke invite | Session | Admin+ | — | `204` | 20/min | — |
| PATCH | `/api/team/members/:id` | Change role/scope | Session | Admin+ | `{ role?, websiteScope? }` | `AgencyMember` | 30/min | — |
| DELETE | `/api/team/members/:id` | Remove member | Session | Admin+ | — | `204` | 20/min | — |
| GET | `/api/agency` | Agency settings | Session | Any | — | `Agency` | 60/min | — |
| PATCH | `/api/agency` | Update general | Session | Admin+ | `UpdateAgencyInput` | `Agency` | 30/min | — |
| PATCH | `/api/agency/branding` | Update branding | Session | Admin+ | `BrandingInput` | `AgencyBranding` | 30/min | — |
| POST | `/api/agency/branding/logo` | Upload logo | Session | Admin+ | multipart | `{ url }` | 10/hour | — |
| PATCH | `/api/agency/scan-settings` | Scan defaults | Session | Admin+ | `ScanSettingsInput` | `AgencyScanSettings` | 30/min | reschedules |
| PATCH | `/api/agency/ai-settings` | AI config | Session | Admin+ | `AiSettingsInput` | `AgencyAiSettings` | 30/min | — |
| GET | `/api/audit-logs` | Audit trail | Session | Admin+ | `?cursor&action&entityType` | `Paged<AuditLog>` | 60/min | — |
| GET | `/api/billing/subscription` | Current plan + usage | Session | Owner | — | `BillingState` | 60/min | — |
| POST | `/api/billing/checkout` | Stripe Checkout | Session | Owner | `{ planKey, interval }` | `{ url }` | 10/min | — |
| POST | `/api/billing/portal` | Stripe Portal | Session | Owner | — | `{ url }` | 10/min | — |
| GET | `/api/billing/invoices` | Invoice list | Session | Owner | — | `Invoice[]` | 30/min | — |
| POST | `/api/support/ticket` | Support request | Session | Any | `{ subject, body, category }` | `204` | 5/hour | `email` |
| GET | `/api/public/plans` | Public pricing | None | — | — | `PublicPlan[]` | 300/min | — |
| POST | `/api/public/free-scan` | Anonymous scan | None | — | `{ url, turnstileToken }` | `{ token }` | 3/hour/IP | `scan:free` |
| GET | `/api/public/free-scan/:token` | Free scan result | None | — | — | `FreeScanResult` | 60/min | — |
| POST | `/api/public/free-scan/:token/email` | Capture email | None | — | `{ email }` | `204` | 5/hour/IP | `email` |
| POST | `/api/public/contact` | Contact form | None | — | `ContactInput + turnstileToken` | `204` | 5/hour/IP | `email` |
| POST | `/api/webhooks/clerk` | Clerk sync | Svix sig | — | Clerk event | `200` | — | — |
| POST | `/api/webhooks/stripe` | Billing events | Stripe sig | — | Stripe event | `200` | — | `email` |
| POST | `/api/webhooks/resend` | Delivery events | Svix sig | — | Resend event | `200` | — | — |
| GET | `/api/portal/overview` | Portal home | Portal session | Client | — | `PortalOverview` | 60/min | — |
| GET | `/api/portal/issues` | Client-safe issues | Portal session | Client | `?page` | `Paged<PortalIssue>` | 60/min | — |
| GET | `/api/portal/reports` | Client reports | Portal session | Client | — | `PortalReport[]` | 60/min | — |
| GET | `/api/portal/reports/:id/download` | Download | Portal session | Client | — | `302` signed | 30/min | — |
| GET | `/api/portal/scans` | Simplified history | Portal session | Client | `?page` | `Paged<PortalScan>` | 60/min | — |
| PATCH | `/api/portal/settings` | Portal prefs | Portal session | Client | `PortalSettingsInput` | `204` | 30/min | — |
| POST | `/api/portal/auth/request` | Request magic link | None | — | `{ email }` | `204` (always) | 5/hour/IP | `email` |
| POST | `/api/portal/auth/verify` | Exchange token | None | — | `{ token }` | sets cookie | 10/hour/IP | — |
| GET | `/api/admin/*` | Admin surfaces | Session | Super Admin | varies | varies | 120/min | varies |
| GET | `/api/health` | Liveness | None | — | — | `{ status }` | — | — |
| GET | `/api/health/ready` | Readiness (db, redis, s3) | None | — | — | `HealthReport` | — | — |

## 6.4 Input Validation

**Zod**, with schemas living in `packages/schemas` so the web app, the workers, and the tests share one definition.

```ts
// packages/schemas/src/website.ts
export const createWebsiteSchema = z.object({
  url: z.string().trim().min(1).max(2048)
    .refine(isHttpUrl, 'Must be an http or https address')
    .transform(normalizeUrl),
  clientId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  label: z.string().trim().max(120).optional(),
  scanFrequency: z.nativeEnum(ScanFrequency).default('WEEKLY'),
  scanPriority: z.nativeEnum(ScanPriority).default('NORMAL'),
  monitoredPaths: z.array(z.string().startsWith('/')).max(20).default(['/']),
  alertProfile: z.nativeEnum(AlertProfile).default('DEFAULT'),
  runInitialScan: z.boolean().default(true),
});
export type CreateWebsiteInput = z.infer<typeof createWebsiteSchema>;
```

Rules:
- **Validation happens before any business logic and before any database call.** `parseJson()` is the only place a request body is read.
- **Body size cap** of 1 MB on JSON routes (matching the Server Action default), 10 MB on the CSV import route, enforced by reading `Content-Length` and by a streaming byte counter.
- **Every ID is `z.string().uuid()`** — this alone blocks a large class of injection and enumeration attempts.
- **Pagination:** `limit` clamped to `[1, 100]`, default 25. `cursor` validated as an opaque base64 payload we issued.
- **Filters:** every filterable field is a Zod enum or a validated UUID; no free-form field names reach the ORM.
- **URLs** additionally pass the SSRF guard (Part X §10.3) before any network use — Zod validates shape, the guard validates destination.
- **Output validation:** response schemas are parsed before sending on tenant-sensitive endpoints. This is deliberate belt-and-braces: it guarantees that an accidental `include` of a relation containing internal notes cannot leak, because the schema strips unknown keys.
- **Webhooks** are signature-verified *before* parsing, then parsed against a permissive schema (we must tolerate provider field additions).

## 6.5 Issue Lifecycle

```mermaid
stateDiagram-v2
  [*] --> UNVERIFIED: rule fired, confidence < 0.5
  [*] --> NEW: rule fired, confidence >= 0.5
  UNVERIFIED --> NEW: user promotes
  UNVERIFIED --> IGNORED: user dismisses
  NEW --> ACKNOWLEDGED: user acknowledges
  NEW --> IGNORED: ignore rule created
  ACKNOWLEDGED --> IN_PROGRESS: assigned + started
  IN_PROGRESS --> RESOLVED: marked fixed
  ACKNOWLEDGED --> RESOLVED: marked fixed
  NEW --> RESOLVED: marked fixed
  RESOLVED --> VERIFIED: verification scan confirms absence
  RESOLVED --> REOPENED: next scan still detects it
  VERIFIED --> REOPENED: later scan detects it again
  IGNORED --> NEW: ignore rule removed/expired
  REOPENED --> ACKNOWLEDGED
  VERIFIED --> [*]
```

**Deduplication.** An issue's identity is `Issue.fingerprint` = `sha256(ruleId + websiteId + normalizedSubject)` where `normalizedSubject` is the vendor slug, cookie fingerprint, or domain the rule fired on. On each scan, findings upsert on `(websiteId, fingerprint)`:
- Existing `NEW`/`ACKNOWLEDGED`/`IN_PROGRESS` → increment `occurrenceCount`, update `lastSeenAt` and `lastScanId`. **No new alert.**
- Existing `RESOLVED`/`VERIFIED` → transition to `REOPENED`, alert, log activity.
- Existing `IGNORED` → skip entirely.
- Not found → create as `NEW` (or `UNVERIFIED`), alert per rules.

**Auto-resolution.** A finding present in the previous scan and absent from the current **completed** scan transitions the issue `RESOLVED` with `resolution: FIXED` and `resolvedById: null` (system). It is **not** auto-verified — verification requires an explicit confirming scan. Auto-resolution never happens off a `PARTIAL` scan, since absence there may mean "untested," not "fixed."

**Verification workflow (fix verification).**

```mermaid
sequenceDiagram
  participant D as Developer
  participant A as App
  participant Q as scan queue
  participant W as Worker
  D->>A: Marks issue RESOLVED
  A->>A: Offer "Re-scan to verify"
  D->>A: Confirms
  A->>Q: Enqueue scan (trigger=VERIFICATION, priority=HIGH, issueId in payload)
  Q->>W: Job
  W->>W: Full scan + rule evaluation
  alt Issue fingerprint absent
    W->>A: Issue → VERIFIED, verificationScanId set
    A->>D: Notification "Fix verified"
  else Still present
    W->>A: Issue → REOPENED, occurrenceCount++
    A->>D: Notification "Issue still detected"
  end
```

The verification scan is a full scan (not a partial re-check) because a fix can move the problem rather than remove it, and only a full scan produces comparable evidence. Verification scans count against the scan quota but are prioritized.

## 6.6 Alert System

**Pipeline:** rule fires → `Issue` created/reopened → `notification` job enqueued → `AlertDispatcher` resolves matching `AlertRule`s → per recipient, resolve `NotificationPreference` → apply quiet hours and digest → deliver (in-app row, and/or `email` job) → record `AlertHistory`.

**Alert types:** `CRITICAL_ISSUE` · `NEW_TRACKER` · `CONSENT_REGRESSION` · `PRIVACY_DRIFT` · `SCAN_FAILED` · `SCAN_PARTIAL` · `WEBSITE_UNREACHABLE` · `REPORT_READY` · `REPORT_FAILED` · plus account/billing types.

**Digest logic.** `IMMEDIATE` sends now. `DAILY`/`WEEKLY` write a `Notification` row immediately (in-app is always immediate — it's free and non-intrusive) and mark the item for inclusion in the next digest run. Digest jobs are repeatable BullMQ jobs at 08:00 in **the agency's timezone**, computed by scheduling one repeatable job per distinct timezone in use rather than per agency.

**Quiet hours.** If `now` (agency timezone) falls inside the window, an `IMMEDIATE` alert is deferred to the window's end and recorded as `suppressed_quiet_hours`. **Critical alerts override quiet hours by default**, with an explicit per-rule opt-out — a consent regression at 2 a.m. is exactly what an agency wants to know about, but we let them decide.

**Deduplication and flood control.** Per `(agencyId, type, entityId)`, at most one alert per 4 hours. If a single scan produces more than 10 alertable issues, they collapse into one "N issues detected on example.com" alert linking to a filtered list. A website in a failing state alerts on the 3rd consecutive failure, then at most daily until it recovers.

**Channel roadmap:** MVP is email + in-app. V1.1 adds Slack (OAuth app, per-channel routing) and generic webhooks (HMAC-signed payloads, retry with backoff, delivery log). Teams follows. The `AlertRule.channels` array and the dispatcher's channel-adapter interface are built in the MVP so adding a channel is one adapter, not a refactor.

## 6.7 Error Handling

```ts
// packages/shared/src/errors.ts
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly isOperational = true;
  constructor(message: string, public readonly details?: Record<string, unknown>) { super(message); }
}

export class ValidationError      extends AppError { code='VALIDATION_ERROR';       httpStatus=400; }
export class AuthenticationError  extends AppError { code='AUTHENTICATION_ERROR';   httpStatus=401; }
export class AuthorizationError   extends AppError { code='AUTHORIZATION_ERROR';    httpStatus=403; }
export class NotFoundError        extends AppError { code='NOT_FOUND';              httpStatus=404; }
export class ConflictError        extends AppError { code='CONFLICT';               httpStatus=409; }
export class RateLimitError       extends AppError { code='RATE_LIMIT_EXCEEDED';    httpStatus=429; }
export class EntitlementError     extends AppError { code='ENTITLEMENT_EXCEEDED';   httpStatus=402; }
export class ScanError            extends AppError { code='SCAN_ERROR';             httpStatus=500; }
export class BrowserError         extends AppError { code='BROWSER_ERROR';          httpStatus=500; }
export class CMPDetectionError    extends AppError { code='CMP_DETECTION_ERROR';    httpStatus=500; }
export class StorageError         extends AppError { code='STORAGE_ERROR';          httpStatus=500; }
export class AIError              extends AppError { code='AI_ERROR';               httpStatus=502; }
export class BillingError         extends AppError { code='BILLING_ERROR';          httpStatus=502; }
export class ExternalServiceError extends AppError { code='EXTERNAL_SERVICE_ERROR'; httpStatus=502; }
```

`handle()` is the single boundary:

```ts
export async function handle(req: NextRequest, fn: () => Promise<Response>) {
  const requestId = crypto.randomUUID();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn({ requestId, code: err.code, details: err.details }, err.message);
      return Response.json(
        { error: { code: err.code, message: err.message, details: err.details, requestId } },
        { status: err.httpStatus }
      );
    }
    logger.error({ requestId, err }, 'Unhandled error');   // full stack to logs only
    captureException(err, { requestId });
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', requestId } },
      { status: 500 }
    );
  }
}
```

**Never leaked to the client:** stack traces, SQL, Prisma error text, internal hostnames, other tenants' identifiers, provider API keys or raw provider errors. The `requestId` is returned so support can correlate without exposing internals.

**Frontend:** an `error.tsx` per route group renders a friendly message plus the `requestId` and a retry button. `global-error.tsx` catches layout-level failures. A React error boundary wraps each dashboard widget so one failing widget doesn't blank the page.

## 6.8 Reports

**Types**

| Type | Scope | Contents |
|---|---|---|
| `SCAN` | One scan | Full technical detail: consent matrix, trackers, cookies, requests summary, issues, screenshots, evidence appendix |
| `ISSUE` | One or more issues | Issue detail with evidence — for sending to a developer or documenting a fix |
| `MONTHLY_MONITORING` | Client or agency, one month | The flagship deliverable: scans performed, uptime of monitoring, score trend, issues found/resolved, changes detected, current status |
| `WEBSITE_HEALTH` | One website, point in time | Score breakdown, current issues, tracker inventory, consent status |
| `PRIVACY_DRIFT` | Website or client, a period | Everything that changed, before/after, with severity |

**Generation pipeline**

```mermaid
flowchart LR
  A[POST /api/reports] --> B[Validate + entitlement check]
  B --> C[Insert Report status=QUEUED]
  C --> D[Enqueue report-generation]
  D --> E[Worker: status=GENERATING]
  E --> F[Collect data via tenant-scoped repositories]
  F --> G[Render React component to HTML]
  G --> H[Playwright: page.setContent + page.pdf]
  H --> I[Upload to S3 under agencies/ID/reports/]
  I --> J[Report status=READY, s3Key, size, pageCount]
  J --> K[Notification + email to requester]
  E -.failure.-> L[status=FAILED + errorCode → notify]
```

**PDF approach: React → HTML → Playwright `page.pdf()`.** Chosen over `@react-pdf/renderer` and over a hosted PDF service because we already run and operate Chromium for scanning, so it adds no new dependency or vendor; it gives full CSS control (including print CSS, page breaks, running headers/footers via `headerTemplate`/`footerTemplate`); and report templates can reuse the same design tokens and components as the app. The report worker uses a **separate browser pool** from the scanner pool so a long PDF render never starves scans.

**White-label rendering.** Branding is resolved once, from `AgencyBranding` for the report's `agencyId`, and **snapshotted into `Report.brandingSnapshot` at generation time** so a re-download years later renders as it did when sent. The renderer receives branding as an explicit prop — there is no ambient/global branding state that could leak across tenants. A test renders two reports for two agencies concurrently in one worker process and asserts no cross-contamination.

**Report contents always include:** the agency's logo and contact details, the monitored website(s), the reporting period, the methodology note ("scanned in a headless Chromium browser from the EU; four consent journeys tested"), the limitations note, and the legal disclaimer (agency-customizable text appended to, never replacing, our base disclaimer).

## 6.9 White-Label Architecture

Branding applies to four surfaces: **PDF reports**, **the client portal**, **client-facing emails** (report delivery, portal invitations), and **shared report links**.

- The agency app itself is **not** white-labeled — the agency's own staff use our brand. This keeps the surface small and avoids a custom-domain requirement in v1.
- `resolveBranding(agencyId)` is the single accessor, cached in Redis for 5 minutes keyed **only** on `agencyId`, invalidated on branding update.
- Colors are validated for contrast at save time (WCAG AA against white and against our neutral surface). A failing color is rejected with an explanatory message rather than silently producing an unreadable report.
- Logos are uploaded to S3 under the agency prefix, virus-scanned by content-type and magic-byte check, resized to two variants, and served through signed URLs (portal) or embedded as data URIs (PDFs, so the PDF is self-contained).
- **Leakage prevention:** every branded renderer takes `branding` as a required parameter. No module-level or request-global branding. A lint rule forbids importing the branding cache directly outside `resolveBranding`.
- **Entitlement:** when `whiteLabel` is false, `resolveBranding` returns our default brand regardless of stored values — enforcement lives in the resolver, not in each template.

## 6.10 Client Portal Security

The portal is the highest-risk authenticated surface: it grants outsiders access to a slice of tenant data.

**Authentication: passwordless magic link with our own short-lived session.**

Rationale for not using Clerk here: portal users are the *agency's* customers, not our users. Putting them in Clerk would inflate our MAU billing, complicate the org model, and give client contacts an account on our platform, which is not what an agency wants. The portal session is deliberately simple and narrow.

```mermaid
sequenceDiagram
  participant C as Client contact
  participant P as Portal
  participant DB
  participant R as Resend
  C->>P: POST /api/portal/auth/request { email }
  P->>DB: find active PortalUser by email
  Note over P: Always responds 204 regardless — no user enumeration
  P->>DB: store sha256(token), expiresAt = now + 15 min, single-use
  P->>R: send magic link (agency-branded)
  C->>P: GET /portal/auth?token=...
  P->>DB: lookup by hash, check expiry + unused, mark used
  P->>DB: create PortalSession (hashed token, 7-day expiry)
  P->>C: Set-Cookie pdm_portal (HttpOnly, Secure, SameSite=Lax, Path=/portal)
```

**Controls**

| Control | Implementation |
|---|---|
| Token strength | 32 random bytes, base64url; stored only as SHA-256 |
| Magic link lifetime | 15 minutes, single-use, invalidated on use |
| Session lifetime | 7 days, sliding renewal on activity, absolute max 30 days |
| Cookie | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/portal`, `__Host-` prefix |
| Scope | Session carries `portalUserId`, `clientId`, `agencyId`. **Every portal query filters on both `agencyId` and `clientId`** |
| Data filtering | A dedicated `portalSerializer` maps internal models to client-safe DTOs. Internal notes, rule IDs, assignees, raw evidence, and cost data are structurally absent from the DTO types, so they cannot be leaked by an accidental spread |
| Revocation | Agency revokes a portal user → `revokedAt` set → all their `PortalSession` rows deleted → next request 401s |
| Rate limiting | 5 magic-link requests per hour per email and per IP |
| Enumeration | The request endpoint always returns 204 |
| Audit | Portal logins, report downloads, and issue views write `AuditLog` rows with `actorType: 'portal_user'`, visible to the agency |
| CSRF | Portal mutations are limited to `PATCH /api/portal/settings`; `SameSite=Lax` plus an origin check covers it |
| Isolation from the app | Portal routes live in their own route group with their own layout; `proxy.ts` explicitly excludes them from Clerk, and Clerk helpers are not imported anywhere under `(portal)` |

## 6.11 Search, Pagination, Caching

**Search — PostgreSQL only.** No Elasticsearch in the MVP.
- Websites/clients: `ILIKE '%q%'` on `url`/`name` with a `pg_trgm` GIN index. At the data volumes involved (a large agency has ~200 websites) this is instantaneous.
- Issues: full-text search on a generated `tsvector` column over `title || message`, with a GIN index.
- Trackers: `ILIKE` on name and domain patterns.
- Global `⌘K` search unions the three, capped at 5 results each, debounced 200 ms, tenant-scoped.
- **Revisit trigger:** if any tenant exceeds ~50k issues or search p95 exceeds 300 ms, evaluate a dedicated search index. Not before.

**Pagination decisions**

| List | Strategy | Why |
|---|---|---|
| Websites, Clients, Issues, Reports, Trackers | Offset | Bounded by plan limits; users expect page numbers and a total count |
| Scans, Network requests, Drift events, Notifications, Audit logs, Activity | Cursor | Unbounded, time-ordered, append-heavy; offset degrades and can skip rows as new data arrives |

Cursors are base64-encoded `{ createdAt, id }` tuples, signed to prevent tampering, matching the `(x, createdAt DESC)` indexes exactly.

**Caching**

| Data | Where | TTL | Invalidation |
|---|---|---|---|
| Plan definitions | Redis + in-process | 1 h | On admin plan edit |
| Tracker vendor database | In-process per worker | 15 min | On admin vendor edit (pub/sub bust) |
| Entitlements per agency | Redis | 5 min | On subscription webhook, plan change, admin override |
| Agency branding | Redis | 5 min | On branding update |
| Feature flags | Redis + in-process | 60 s | On flag change |
| Dashboard summary | Redis, keyed `agencyId` | 60 s | On scan completion for that agency |
| Public pricing page | Next static + `revalidateTag('plans','max')` | — | On plan edit |
| AI responses | Postgres `AIRequest.inputHash` | 7 days | On evidence change (hash changes naturally) |

**Never cached:** issue lists, evidence, scan detail, anything tenant-specific beyond the explicitly listed keys. Every cache key that touches tenant data includes `agencyId` as the **first** segment — a lint rule enforces the naming convention `pdm:{scope}:{agencyId}:{...}`.

---

# Part VII — Asynchronous Architecture

## 7.1 Why Workers Are Separate Processes

A privacy scan takes 60–300 seconds, consumes 300–800 MB of RAM, and pins a CPU core. Running that inside the web server would make request latency unpredictable and make horizontal scaling of the web tier wasteful (you'd scale RAM for scans, not for requests). Workers are therefore separate containers, scaled independently, with their own resource profile.

They share the monorepo, the Prisma client, the Zod schemas, and the scanner package with the web app — so there is exactly one definition of every domain concept — but they deploy as different images with different CPU/memory allocations.

## 7.2 Queue Topology

```mermaid
flowchart TB
  subgraph Producers
    W[Next.js web] 
    S[Scheduler worker]
  end

  subgraph Redis["Redis (BullMQ)"]
    Q1[scan]
    Q2[scan:free]
    Q3[scan-analysis]
    Q4[drift-analysis]
    Q5[report-generation]
    Q6[ai]
    Q7[notification]
    Q8[email]
    Q9[cleanup]
    Q10[maintenance]
  end

  subgraph Workers
    WS[scanner worker<br/>×N, 2 vCPU / 4 GB]
    WA[analysis worker<br/>×M, 1 vCPU / 1 GB]
    WR[report worker<br/>×2, 2 vCPU / 2 GB]
    WI[ai worker<br/>×2, 0.5 vCPU / 512 MB]
    WN[notification+email worker<br/>×2, 0.5 vCPU / 512 MB]
    WC[cleanup+maintenance worker<br/>×1, 0.5 vCPU / 512 MB]
  end

  W --> Q1 & Q2 & Q5 & Q6 & Q7
  S --> Q1 & Q9 & Q10
  Q1 --> WS
  Q2 --> WS
  WS --> Q3
  Q3 --> WA
  WA --> Q4
  Q4 --> WA
  WA --> Q7
  Q5 --> WR
  Q6 --> WI
  Q7 --> WN
  Q7 --> Q8
  Q8 --> WN
  Q9 --> WC
  Q10 --> WC
```

| Queue | Job | Concurrency (per worker) | Attempts | Backoff | Timeout | Priority | Notes |
|---|---|---|---|---|---|---|---|
| `scan` | Full website scan | 2 | 3 | exponential, 30 s base, ±20% jitter | 10 min | 1 (high) / 5 (normal) / 10 (low) | Browser-bound; concurrency tied to available RAM |
| `scan:free` | Anonymous scan | 1 | 1 | — | 60 s | 20 (lowest) | **Separate queue so it can never starve paying work** |
| `scan-analysis` | Classify, run rules, score | 10 | 3 | exponential, 5 s | 2 min | 5 | CPU-light, DB-heavy |
| `drift-analysis` | Diff vs previous scan | 10 | 3 | exponential, 5 s | 2 min | 5 | |
| `report-generation` | Render + upload PDF | 2 | 2 | fixed 60 s | 5 min | 5 | Own browser pool |
| `ai` | LLM call + validation | 5 | 2 | exponential, 10 s | 90 s | 5 | Provider rate-limit aware |
| `notification` | Fan out alerts | 20 | 3 | exponential, 10 s | 30 s | 3 | |
| `email` | Send via Resend | 20 | 5 | exponential, 30 s | 30 s | 3 | Highest attempts — email must not be lost |
| `cleanup` | Retention deletion | 1 | 2 | fixed 5 min | 30 min | 20 | Nightly, paced |
| `maintenance` | Counter reconciliation, health sweeps, stuck-scan recovery | 1 | 2 | fixed 5 min | 15 min | 20 | |

**Removal policy:** `removeOnComplete: { age: 86400, count: 5000 }`, `removeOnFail: { age: 604800 }` — completed jobs are evidence for a day, failures for a week (they feed the admin queue view).

## 7.3 Job Data Schemas

Every payload is a Zod schema in `packages/schemas/src/jobs.ts`, parsed on both enqueue and dequeue. A malformed payload fails immediately rather than deep inside a browser session.

```ts
export const scanJobSchema = z.object({
  scanId: z.string().uuid(),
  agencyId: z.string().uuid(),
  websiteId: z.string().uuid(),
  url: z.string().url(),
  monitoredPaths: z.array(z.string()).max(20),
  trigger: z.nativeEnum(ScanTrigger),
  consentPhases: z.array(z.nativeEnum(ConsentPhase)).min(1),
  screenshotPolicy: z.nativeEnum(ScreenshotPolicy),
  consentOverride: consentOverrideSchema.nullable(),
  respectRobots: z.boolean(),
  verificationIssueId: z.string().uuid().optional(),
  scannerVersion: z.string(),
});

export const scanAnalysisJobSchema = z.object({
  scanId: z.string().uuid(),
  agencyId: z.string().uuid(),
  websiteId: z.string().uuid(),
});

export const aiJobSchema = z.object({
  aiRequestId: z.string().uuid(),
  agencyId: z.string().uuid(),
  feature: z.nativeEnum(AIFeature),
  entityType: z.string(),
  entityId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});

export const emailJobSchema = z.object({
  agencyId: z.string().uuid().nullable(),
  template: z.nativeEnum(EmailTemplate),
  to: z.array(z.string().email()).min(1).max(50),
  data: z.record(z.unknown()),
  idempotencyKey: z.string(),
});
```

**Idempotency by job ID.** BullMQ deduplicates on `jobId`. We use deterministic IDs so a double-enqueue is a no-op:

| Job | `jobId` |
|---|---|
| Scan | `scan:{scanId}` (the `Scan` row is created first, so the ID is already unique) |
| Analysis | `analysis:{scanId}` |
| Drift | `drift:{scanId}` |
| Report | `report:{reportId}` |
| AI | `ai:{aiRequestId}` |
| Email | `email:{sha256(template+to+idempotencyKey)}` |
| Scheduled scan | `sched:{websiteId}:{yyyy-mm-dd-HH}` — prevents a scheduler double-fire creating two scans in the same window |

## 7.4 The Scan Pipeline

```mermaid
flowchart TD
  A[Create Scan record<br/>status=QUEUED] --> B[Enqueue scan job<br/>jobId=scan:ID]
  B --> C[Worker claims job<br/>status=RUNNING]
  C --> D[SSRF guard revalidates URL]
  D -->|blocked| Z1[FAILED: SSRF_BLOCKED]
  D --> E[Acquire browser from pool]
  E -->|timeout| Z2[FAILED: BROWSER_POOL_TIMEOUT → retry]
  E --> F[For each monitored path]
  F --> G[Fresh context: NO_CONSENT phase]
  G --> H[Navigate + settle + observe + scroll]
  H --> I[Detect CMP, resolve adapter]
  I --> J[Capture requests, cookies, storage, console, screenshot]
  J --> K[Fresh context: REJECT_ALL phase]
  K --> L[Fresh context: ACCEPT_ALL phase]
  L --> M[Fresh context: WITHDRAW phase<br/>accept → verify → withdraw]
  M --> N[Persist raw evidence in batches]
  N --> O[Release browser, close all contexts]
  O --> P[status = COMPLETED or PARTIAL]
  P --> Q[Enqueue scan-analysis]
  Q --> R[Classify trackers against vendor DB]
  R --> S[Run rule engine → findings]
  S --> T[Apply ignore rules]
  T --> U[Upsert Issues on websiteId+fingerprint]
  U --> V[Build normalized fingerprints]
  V --> W[Enqueue drift-analysis]
  W --> X[Load previous COMPLETED scan]
  X --> Y[Diff → PrivacyDriftEvent rows]
  Y --> AA[Drift-derived rules → more Issues]
  AA --> AB[Compute health score + breakdown]
  AB --> AC[Update Website counters, score, lastScan, nextScanAt]
  AC --> AD[Enqueue notification jobs]
  AD --> AE{autoExplainCritical<br/>and credits available?}
  AE -->|yes| AF[Enqueue ai jobs for critical issues]
  AE -->|no| AG[Done]
  AF --> AG
```

**Why analysis is a separate job from scanning.** The scan job holds a browser — the scarcest resource in the system. Handing off to a CPU-light analysis job releases the browser seconds earlier, which measurably raises scan throughput per worker. It also means a bug in the rule engine can be fixed and the analysis replayed against stored evidence without re-scanning the customer's website.

**Failure semantics at each stage**

| Stage fails | Result |
|---|---|
| SSRF guard | `FAILED`, no retry, security event logged |
| Browser acquisition | Retried (transient) up to 3 attempts |
| Navigation | Retried within the job twice for transient classes; otherwise `FAILED` |
| One consent phase | Phase → `UNDETERMINED`, **other phases still attempted**, scan → `PARTIAL` |
| Evidence persistence | Retried; on final failure the scan is `FAILED` (evidence without persistence is worthless) |
| Analysis | Retried 3×; scan stays `COMPLETED` but `analysisStatus` flags it; admin alert |
| Drift | Retried 3×; scan and issues survive; drift can be recomputed later |
| Notification | Retried; failure does not affect scan state |

## 7.5 Scheduling Recurring Scans

**Decision: a database-driven scheduler, not BullMQ repeatable jobs per website.**

BullMQ repeatable jobs would mean one repeatable entry per website (potentially 100k of them), each needing to be added, removed, and rescheduled whenever a user changes frequency, pauses a site, or archives it. Keeping Redis repeatable state consistent with the database through all those transitions is a synchronization problem with no upside.

Instead:

```ts
// apps/worker/src/schedulers/scan-scheduler.ts
// One repeatable BullMQ job, every minute.
async function tick() {
  const due = await prisma.website.findMany({
    where: {
      monitoringStatus: 'ACTIVE',
      archivedAt: null,
      nextScanAt: { lte: new Date() },
      agency: { status: 'ACTIVE', subscription: { status: { in: ['ACTIVE','TRIALING'] } } },
    },
    take: 500,
    orderBy: { nextScanAt: 'asc' },
    select: { id: true, agencyId: true, url: true, scanFrequency: true, scanPriority: true, /* ... */ },
  });

  for (const site of due) {
    // Entitlement check happens here, once, before spending a browser
    const ok = await entitlements.consume(site.agencyId, 'SCANS', 1);
    if (!ok) { await markQuotaExceeded(site); continue; }

    const scan = await createScanRecord(site, 'SCHEDULED');
    await scanQueue.add('scan', buildPayload(site, scan), {
      jobId: `sched:${site.id}:${hourBucket()}`,
      priority: priorityFor(site.scanPriority),
    });
    await prisma.website.update({
      where: { id: site.id },
      data: { nextScanAt: computeNextScanAt(site, new Date()) },
    });
  }
}
```

`nextScanAt` is the single source of truth. Pausing sets it to `null`. Resuming recomputes it. Changing frequency recomputes it. There is no Redis state to keep in sync.

**Jitter.** `computeNextScanAt` spreads scans across the interval using a stable hash of `websiteId`, so a thousand daily-scan sites don't all fire at midnight. Daily scans are distributed across a 6-hour window centered on the agency's configured preferred time.

**Stuck-scan recovery.** A `maintenance` job every 5 minutes finds `Scan` rows in `RUNNING` with `startedAt` older than the job timeout plus a margin, marks them `FAILED` with `errorCode: 'WORKER_LOST'`, and releases their entitlement consumption. This covers worker crashes that BullMQ's stalled-job detection misses.

## 7.6 Retry Strategy

| Operation | Attempts | Backoff | Do not retry when |
|---|---|---|---|
| Browser launch | 3 | 2 s, 5 s, 15 s | Playwright install/binary missing (config error) |
| Navigation | 3 | 2 s, 5 s | DNS NXDOMAIN, SSRF block, HTTP 404/410, TLS name mismatch |
| Consent interaction | 2 | 1 s | Banner definitively absent |
| Evidence DB write | 3 | 1 s, 3 s, 9 s | Constraint violation (a bug — surface it) |
| S3 upload | 5 | exponential + jitter, 1–30 s | 403 (credentials/policy — surface it) |
| Email (Resend) | 5 | exponential, 30 s–10 min | 422 invalid recipient — mark bounced |
| AI provider | 2 | 10 s, 30 s (honor `Retry-After`) | 400 invalid request, content filter, or schema-validation failure after the one repair attempt |
| Stripe API | 3 | exponential | 400-class errors |
| Stripe webhook processing | 5 | exponential | Unknown event type — record as `ignored`, return 200 |
| Redis command | 3 | 100 ms, 300 ms, 900 ms | — (then fail the operation and open the circuit) |

**Principle: never retry a deterministic failure.** Each retryable path classifies the error first (`isTransient(err)`), and non-transient errors fail immediately with a stable code. Retrying a 404 forever burns browser minutes and delays real work.

**Dead-letter handling.** After final failure a job stays in BullMQ's failed set (7-day retention) and, for `scan`, `report-generation`, and `email`, writes a `SystemLog` row at `error`. `/admin/queue` surfaces failed jobs with their stack traces and offers retry — individually or in bulk by error class.

## 7.7 Concurrency and Scalability

**The binding constraint is browser memory.** A Chromium context under a heavy page peaks around 400–600 MB. A 4 GB worker safely runs 2 concurrent scans with headroom for the browser process itself and Node.

### Scaling by tier

**ASSUMPTION** for all figures below: average agency monitors 30 websites; average scan frequency is weekly; average scan duration is 3 minutes across four phases.

| Tier | Agencies | Websites | Scans/day | Scanner workers | Analysis | Web | Postgres | Redis | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **10** | 10 | 300 | ~43 | 1 (2 vCPU / 4 GB) | shares the worker container | 1 (1 vCPU / 1 GB) | 2 vCPU / 4 GB managed | 256 MB | Single region. Everything fits on ~$150/mo |
| **100** | 100 | 3,000 | ~430 | 3 | 1 dedicated | 2 | 4 vCPU / 8 GB + 1 read replica | 1 GB | Add PgBouncer. Split analysis from scanning |
| **1,000** | 1,000 | 30,000 | ~4,300 | 12–15 | 3 | 4 | 8 vCPU / 32 GB, 2 replicas | 4 GB | Partition `network_requests`; move reads for dashboards to a replica; consider a second scanner region |
| **10,000** | 10,000 | 300,000 | ~43,000 | 100+ (autoscaled on queue depth) | 20 | 10+ | Sharded or Citus; evidence in a separate cluster | Redis Cluster, 3 shards | Multi-region scanning; per-tenant scan-rate shaping; evidence tiered to object storage with Postgres holding only summaries |

### Horizontal scaling mechanics

- **Scanner workers are stateless** — they claim jobs, and any worker can run any job. Adding a container adds capacity immediately.
- **Autoscaling signal:** `waiting` job count in the `scan` queue divided by total concurrency. Scale up when the ratio implies > 10 minutes of backlog; scale down after 15 minutes below 2 minutes of backlog. Scale-down is slower than scale-up to avoid thrashing.
- **Graceful shutdown:** on `SIGTERM`, the worker stops accepting jobs, waits up to 120 s for in-flight scans, drains the browser pool, then exits. BullMQ returns unfinished jobs to the queue via stalled-job detection.
- **Redis scaling:** BullMQ is Redis-bound on job throughput, not data size. A single instance handles far more than tier 3 requires. At tier 4, split queues across Redis instances by queue name (BullMQ supports per-queue connections) before reaching for Cluster.
- **Postgres scaling:** PgBouncer in transaction mode from the start (Prisma with `pgbouncer=true`). Read replicas serve dashboard aggregates and report data collection. Writes stay on the primary. The heaviest write path (evidence insertion) is batched — `createMany` in chunks of 1,000 — which reduces round trips by ~100×.
- **Connection budget:** each web container uses a pool of 10; each worker 5. At tier 3 that is 4×10 + 38×5 = 230 connections, which is why PgBouncer is mandatory rather than optional.

### Per-tenant fairness

A single agency bulk-scanning 200 websites must not delay everyone else. Enforced by:
1. **Per-agency concurrency cap** — a Redis counter limits an agency to `min(planConcurrency, 5)` simultaneously running scans. Jobs above the cap are re-queued with a short delay rather than executed.
2. **Priority by plan** — higher plans get lower BullMQ priority numbers (higher priority) for manual scans.
3. **Separate free-scan queue** — anonymous traffic is structurally incapable of consuming paid capacity.

## 7.8 Reliability Patterns

- **Job idempotency:** every handler is safe to run twice. Scan jobs check `Scan.status` and exit early if already terminal. Analysis is a pure function over stored evidence, re-runnable at any time. Email jobs check `AlertHistory` for a matching `idempotencyKey`.
- **Post-commit enqueue reconciliation:** because jobs are enqueued after their transaction commits, a crash in between leaves an orphan. A `maintenance` sweep finds `Scan` rows in `QUEUED` older than 10 minutes with no corresponding BullMQ job and re-enqueues them.
- **Circuit breakers** around OpenAI, Resend, Stripe, and S3 (`packages/shared/src/circuit-breaker.ts`): 5 failures in 60 s opens the circuit for 60 s; half-open probes with one request. An open AI circuit degrades to "AI temporarily unavailable" in the UI without touching scanning.
- **Backpressure:** if the `scan` queue exceeds 5,000 waiting jobs, manual-scan enqueueing returns 429 with a "high demand" message and scheduled scans are deferred rather than piled on.

---

# Part VIII — AI Architecture

## 8.1 Where AI Belongs — And Where It Does Not

AI is used **only** where a language model does something a deterministic system genuinely cannot: turning verified technical facts into an explanation, a recommendation, or a client-appropriate message.

**AI never:** decides whether a request happened · classifies a tracker in the MVP detection path · computes a score · determines an issue's severity · decides whether a scan succeeded · writes to the tracker database · generates SQL · asserts a legal conclusion.

## 8.2 Architecture

```mermaid
flowchart TD
  A[Playwright] --> B[Evidence Collector]
  B --> C[Rule Engine]
  C --> D[Verified Findings in Postgres]
  D --> E[ContextBuilder<br/>compact, typed, redacted]
  E --> F{Cache hit on inputHash?}
  F -->|yes| K[Return cached output]
  F -->|no| G{Entitlement + budget check}
  G -->|exceeded| L[Return quota error, no call]
  G -->|ok| H[AIProvider → OpenAI<br/>structured output, JSON schema]
  H --> I[Zod validation + grounding check]
  I -->|invalid| M[One repair attempt, then fail gracefully]
  I -->|valid| J[Persist AIRequest + output]
  J --> K
  K --> N[UI, with evidence links + AI label]
  D --> N
```

The key structural property: **the UI's path from findings to display does not pass through the LLM.** AI output is an optional overlay.

## 8.3 The `AIProvider` Abstraction

```ts
// packages/ai/src/provider.ts
export interface AIProvider {
  readonly name: string;
  explainIssue(ctx: IssueContext, opts: CallOptions): Promise<AIResult<IssueExplanation>>;
  recommendFix(ctx: IssueContext, opts: CallOptions): Promise<AIResult<FixRecommendation>>;
  summarizeDrift(ctx: DriftContext, opts: CallOptions): Promise<AIResult<DriftSummary>>;
  generateClientMessage(ctx: ClientMessageContext, opts: CallOptions): Promise<AIResult<ClientMessage>>;
  classifyTracker(ctx: TrackerContext, opts: CallOptions): Promise<AIResult<TrackerClassification>>;   // V1.5
  analyzeRootCause(ctx: RootCauseContext, opts: CallOptions): Promise<AIResult<RootCauseAnalysis>>;    // V1.5
}

export interface CallOptions {
  tier: 'standard' | 'advanced';
  maxOutputTokens: number;
  timeoutMs: number;
  traceId: string;
}

export interface AIResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: AIErrorCode;
  usage: { promptTokens: number; completionTokens: number; costMicroCents: number };
  model: string;
  latencyMs: number;
}
```

**Concrete implementation:** `OpenAIProvider` in `packages/ai/src/providers/openai.ts`, using the Responses API with strict JSON-schema structured outputs (`strict: true`), so the model cannot return a shape our schema rejects.

**Model tier mapping** lives entirely in configuration (`AI_MODEL_STANDARD`, `AI_MODEL_ADVANCED` env vars, overridable per agency via `AgencyAiSettings.modelTier`):

| Tier | Used for | Why |
|---|---|---|
| `standard` (small, fast, cheap) | Issue explanation, client message, drift summary | Structured summarization of supplied facts — a small model handles this well and it is the high-volume path |
| `advanced` (large) | Root-cause analysis, tracker classification, developer task generation | Multi-step reasoning over more context; low volume, higher value |

**Provider portability:** nothing outside `packages/ai/src/providers/` imports the OpenAI SDK. A new provider implements the interface and is selected by `AI_PROVIDER`. The prompts, schemas, validators, caching, metering, and grounding checks are all provider-agnostic. A `MockProvider` returning fixture responses is used in tests so the entire test suite runs offline.

## 8.4 Context Building — Compact, Not Raw

**The rule: never send raw scan data.** A scan produces megabytes; the model needs a few hundred tokens of structured facts.

```ts
// packages/ai/src/context/issue.ts
export interface IssueContext {
  issue: {
    ruleId: string;
    severity: Severity;
    category: IssueCategory;
    message: string;              // deterministic rule text
    confidence: number;
    firstDetectedAt: string;      // ISO
    occurrenceCount: number;
  };
  evidence: Array<{
    ref: string;                  // IssueEvidence.id — the grounding anchor
    kind: EvidenceKind;
    consentPhase: ConsentPhase;
    observedAtMs: number;
    summary: string;              // 'GET connect.facebook.net/en_US/fbevents.js → 200'
  }>;                             // capped at 8, highest-confidence first
  tracker?: { name: string; category: TrackerCategory; vendorCompany?: string };
  site: {
    cms?: string;                 // detected from generator meta / known paths
    cmp?: string;                 // detected CMP name
    registrableDomain: string;    // NOT the full URL
  };
  history: {
    previousScanStatus: 'clean' | 'same_issue' | 'different_issues' | 'no_previous';
    driftChangeType?: DriftChangeType;
    daysSinceFirstDetected: number;
  };
}
```

A realistic serialized context, matching the prompt's example shape:

```json
{
  "issue": { "ruleId": "PDM-R001", "severity": "CRITICAL", "category": "PRE_CONSENT_TRACKING",
             "message": "A marketing tracker was detected before consent was given.",
             "confidence": 0.97, "occurrenceCount": 3 },
  "evidence": [
    { "ref": "ev_01HX…", "kind": "NETWORK_REQUEST", "consentPhase": "NO_CONSENT",
      "observedAtMs": 1842, "summary": "GET connect.facebook.net/en_US/fbevents.js → 200 (initiator: gtm.js)" },
    { "ref": "ev_01HY…", "kind": "COOKIE", "consentPhase": "NO_CONSENT",
      "observedAtMs": 1990, "summary": "_fbp set on .example.com, 90 days, not HttpOnly" }
  ],
  "tracker": { "name": "Meta Pixel", "category": "MARKETING", "vendorCompany": "Meta Platforms, Inc." },
  "site": { "cms": "WordPress", "cmp": "Complianz", "registrableDomain": "example.com" },
  "history": { "previousScanStatus": "clean", "driftChangeType": "TRACKER_ADDED", "daysSinceFirstDetected": 3 }
}
```

≈300 tokens. Compare to the full scan evidence, which would be 200k+.

**Redaction before the model sees anything:** full URLs are reduced to host + path shape (query strings stripped entirely), cookie values are never included, no customer PII, no agency name, no client name, no user email. The model receives a technical situation, not a customer record.

## 8.5 AI Features

### MVP

**1. Issue Explanation** (`EXPLAIN_ISSUE`, standard tier)
- *Pain:* Persona B cannot read a raw finding.
- *Input:* `IssueContext`. *Output:* `IssueExplanation`.
- *UX:* Issue detail, section 7. Generated on demand via a button, or automatically for Critical issues when `autoExplainCritical` is on and credits remain.
- *Cost:* **ASSUMPTION** ~400 in / ~250 out tokens ≈ $0.0004 per call at standard-tier pricing.
- *Failure:* the section shows "AI explanation unavailable — the technical details above are complete." Nothing else degrades.

**2. Fix Recommendation** (`RECOMMEND_FIX`, standard tier)
- *Pain:* Persona C wants the shortest path to a fix.
- *Input:* `IssueContext` plus detected CMS and CMP. *Output:* `FixRecommendation`.
- *UX:* Issue detail, section 8, below the explanation.
- *Failure:* the deterministic `recommendedAction` from the rule is shown instead — always present, so this section is never empty.

**3. Privacy Drift Summary** (`SUMMARIZE_DRIFT`, standard tier)
- *Pain:* "What changed this week?" across many events.
- *Input:* `DriftContext` — up to 20 drift events with type, severity, subject, and before/after counts. *Output:* `DriftSummary`.
- *UX:* Website Changes tab header; dashboard drift widget; monthly report intro.
- *Cost:* higher input (~800 tokens) but generated at most once per website per scan and cached.
- *Failure:* the structured event list renders alone.

**4. Client Message Generator** (`CLIENT_MESSAGE`, standard tier)
- *Pain:* Persona B spends 30 minutes writing an email.
- *Input:* one or more issues plus the agency's chosen tone (`reassuring` / `factual` / `urgent`) and whether a fix is already underway. *Output:* `ClientMessage`.
- *UX:* Issue detail action and a bulk action on the issue list. Opens in an editable textarea with copy and "open in email client."
- *Safety:* this output is the most likely to reach a third party, so it gets the strictest terminology validation (§8.7) and is always presented as a **draft** the human edits.

### V1.5

**5. Unknown Tracker Classification** (`CLASSIFY_TRACKER`, advanced tier) — proposes a category and vendor identity for a frequently-seen unknown domain. **Output goes to `/admin/trackers` for human approval; it never writes to `TrackerVendor` directly.**

**6. Root-Cause Analysis** (`ROOT_CAUSE`, advanced tier) — given an issue plus the drift context plus what else changed in the same scan, hypothesizes *why*. Output is explicitly labeled as hypothesis, with a confidence and a list of what to check.

**7. Developer Task Generation** (`DEVELOPER_TASK`, standard tier) — formats an issue as a ticket with acceptance criteria, for pasting into Jira/Trello.

### V2

**8. Privacy Copilot** and **9. Natural-Language Search** — see §8.10.

## 8.6 Output Contracts

Every output has a Zod schema in `packages/ai/src/schemas/`, converted to JSON Schema and sent to the provider as a strict structured-output specification, then re-validated on receipt.

```ts
export const issueExplanationSchema = z.object({
  summary: z.string().min(20).max(400),
  technical_reason: z.string().min(20).max(800),
  likely_cause: z.string().min(10).max(500),
  confidence: z.enum(['high','medium','low']),
  evidence_refs: z.array(z.string()).min(1).max(8),
  recommended_action: z.string().min(10).max(500),
  is_hypothesis: z.boolean(),
});

export const fixRecommendationSchema = z.object({
  steps: z.array(z.object({
    order: z.number().int().min(1),
    action: z.string().min(10).max(300),
    where: z.string().max(200),            // 'Google Tag Manager → Tags → Meta Pixel'
  })).min(1).max(8),
  affected_system: z.enum(['cmp','tag_manager','theme','plugin','hardcoded','third_party_embed','unknown']),
  risk: z.enum(['low','medium','high']),
  verification_steps: z.array(z.string().max(300)).min(1).max(5),
  confidence: z.enum(['high','medium','low']),
  evidence_refs: z.array(z.string()).min(1).max(8),
});

export const clientSummarySchema = z.object({
  summary: z.string().min(20).max(600),
  severity: z.enum(['critical','high','medium','low','info']),
  recommended_next_step: z.string().min(10).max(300),
});

export const clientMessageSchema = z.object({
  subject: z.string().min(5).max(120),
  body: z.string().min(50).max(2500),
  tone: z.enum(['reassuring','factual','urgent']),
  mentions_no_legal_advice: z.literal(true),   // structurally forces the disclaimer
});

export const driftSummarySchema = z.object({
  headline: z.string().min(10).max(160),
  narrative: z.string().min(30).max(1200),
  most_significant_change: z.string().max(300),
  events_referenced: z.array(z.string().uuid()).min(1).max(20),
  confidence: z.enum(['high','medium','low']),
});

export const trackerClassificationSchema = z.object({
  proposed_vendor_name: z.string().max(120),
  proposed_category: z.nativeEnum(TrackerCategory),
  proposed_risk: z.enum(['critical','high','medium','low']),
  reasoning: z.string().max(600),
  confidence: z.enum(['high','medium','low']),
  requires_human_review: z.literal(true),      // always true, structurally
});
```

**Validation pipeline** (`packages/ai/src/validate.ts`), in order:

1. **Schema parse.** Zod. Failure → one repair attempt (§8.8), then `VALIDATION_FAILED`.
2. **Grounding check.** Every `evidence_refs` entry must exist in the `IssueEvidence` rows that were supplied in the context. **A single unresolvable ref rejects the whole response.** This is the mechanical enforcement of P2.
3. **Terminology check.** The output is scanned for the forbidden phrases from Part I §1.12 (`guaranteed`, `illegal`, `you must`, `violation` unqualified, `legal advice`, `compliant`, `non-compliant`, `breach`). A hit rejects the response.
4. **Claim check.** Reject outputs containing completion claims ("I have fixed", "this has been resolved", "I updated") — the AI never acts, so it must never say it did.
5. **Length and shape sanity.** Enforced by the schema, re-checked because a provider may return a schema-valid but degenerate response (e.g. repeated text).

Failures are recorded on `AIRequest.validationErrors` and surfaced in `/admin/ai-usage` as a per-feature validation-failure rate — a rising rate is the signal that a prompt needs revision.

## 8.7 Prompts

Prompts live in `packages/ai/src/prompts/*.ts` as versioned exports (`EXPLAIN_ISSUE_V1`), with the version recorded on every `AIRequest` so an output can always be traced to the prompt that produced it.

**Shared system preamble (applied to every call):**

```
You are a technical assistant inside a privacy and consent monitoring platform used by web
development agencies. You explain findings that were produced by a deterministic browser
scanner and a rule engine.

ABSOLUTE CONSTRAINTS:
1. Every factual statement you make must be supported by an item in the EVIDENCE array.
   Cite the evidence by its `ref` value in `evidence_refs`. Never cite a ref that is not
   in the provided EVIDENCE array.
2. You must NOT invent requests, cookies, domains, timings, vendors, or any technical
   detail that is not in the provided context.
3. You must NOT state or imply legal conclusions. Never use: "violation", "illegal",
   "unlawful", "breach", "compliant", "non-compliant", "guaranteed", "you must",
   "legal advice", "GDPR violation". Use instead: "potential issue", "detected",
   "observed", "review recommended", "may require review".
4. You must NOT claim that any action has been taken, fixed, or completed. You only
   describe and recommend.
5. When you are inferring rather than reporting, say so and set `is_hypothesis` to true.
6. If the evidence is insufficient to answer confidently, say so and set confidence to "low".
   An honest "the evidence does not show why" is a correct answer.
7. Write for a competent web professional who is not a privacy specialist. Be concrete
   and brief. No preamble, no restating the question.

Respond only with JSON matching the provided schema.
```

**`EXPLAIN_ISSUE_V1` user message:**

```
Explain this potential privacy issue.

CONTEXT:
{{contextJson}}

Produce:
- summary: 1–2 sentences a non-technical account manager can understand. Say what was
  observed and why it is being flagged.
- technical_reason: what the scanner observed and why the rule considers it notable.
  Reference the consent phase and the timing.
- likely_cause: the most probable technical origin given the CMS and CMP in the context.
  If the evidence does not indicate a cause, say so and set is_hypothesis true.
- recommended_action: the single most useful next step.
- confidence: high only when the evidence directly supports your explanation.
- evidence_refs: the refs you actually relied on.
```

**`RECOMMEND_FIX_V1` user message:**

```
Recommend how to address this potential issue.

CONTEXT:
{{contextJson}}

Rules:
- Steps must be specific to the CMS ({{cms}}) and CMP ({{cmp}}) named in the context.
  If either is unknown, give steps that work generally and say which detail would
  narrow it down.
- `where` should name the actual screen or file a developer would open.
- verification_steps must describe how to confirm the fix using this platform
  (re-scan and check the relevant consent phase) plus one independent check.
- Do not suggest disabling the consent banner or suppressing detection.
- risk describes the risk of applying the fix (e.g. breaking analytics continuity),
  not the risk of the issue.
```

**`CLIENT_MESSAGE_V1` user message:**

```
Draft a message from a web agency to their client about the findings below.

CONTEXT:
{{contextJson}}
TONE: {{tone}}
FIX_IN_PROGRESS: {{fixInProgress}}

Rules:
- The reader is a non-technical marketing contact.
- Explain what was found, what it means practically, and what happens next.
- Do not alarm. Do not minimise. Do not promise a compliance outcome.
- Include one sentence noting that this is a technical observation and that legal
  questions should be directed to their own advisor. Set mentions_no_legal_advice true.
- Do not include pricing, internal notes, or scanner implementation details.
- 150–250 words.
```

**`SUMMARIZE_DRIFT_V1` user message:**

```
Summarise what changed on this website between two scans.

CONTEXT:
{{contextJson}}

- headline: one line, under 160 characters, naming the most important change.
- narrative: 2–4 sentences. Group related changes. State whether the overall direction
  is an improvement or a degradation, based only on the events provided.
- most_significant_change: name the single event that most warrants attention and why.
- events_referenced: the event ids you actually used.
- If all changes are minor, say so plainly rather than manufacturing significance.
```

## 8.8 AI Safety

| Risk | Control |
|---|---|
| Fabricated evidence | Grounding check rejects any unresolvable `evidence_refs`; no ref → no output |
| Legal conclusions | Forbidden-term list in the system prompt **and** a post-hoc validator that rejects on match |
| Claimed actions | Validator rejects completion language |
| Fact vs. hypothesis blur | `is_hypothesis` is a required schema field; the UI renders hypotheses in a visually distinct, labeled block |
| Overconfidence | `confidence` is required; `low` renders a "review the evidence directly" prompt |
| Prompt injection from scanned content | **The model never sees page content.** Context is built from typed database fields, and every string that could originate from a scanned site (domain names, cookie names) is escaped and length-capped. This is the strongest available defense: injection requires reaching the model, and scanned text does not |
| Prompt injection via user input | User-supplied free text (tone selection, resolution notes) is enum-constrained or excluded from prompts |
| Hallucinated vendors | The vendor name in context comes from our database; the model is told to use only names present in the context |
| Silent degradation | Every AI surface has a deterministic fallback and an explicit "AI unavailable" state |
| Opacity | Every AI output carries a persistent "Generated by AI from the evidence below" label and a link to the raw evidence |
| Feedback | Thumbs up/down on every output → `AIRequest.feedbackScore` → per-prompt-version acceptance rate in admin |

**Repair attempt.** On a schema-validation failure only (not a grounding or terminology failure), we retry once with the validation error appended:

```
Your previous response failed validation: {{zodError}}
Return corrected JSON matching the schema exactly. Do not add commentary.
```

Grounding and terminology failures are **not** repaired — a model that invented a reference or asserted a legal conclusion is not to be coaxed; the call fails and the deterministic content is shown.

## 8.9 AI Cost Control

| Lever | Implementation | Expected saving |
|---|---|---|
| **Compact context** | Typed context builders; hard token budget of 1,500 input tokens per call, enforced by truncating the evidence array (highest-confidence retained) | 100×+ vs. raw evidence |
| **Response caching** | `AIRequest.inputHash = sha256(feature + promptVersion + canonicalJson(context))`. A hit within 7 days returns the stored output with `fromCache: true`, at zero provider cost | High — the same issue is explained repeatedly by different team members |
| **Deduplication** | Concurrent identical requests coalesce on a Redis lock keyed by `inputHash`; the second waiter receives the first's result | Prevents thundering herd on a busy issue |
| **Model tiering** | Standard model for the ~90% high-volume path; advanced only for root-cause and classification | ~10× on the common path |
| **Batching** | `CLASSIFY_TRACKER` batches up to 20 unknown domains per call | ~15× on that feature |
| **Token caps** | `maxOutputTokens` per feature (explanation 400, fix 600, client message 800, drift 500) | Bounds worst case |
| **Per-agency credit caps** | Monthly `AI_CREDITS` entitlement, decremented per call, checked *before* the provider call. At 80% we notify; at 100% AI features show an upgrade prompt | Hard ceiling per tenant |
| **Platform budget** | A global daily spend cap in Redis. Exceeding it disables non-critical AI platform-wide and pages the operator — this is the backstop against a runaway loop | Absolute ceiling |
| **On-demand by default** | Only Critical issues auto-explain, and only if the agency opted in | Avoids paying to explain issues no one opens |
| **Retry limit** | 2 attempts, and repair only for schema failures | Bounds failure cost |

**Credit accounting.** 1 credit = 1 successful standard-tier call; advanced-tier calls cost 3 credits. Cached responses cost 0. Failed calls cost 0 (we do not charge the customer for our failure, though the provider cost is still logged for our own margin tracking).

## 8.10 Future: Copilot and Natural-Language Search

**Privacy Copilot (V2).** A scoped assistant on the website detail page — "Ask about this website…" answering questions like *"Why did the score drop?"*, *"What changed this week?"*, *"Why is Meta being detected?"*, *"How do I fix this?"*, *"Write a client email."*

Architecture: **a tool-calling agent over a fixed, tenant-scoped tool set** — never free-form data access.

```ts
const COPILOT_TOOLS = [
  { name: 'get_score_breakdown',   args: { websiteId, scanId? } },
  { name: 'get_recent_drift',      args: { websiteId, days: 1..90 } },
  { name: 'get_open_issues',       args: { websiteId, severity? } },
  { name: 'get_tracker_detections',args: { websiteId, vendorSlug? } },
  { name: 'get_consent_results',   args: { websiteId, scanId? } },
  { name: 'get_scan_history',      args: { websiteId, limit: 1..20 } },
];
```

Each tool is a typed function that internally calls `forAgency(ctx.agencyId)` and additionally asserts the `websiteId` belongs to that agency. **The `agencyId` comes from the session, never from the model** — the model cannot even express a cross-tenant request because `agencyId` is not a tool parameter.

**Natural-language search (V2).** *"Show sites where Meta Pixel was added this month."*

**The LLM never generates SQL.** It generates a **structured query object** validated against a Zod schema:

```ts
const nlQuerySchema = z.object({
  entity: z.enum(['websites','issues','drift_events','trackers']),
  filters: z.object({
    vendorSlug: z.string().optional(),
    changeType: z.nativeEnum(DriftChangeType).optional(),
    severity: z.array(z.nativeEnum(Severity)).optional(),
    status: z.array(z.nativeEnum(IssueStatus)).optional(),
    clientId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  }),
  sort: z.enum(['recent','severity','score']).default('recent'),
  limit: z.number().int().min(1).max(100).default(25),
});
```

That object is executed by a hand-written query builder that always injects `agencyId`. The model translates language to a constrained shape; our code does the data access. A malformed or malicious "query" fails Zod validation and never reaches the database.

## 8.11 AI Feature Inventory

| AI Feature | User pain | Input evidence | Output | Model tier | Cost level | MVP? | Risk | Fallback |
|---|---|---|---|---|---|---|---|---|
| Issue explanation | AM can't read raw findings | Issue + ≤8 evidence refs + site context | `IssueExplanation` | Standard | Low (~$0.0004) | ✅ | Hallucinated cause → mitigated by grounding + `is_hypothesis` | Deterministic rule message shown alone |
| Fix recommendation | Dev wants the shortest path | Same + CMS/CMP | `FixRecommendation` | Standard | Low (~$0.0006) | ✅ | Wrong steps for an unusual stack | Rule's static `recommendedAction` |
| Drift summary | "What changed this week?" | ≤20 drift events | `DriftSummary` | Standard | Low (~$0.0008) | ✅ | Overstating significance | Structured event list |
| Client message | 30 min → 2 min per email | 1–5 issues + tone | `ClientMessage` | Standard | Low (~$0.0010) | ✅ | Inappropriate reassurance or alarm; reaches a third party | No draft; AM writes manually |
| Client summary (in reports) | Client-readable report intro | Scan + issues rollup | `ClientSummary` | Standard | Low | ✅ | Same as above | Static templated paragraph |
| Tracker classification | Long tail of unknown vendors | Domain, request paths, cookies, cross-tenant frequency | `TrackerClassification` | Advanced | Medium (batched) | ❌ V1.5 | Wrong category would mis-score sites | Stays `UNKNOWN`; **always admin-approved** |
| Root-cause analysis | "Why did this happen?" | Issue + drift + co-occurring changes | `RootCauseAnalysis` | Advanced | Medium | ❌ V1.5 | Speculation presented as fact | Explanation only |
| Developer task | Ticket-ready text | Issue + evidence + fix | `DeveloperTask` | Standard | Low | ❌ V1.5 | Low | Copyable template |
| Website summary | Quick status read | Score, issues, drift, consent | `WebsiteSummary` | Standard | Low | ❌ V1.5 | Low | Dashboard widgets |
| Privacy Copilot | Conversational analysis | Tool-call results only | Chat turns | Advanced | Medium–High | ❌ V2 | Scope escape → mitigated by session-derived `agencyId` | Feature disabled |
| NL search | Portfolio querying | The question only | Validated query object | Standard | Low | ❌ V2 | Query injection → mitigated by schema-constrained output | Manual filters |

---

# Part IX — Commercial Architecture

## 9.1 Stripe Integration

**Stripe is the source of truth for billing state.** Our `Subscription` table is a projection of Stripe, updated exclusively by webhooks. We never infer subscription status from a successful API call or from the checkout redirect — only from a webhook.

### Objects

| Stripe object | Our mapping |
|---|---|
| Customer | `Subscription.stripeCustomerId`, one per `Agency`, created at agency creation (before any payment) |
| Product | One per plan: Starter, Growth, Agency, Scale |
| Price | Two per product (monthly, annual) × three currencies (USD, GBP, EUR) = 24 prices. `Plan.stripePriceMonthlyId`/`AnnualId` store the USD ones; the localized IDs live in a `currencyPrices` JSON map |
| Subscription | `Subscription.stripeSubscriptionId`, one per agency |
| Checkout Session | Created for new subscriptions and upgrades |
| Billing Portal Session | Used for payment method, downgrades, cancellation, invoice history |

### Flows

**New subscription / upgrade** — `POST /api/billing/checkout` creates a Checkout Session in `subscription` mode with `client_reference_id: agencyId`, `customer: stripeCustomerId`, the selected price, `subscription_data.trial_period_days` when eligible, `allow_promotion_codes: true`, and tax collection enabled. The user completes payment on Stripe; the redirect back to `/app/billing?checkout=success` shows a "confirming your subscription" state that **polls our own API** until the webhook has updated `Subscription.status` — the redirect itself grants nothing.

**Downgrade / cancel / payment method** — handled entirely in the Stripe Billing Portal (`POST /api/billing/portal`). We do not rebuild those flows. Downgrades apply at period end; if the new plan's limits are below current usage, we surface a warning before sending the user to the portal and, on the actual downgrade, put the agency into a grace state (§9.3).

**Trial** — 14 days, no card required. `Subscription.status = TRIALING` with `trialEndsAt`. Reminder emails at day 11 and day 13. On expiry without a payment method, the agency moves to `PAST_DUE`-equivalent read-only mode: existing data is fully visible, scheduled scans stop, manual scans are blocked.

### Webhooks

`POST /api/webhooks/stripe`. Order of operations is fixed and non-negotiable:

```ts
export async function POST(req: NextRequest) {
  const body = await req.text();                        // raw body, before any parsing
  const sig  = (await headers()).get('stripe-signature');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // Idempotency: unique constraint on stripeEventId
  const existing = await prisma.stripeWebhookEvent.findUnique({ where: { stripeEventId: event.id } });
  if (existing?.status === 'processed') return new Response('OK', { status: 200 });

  await prisma.stripeWebhookEvent.upsert({
    where:  { stripeEventId: event.id },
    create: { stripeEventId: event.id, type: event.type, status: 'received', payload: event as any },
    update: { attempts: { increment: 1 } },
  });

  try {
    await processStripeEvent(event);
    await markProcessed(event.id);
  } catch (err) {
    await markFailed(event.id, err);
    return new Response('Processing failed', { status: 500 });  // Stripe retries
  }
  return new Response('OK', { status: 200 });
}
```

| Event | Action |
|---|---|
| `checkout.session.completed` | Link subscription to agency; set plan; set status |
| `customer.subscription.created` / `.updated` | Sync status, plan, interval, period dates, `cancelAtPeriodEnd`; bust the entitlement cache |
| `customer.subscription.deleted` | Status `CANCELED`; downgrade entitlements at period end; email |
| `customer.subscription.trial_will_end` | Trial-ending email (day 11) |
| `invoice.paid` | Confirm `ACTIVE`; clear any past-due banner; reset the usage period |
| `invoice.payment_failed` | Status `PAST_DUE`; email with a portal link; in-app banner |
| `invoice.payment_action_required` | Email requesting SCA completion |
| `customer.updated` | Sync billing email |

**Unknown event types** are recorded with `status: 'ignored'` and return 200 — never a 500, which would cause Stripe to retry indefinitely.

**Reconciliation.** A daily `maintenance` job fetches all active Stripe subscriptions and compares them to our table, logging and correcting any divergence. This catches missed webhooks — the one failure mode that silently corrupts billing state.

## 9.2 Entitlements

**One service. No plan logic anywhere else.**

```ts
// packages/billing/src/entitlements.ts
export interface EntitlementSet {
  maxWebsites: number;              // -1 = unlimited
  maxTeamMembers: number;
  maxClients: number;
  scanFrequencies: ScanFrequency[]; // which cadences are selectable
  maxScansPerMonth: number;
  maxPagesPerScan: number;
  maxConcurrentScans: number;
  scanPriority: ScanPriority;
  aiCreditsPerMonth: number;
  aiAdvancedTier: boolean;
  whiteLabel: boolean;
  clientPortal: boolean;
  maxPortalUsers: number;
  reportTypes: ReportType[];
  maxReportsPerMonth: number;
  evidenceRetentionDays: number;
  scanHistoryRetentionDays: number;
  slackIntegration: boolean;        // V1.1
  webhooks: boolean;                // V1.1
  apiAccess: boolean;               // V1.5
  prioritySupport: boolean;
}

export class EntitlementService {
  async get(agencyId: string): Promise<EntitlementSet>;                       // cached 5 min
  async check(agencyId: string, key: keyof EntitlementSet): Promise<boolean>;
  async checkLimit(agencyId: string, metric: UsageMetric): Promise<LimitCheck>;
  async consume(agencyId: string, metric: UsageMetric, qty: number): Promise<boolean>;
  async usage(agencyId: string): Promise<UsageSummary>;
}
```

Resolution order: **plan defaults → subscription overrides (admin-granted) → status modifiers**. A `PAST_DUE` or expired-trial agency gets a `READ_ONLY` modifier that zeroes `maxScansPerMonth` and `aiCreditsPerMonth` while leaving all limits that govern *viewing* untouched — customers never lose access to their historical data over a billing problem.

**Enforcement points** (each calls the service, none reimplements it):

| Action | Check | Failure |
|---|---|---|
| Add website | `checkLimit(WEBSITES)` | 402 + upgrade prompt naming the limit |
| Scheduled scan | `consume(SCANS, 1)` in the scheduler | Scan skipped, site flagged `quota_exceeded`, one notification per period |
| Manual scan | `consume(SCANS, 1)` | 402 |
| Select daily frequency | `scanFrequencies.includes('DAILY')` | Option disabled with a plan tooltip |
| Invite member | `checkLimit(SEATS)` | 402 |
| AI call | `consume(AI_CREDITS, cost)` | 402, feature shows quota state |
| Generate report | `checkLimit(REPORTS)` + `reportTypes.includes(type)` | 402 / type unavailable |
| Enable white-label | `check('whiteLabel')` | Settings section shown locked |
| Enable client portal | `check('clientPortal')` + `maxPortalUsers` | Locked |

**Usage period** aligns to the Stripe billing period (`currentPeriodStart`), not the calendar month, so a mid-month upgrade behaves intuitively. Usage counters are `UsageRecord` rows upserted with an atomic `increment`, keyed `(agencyId, periodStart, metric)` — the unique constraint makes double-counting impossible under concurrency.

**Grace on downgrade.** If a downgrade puts an agency over a limit (e.g. 40 websites on a 25-site plan), we do **not** delete anything. The agency enters a 14-day grace period: existing sites keep being monitored, no new sites can be added, and a banner asks them to archive down or upgrade. After grace, the oldest-by-`createdAt` excess sites are auto-paused (never deleted), with an email listing exactly which ones and how to restore them.

## 9.3 Pricing

Billing in **USD**, with GBP and EUR display prices and localized Stripe Prices at checkout.

| | **Starter** | **Growth** | **Agency** | **Scale** |
|---|---|---|---|---|
| **Monthly** | $49 | $149 | $349 | $799 |
| **Annual** (2 mo free) | $490 | $1,490 | $3,490 | $7,990 |
| GBP / EUR display | £39 / €45 | £119 / €139 | £279 / €325 | £639 / €745 |
| **Websites** | 10 | 40 | 120 | 400 |
| **Scan frequency** | Weekly, Monthly | + Daily | + Daily | + Daily |
| **Scans / month** | 60 | 400 | 1,500 | 6,000 |
| **Pages per scan** | 1 | 3 | 5 | 10 |
| **Concurrent scans** | 1 | 2 | 4 | 8 |
| **Team members** | 2 | 6 | 15 | Unlimited |
| **Clients** | 10 | 40 | 120 | Unlimited |
| **AI credits / month** | 50 | 300 | 1,000 | 4,000 |
| **Advanced AI tier** | — | — | ✓ | ✓ |
| **White-label reports** | — | ✓ | ✓ | ✓ |
| **Client portal** | — | 10 users | 50 users | Unlimited |
| **Report types** | Scan, Website Health | All | All | All |
| **Reports / month** | 10 | 50 | 200 | Unlimited |
| **Evidence retention** | 30 days | 90 days | 180 days | 365 days |
| **Scan history** | 12 months | 24 months | 36 months | 36 months |
| **Slack / webhooks** (V1.1) | — | — | ✓ | ✓ |
| **API** (V1.5) | — | — | ✓ | ✓ |
| **Support** | Email | Email | Priority | Priority + onboarding |
| **Trial** | 14 days, no card | 14 days | 14 days | Contact sales |

**Rationale for this structure**

- **Website count is the primary axis** because it is the metric an agency already thinks in and it correlates directly with our cost. Scans/month is a secondary guard against someone putting 10 sites on daily scans plus constant manual re-scans.
- **Daily scanning starts at Growth** because it is a 7× cost multiplier over weekly and is the single most compelling upgrade trigger. Starter customers who need daily on even one site convert.
- **White-label starts at Growth** because it is the feature that turns the product into a resellable service, which is precisely when the agency's willingness to pay steps up. Gating it at Starter would block the trial-to-value path; gating it above Growth would block the main revenue motion.
- **$149 Growth is the target plan.** **ASSUMPTION:** an agency with 40 client sites on care plans can add $10–25/site/month for privacy monitoring, giving them $400–1,000/month of revenue against a $149 cost. That 3–7× resale margin is the actual sales argument, and it is why per-site pricing at our end would be a mistake — it would compress their margin and make the arithmetic visible.
- **Scale at $799** exists mostly to anchor Agency and to serve the genuine 200+ site agencies without a custom contract.
- **Annual at 2 months free** (~17%) is standard and materially improves cash position and churn.

## 9.4 Unit Economics

All figures are **ESTIMATES** and must be re-derived against real provider invoices before launch pricing is finalized.

### Cost per scan

**ASSUMPTION:** average scan = 4 consent phases × ~45 s = ~180 s of a worker slot; worker instance = 2 vCPU / 4 GB at ~$0.09/hour running 2 concurrent scans.

| Component | Estimate | Basis |
|---|---|---|
| Compute | **$0.0023** | (180 s ÷ 3600) × $0.09 ÷ 2 concurrent |
| Bandwidth | $0.0005 | ~4 × 3 MB per scan with media aborted; egress mostly free inbound |
| Database write | $0.0004 | ~1,500 evidence rows amortized against instance cost |
| Screenshots (S3) | $0.0003 | ~4 × 250 KB, storage + PUT, amortized over retention |
| Queue/Redis | $0.0001 | Negligible per job |
| **Total per scan** | **≈ $0.0036** | |

### Cost per website per month

| Frequency | Scans/mo | Scan cost | Storage (evidence + screenshots, retention-amortized) | **Total** |
|---|---|---|---|---|
| Monthly | 1 | $0.004 | $0.010 | **~$0.014** |
| Weekly | 4.3 | $0.016 | $0.035 | **~$0.051** |
| Daily | 30 | $0.108 | $0.220 | **~$0.328** |

### Other unit costs

| Item | Estimate | Basis |
|---|---|---|
| AI standard call | $0.0004 | ~400 in / 250 out tokens at small-model pricing |
| AI advanced call | $0.006 | ~1,500 in / 700 out at large-model pricing |
| Cached AI call | $0.000 | Served from Postgres |
| PDF report | $0.002 | ~15 s of a report worker + S3 storage |
| Email | $0.0004 | **ASSUMPTION:** ~$0.40 per 1,000 at Resend volume tiers |
| Storage GB-month | $0.021 | S3-compatible standard tier |
| Clerk MAU | $0.02 avg | Only agency staff; portal users are ours, not Clerk's — a deliberate cost decision |

### Plan margin analysis (monthly, per customer)

**ASSUMPTION:** typical usage is 70% of plan limits; scan mix is 20% daily / 60% weekly / 20% monthly.

| | Starter $49 | Growth $149 | Agency $349 | Scale $799 |
|---|---|---|---|---|
| Websites (typical) | 7 | 28 | 84 | 280 |
| Scan cost | $0.55 | $3.10 | $9.30 | $31.00 |
| Storage cost | $0.60 | $3.40 | $12.60 | $52.00 |
| AI cost (typical use) | $0.02 | $0.14 | $0.90 | $3.60 |
| Reports | $0.01 | $0.06 | $0.24 | $0.80 |
| Email | $0.05 | $0.18 | $0.45 | $1.20 |
| Clerk | $0.04 | $0.12 | $0.30 | $0.60 |
| Stripe fees (2.9% + $0.30) | $1.72 | $4.62 | $10.42 | $23.47 |
| Allocated fixed infra | $1.50 | $2.50 | $4.00 | $8.00 |
| **Total COGS** | **$4.49** | **$14.12** | **$38.21** | **$120.67** |
| **Gross margin** | **$44.51 (91%)** | **$134.88 (91%)** | **$310.79 (89%)** | **$678.33 (85%)** |

**Read of these numbers:** margins are healthy across the board and remain healthy under pessimistic assumptions (double every variable cost and Growth still returns 79%). The margin compresses at Scale because daily scanning and 365-day retention are genuinely expensive — which is correct, and is why Scale is priced with a smaller per-site allowance rather than being sold as unlimited.

**Fixed monthly infrastructure at ~100 customers (ESTIMATE):** web containers $40 · scanner workers $180 · other workers $40 · managed Postgres $90 · managed Redis $25 · object storage $30 · monitoring/error tracking $50 · domains/misc $15 = **~$470/month**, against roughly $12,000 MRR at that customer count.

## 9.5 Email System (Resend)

React Email templates in `packages/email/src/templates/`, rendered server-side, sent through the `email` queue so a Resend outage never blocks a request.

| Template | Trigger | Recipient | Notes |
|---|---|---|---|
| `welcome` | Agency created | Owner | Onboarding next steps |
| `invitation` | Team invite sent | Invitee | Token link, 7-day expiry |
| `portal-invitation` | Portal user invited | Client contact | **Agency-branded** |
| `portal-magic-link` | Portal login requested | Client contact | **Agency-branded**, 15-min link |
| `scan-completed` | First scan of a new website only | Requester | Deliberately not every scan |
| `critical-issue` | Critical issue created | Per alert rules | Issue summary + deep link |
| `consent-regression` | Consent regression detected | Per alert rules | Highest-priority alert |
| `daily-digest` | 08:00 agency time | Opted-in members | Grouped by website |
| `weekly-summary` | Monday 08:00 agency time | Opted-in members | Portfolio health + drift |
| `website-unreachable` | 3 consecutive failures | Per alert rules | |
| `report-ready` | Report generation completed | Requester | Signed download link |
| `client-report-delivery` | Monthly report sent to client | Client contact | **Agency-branded**, PDF attached |
| `trial-ending` | Day 11 and day 13 | Owner | |
| `payment-failed` | `invoice.payment_failed` | Owner | Portal link |
| `subscription-changed` | Plan up/downgrade | Owner | New limits summarized |
| `usage-warning` | 80% of any limit | Owner + Admins | |
| `ai-quota-warning` | 80% of AI credits | Admins | |
| `support-received` | Support form submitted | Sender | Confirmation |

**Mechanics:** every send carries an `idempotencyKey` checked against `AlertHistory` before dispatch. Resend webhooks (`email.delivered`, `.bounced`, `.complained`, `.opened`) update `AlertHistory`; a hard bounce marks the address undeliverable and surfaces it in team settings. All transactional emails include an unsubscribe link for digest/summary categories (never for security or billing mail). Templates are localization-ready: copy lives in `packages/email/src/copy/en.ts` separate from layout, so adding a locale is a copy file, not a template rewrite.

## 9.6 Analytics

Events go to a product analytics tool (PostHog self-hosted or Vercel Analytics — **ASSUMPTION:** PostHog, self-hosted alongside the app for data-residency reasons) via a thin wrapper in `packages/shared/src/analytics.ts` so the vendor is swappable.

| Event | Properties |
|---|---|
| `page_viewed` | path, referrer, utm_* |
| `signup_started` / `signup_completed` | method, invited, free_scan_token? |
| `agency_created` | agency_type, expected_site_count |
| `onboarding_step_completed` | step, elapsed_ms |
| `onboarding_completed` | total_elapsed_ms, websites_added |
| `website_added` | source (manual/csv/free_scan/onboarding), scan_frequency |
| `website_import_completed` | count, failed_count |
| `scan_started` | trigger, priority |
| `scan_completed` | status, duration_ms, issues_found, score, score_delta |
| `scan_failed` | error_code |
| `issue_created` | rule_id, severity, category |
| `issue_viewed` | rule_id, severity, from (dashboard/list/alert) |
| `issue_status_changed` | from, to, resolution? |
| `issue_ignored` | rule_id, scope |
| `drift_event_viewed` | change_type, severity |
| `report_generated` | type, scope |
| `report_downloaded` | type, by (user/portal_user/share_link) |
| `ai_explanation_requested` | rule_id, from_cache |
| `ai_fix_requested` | rule_id, from_cache |
| `ai_output_rated` | feature, score |
| `client_portal_enabled` | client_id |
| `portal_user_logged_in` | — |
| `branding_configured` | has_logo, has_colors |
| `alert_rule_created` | trigger_types, digest |
| `subscription_started` | plan, interval, from_trial |
| `subscription_upgraded` / `downgraded` | from_plan, to_plan |
| `subscription_canceled` | plan, tenure_days, reason? |
| `entitlement_limit_hit` | metric, plan |
| `free_scan_submitted` / `_completed` / `_result_viewed` | domain_hash, score |
| `free_scan_signup_clicked` | — |
| `integration_interest_registered` | integration |

**Privacy discipline for our own analytics:** we never send scanned website URLs, client names, cookie values, or evidence content. Domains are hashed where they appear. Our own product must meet the standard we sell.

## 9.7 Product Metrics

**Activation** — the north star for the first 90 days.
- **Primary:** % of signups reaching *first completed scan with a result viewed* within 24 hours. **Target: 60%.**
- Funnel: `signup_completed` → `agency_created` → `website_added` → `scan_completed` → `scan result viewed`.
- **Time-to-value:** median minutes from `signup_completed` to first `scan_completed`. **Target: < 8 minutes** (dominated by scan duration, so it is genuinely achievable).

**Engagement**
- Weekly active agencies (≥ 1 session with a meaningful action).
- Websites monitored per agency (leading indicator of expansion revenue).
- Scans per agency per week.
- Issue review rate: % of created issues that get viewed. **Below 40% means we are creating noise.**
- Issue action rate: % of viewed issues that reach Acknowledged or beyond.
- Reports generated per agency per month. **Target: ≥ 1 per client** — this is the habit that makes the product sticky.
- Alert click-through rate.

**Retention**
- Logo retention by monthly cohort.
- Net revenue retention (target > 100% via site-count expansion).
- Website retention: % of added websites still actively monitored at 90 days.
- **Feature-cohort retention:** agencies that generated ≥ 1 white-label report in month 1 vs. those that didn't. **ASSUMPTION:** this will be the strongest retention predictor, and if it holds, onboarding should push report generation hard.

**Revenue** — MRR, ARR, ARPU, expansion MRR, contraction MRR, gross/net churn, trial→paid conversion (**target 25%**), free-scan→signup conversion (**target 8%**).

**Product quality — the metrics that protect trust**
- Scan success rate (`COMPLETED` ÷ all). **Target > 95%.**
- Partial scan rate. **Target < 8%.**
- Consent adapter success rate per CMP. **Target > 90% per supported CMP.**
- **False-positive rate** = `IssueFeedback(false_positive)` ÷ issues resolved. **Target < 5%.** Tracked per rule; any rule above 15% is reviewed for retirement or retuning.
- Median and p95 scan duration. **Targets: 150 s / 400 s.**
- AI validation failure rate. **Target < 2%.**
- AI acceptance rate (thumbs-up ÷ rated). **Target > 75%.**
- Alert precision: % of alerts leading to a viewed issue within 48 h. **Target > 60%.**
- Unknown-vendor rate: % of third-party domains unmatched by the vendor DB. **Target < 15%, trending down** — this is the direct measure of whether the tracker-intelligence moat is compounding.

---

# Part X — Platform & Operations

## 10.1 Security Overview

| Threat | Control |
|---|---|
| Transport interception | HTTPS enforced end to end; HSTS `max-age=63072000; includeSubDomains; preload`; TLS terminated at the platform edge; internal service traffic over the provider's private network |
| Session theft | Clerk-managed sessions; portal cookies `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax`, path-scoped |
| CSRF | Server Actions carry Next 16's built-in Origin/Host check plus `serverActions.allowedOrigins`; portal mutations verify `Origin`; webhooks use signatures, not cookies |
| XSS | React escaping by default; `dangerouslySetInnerHTML` banned by lint except in the MDX renderer over our own content; strict CSP (below); all scanned-site strings (domains, cookie names) rendered as text, never as markup |
| SQL injection | Prisma parameterized queries only; `$queryRaw` requires a lint exemption and template-tag interpolation |
| SSRF | §10.3 — the primary attack surface |
| Open redirect | Redirect targets validated against an allowlist of our own paths; no user-supplied absolute URLs in redirects |
| Webhook forgery | Stripe signature, Svix signature for Clerk and Resend, verified on the raw body before parsing |
| Secret exposure | Secrets in the platform's secret store, injected as env vars; never in the repo; `NEXT_PUBLIC_*` reserved for genuinely public values; a CI secret-scan (gitleaks) blocks merges |
| Tenant escape | Part V §5.5 — schema, Prisma extension, lint, and a dedicated cross-tenant test suite |
| File access | S3 objects are private; access only via short-lived signed URLs issued after an `agencyId` prefix check |
| Dependency vulnerabilities | `pnpm audit` + Dependabot; a CI gate on high/critical; monthly manual review of transitive scanner deps |
| Container compromise | Non-root user, read-only root filesystem where possible, dropped capabilities, minimal base images |
| Browser escape | Chromium sandbox **kept enabled** (§10.4) |
| Brute force | Clerk handles auth rate limiting; portal magic links rate-limited per email and IP |
| Enumeration | 404 (not 403) for cross-tenant resources; portal auth always returns 204 |

**Content Security Policy** (set in `proxy.ts` with a per-request nonce):

```
default-src 'self';
script-src 'self' 'nonce-{RANDOM}' https://*.clerk.accounts.dev https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.s3.amazonaws.com https://img.clerk.com;
font-src 'self' data:;
connect-src 'self' https://*.clerk.accounts.dev https://api.stripe.com wss://*.clerk.accounts.dev;
frame-src https://js.stripe.com https://challenges.cloudflare.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self' https://checkout.stripe.com;
object-src 'none';
upgrade-insecure-requests;
```

Plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.

## 10.2 Audit Logging

Written inside the same transaction as the action, so an audited action cannot succeed without its log entry.

**Audited actions:** website created / updated / archived / deleted · scan started manually · scan cancelled · issue status changed · issue ignored · ignore rule created/removed · drift change accepted · client created / archived · portal access enabled/disabled · portal user invited / revoked · portal user login · report generated / downloaded / shared / deleted · evidence exported · branding changed · scan settings changed · AI settings changed · team member invited / role changed / removed · agency settings changed · billing plan changed · subscription cancelled · API key created/revoked (V1.5) · **every admin action, including reads of tenant data and every impersonation session**.

Each entry stores actor (user/system/admin/portal_user), action, entity type and ID, before/after JSON for updates, hashed IP, user agent, and a timestamp. Agency Admins see their own agency's log at `/app/settings/security` with CSV export. Retention: 24 months.

**Impersonation** is a distinct, heavily-controlled path: a super admin must supply a reason, the session is time-boxed to 60 minutes, a persistent banner is shown in the impersonated UI, every request during the session is tagged `impersonatedBy`, and the agency's own audit log shows the session — the customer can always see when we looked at their data.

## 10.3 SSRF Protection — Mandatory

We accept arbitrary URLs from users and drive a browser at them from inside our infrastructure. This is the single highest-severity risk in the system.

```mermaid
flowchart TD
  A[URL submitted] --> B[Parse; reject non-http/https]
  B --> C[Reject credentials in URL, non-standard ports]
  C --> D[Reject hostnames: localhost, *.local, *.internal, metadata hosts]
  D --> E[DNS resolve A + AAAA]
  E --> F{Any resolved IP in a blocked range?}
  F -->|Yes| G[BLOCK · log security event · vague user message]
  F -->|No| H[Pin the resolved IP]
  H --> I[Connect to the pinned IP with the original Host header]
  I --> J{Redirect?}
  J -->|Yes, hop <= 3| K[Re-run the ENTIRE guard on the new URL]
  K --> J
  J -->|Yes, hop > 3| G
  J -->|No| L[ALLOW]
```

**Blocked ranges — IPv4:** `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (CGNAT), `127.0.0.0/8`, `169.254.0.0/16` (link-local, **including `169.254.169.254`**), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255/32`.

**Blocked ranges — IPv6:** `::/128`, `::1/128`, `::ffff:0:0/96` (**IPv4-mapped — a classic bypass**), `64:ff9b::/96` (NAT64), `100::/64`, `fc00::/7` (ULA), `fe80::/10` (link-local), `ff00::/8` (multicast), and `fd00:ec2::254` (the IPv6 metadata address).

**Blocked hostnames:** `localhost`, anything ending `.local`, `.internal`, `.localdomain`, `.home.arpa`, plus explicit cloud metadata hosts (`metadata.google.internal`, `metadata.goog`, `169.254.169.254`).

**Additional controls**

| Control | Implementation |
|---|---|
| **DNS rebinding** | The guard resolves the hostname, validates the IP, and then **connects to that pinned IP** rather than re-resolving. Playwright is configured with `--host-resolver-rules="MAP <host> <pinned-ip>"` for the scan, so the browser cannot be redirected to a different address between check and connect |
| **Redirect revalidation** | Every hop re-enters the full guard. Max 3 hops (`SCAN_MAX_REDIRECTS`) |
| **Scheme** | Only `http` and `https`. `file:`, `ftp:`, `gopher:`, `data:`, `blob:`, `javascript:` all rejected |
| **Ports** | Only 80, 443, and 8080/8443 (allowed because staging sites legitimately use them). Everything else rejected |
| **Credentials in URL** | `http://user:pass@host` rejected outright |
| **Egress firewall** | The scanner workers run in a network segment whose egress rules **deny all RFC1918, link-local, and the metadata address at the infrastructure level**. This is the control that holds even if the application guard has a bug — defense in depth is not optional here |
| **No cloud metadata credentials** | Scanner workers use no instance-profile credentials. S3 access uses a scoped static key with write-only permission to the evidence prefix, so a hypothetical metadata leak yields nothing useful |
| **Response size** | `SCAN_MAX_RESPONSE_BYTES` (default 50 MB per resource); exceeded responses are aborted |
| **User feedback** | Blocked URLs return a deliberately vague message ("We can't monitor this address") — a specific message would turn the product into an internal-network scanner |
| **Logging** | Every block writes a `SystemLog` security event with the agency, user, and URL. Three blocks from one agency in an hour raises an admin alert |

**Test vectors** (unit-tested in `packages/scanner/src/net/__tests__/guard.test.ts`, every one asserted blocked): `http://127.0.0.1`, `http://127.1`, `http://0177.0.0.1` (octal), `http://2130706433` (decimal), `http://[::1]`, `http://[::ffff:127.0.0.1]`, `http://localhost`, `http://169.254.169.254/latest/meta-data/`, `http://metadata.google.internal`, `http://10.0.0.1`, `http://192.168.1.1`, `http://172.16.0.1`, `http://100.64.0.1`, `http://[fd00::1]`, `http://[fe80::1]`, `file:///etc/passwd`, `http://user:pass@evil.com`, `http://evil.com:22`, a DNS name resolving to `127.0.0.1`, and a public URL 302-redirecting to `169.254.169.254`.

## 10.4 Scanner Abuse Protection

| Control | Authenticated | Anonymous (free scanner) |
|---|---|---|
| Auth required | Yes | No, but Turnstile required |
| Scans/month | Plan entitlement | 3/hour, 10/day per IP |
| Per-domain | Unlimited (own sites) | 1 per 24 h globally per registrable domain |
| Concurrency | Plan (1–8) | 1 per IP; capped queue concurrency overall |
| Timeout | 10 min | 60 s |
| Consent phases | 4 | 1 |
| Pages | Plan (1–10) | 1 |
| Max redirects | 3 | 3 |
| Max response size | 50 MB/resource | 10 MB/resource |
| CPU/memory | Container limits: 2 vCPU / 4 GB per worker; `--max-old-space-size=512` per browser | Same |
| Blocklist | Admin domain blocklist applies | Applies |

**Ownership verification.** We deliberately do **not** require domain-ownership proof to monitor a site, because agencies routinely monitor sites they manage but don't own DNS for, and requiring verification would break the core workflow. Instead: the Terms explicitly prohibit scanning sites you don't control or have permission to scan; our scanner is identifiable by user agent with a `/bot` page explaining opt-out; `robots.txt` is respected by default; we publish our egress IPs for allowlisting; and we honor written exclusion requests from site owners within one business day. **ASSUMPTION:** this posture is proportionate for a low-volume, identifiable, opt-out-honoring scanner. Revisit if abuse reports appear.

**Abuse detection.** A `maintenance` job flags: agencies scanning many unrelated registrable domains in a short window; repeated SSRF blocks; high failure rates suggesting the target is not a real website; and unusual scan-to-website ratios. Flags surface in `/admin/agencies` for human review. Suspension is manual — automated suspension of a paying customer is worse than a slow response to abuse.

## 10.5 Container Security and Chromium Sandboxing

We execute untrusted third-party JavaScript from arbitrary websites. Therefore:

- **The Chromium sandbox stays enabled.** `--no-sandbox` is banned. The container is granted `SYS_ADMIN` via a targeted seccomp profile (Playwright ships a reference profile) rather than running privileged, so user-namespace sandboxing works.
- Containers run as a **non-root user** (`pwuser`, UID 1000).
- Root filesystem is read-only except `/tmp` and `/dev/shm`; `/dev/shm` is sized to 1 GB (Chromium crashes on the default 64 MB).
- All capabilities dropped except those the seccomp profile requires.
- Scanner workers hold **no cloud credentials** beyond a narrowly-scoped S3 write key.
- Scanner workers sit in their own network segment with the egress rules from §10.3.
- Base image: `mcr.microsoft.com/playwright:v1.x-noble` (Microsoft's official image, which carries the correct Chromium system dependencies and is kept patched) — this avoids hand-maintaining the ~60 shared libraries Chromium needs.

## 10.6 Scan Data Privacy and Minimization

We visit our customers' clients' websites. We must not become a liability.

**What we store**

| Data | Stored | Treatment |
|---|---|---|
| Monitored URL | Yes | Necessary |
| Request URLs | Yes, **sanitized** | Query strings **removed entirely** except an allowlist of tracking-identifying params (`utm_*`, `id`, `t`, `ev`) whose *presence* is recorded but whose values are hashed |
| Request/response headers | **Names only** for a small diagnostic set; no values | `Authorization`, `Cookie`, `Set-Cookie` values never stored |
| Response bodies | **Never** | Not stored under any circumstance |
| Cookie names/attributes | Yes | Necessary evidence |
| Cookie values | **Hash + length only**, except allowlisted consent-signal cookies | The single largest PII risk in a scanner |
| localStorage/sessionStorage | **Keys + length + hash only** | Values frequently contain tokens and PII |
| IndexedDB | Database and store **names only** | |
| Form contents | **Never** — we never submit forms and never read input values | |
| Page HTML / text | **Never stored.** Read transiently in-page for banner detection, never persisted | This is also what makes prompt injection structurally impossible (Part VIII §8.8) |
| Screenshots | Yes | Viewport of the homepage/banner. Automatic redaction below |
| Console logs | Yes, truncated to 500 chars | Scanned for token-shaped strings and redacted |

**Screenshot redaction.** Before upload, screenshots pass a redaction step that blanks the bounding boxes of any `input`, `textarea`, or `[contenteditable]` element that had a non-empty value at capture time (coordinates collected in-page; values never leave the page). Screenshots are viewport-only for banner captures, which further limits incidental capture.

**URL sanitization** (`packages/scanner/src/privacy/sanitize.ts`) additionally strips values matching high-risk patterns anywhere in a URL: email addresses, strings ≥ 20 chars of base64/hex (token-shaped), JWT-shaped strings, and any parameter named like `token`, `key`, `secret`, `password`, `auth`, `session`, `sid`, `email`, `phone`.

**Authenticated site scanning.** Basic-auth credentials for staging sites are stored in the platform secret store, referenced by `Website.basicAuthSecretRef` — never in the database, never in a job payload (the worker fetches by reference), never in logs.

**Data subject requests.** Our privacy policy names us as processor for scan data (the agency is controller for their clients' site data). Deletion of an agency purges all its scans, evidence, S3 objects, and AI request records within 30 days; a documented runbook covers the process.

## 10.7 S3 Storage Architecture

**Key layout** — tenant-prefixed by construction:

```
agencies/{agencyId}/websites/{websiteId}/scans/{scanId}/screenshots/{phase}-{kind}.webp
agencies/{agencyId}/websites/{websiteId}/scans/{scanId}/evidence/{evidenceId}.json.gz
agencies/{agencyId}/reports/{reportId}/{slug}.pdf
agencies/{agencyId}/branding/logo-light.{ext}
agencies/{agencyId}/branding/logo-dark.{ext}
public/free-scans/{token}/screenshot.webp        # 7-day lifecycle rule
```

| Concern | Decision |
|---|---|
| Access | Bucket fully private; **no public objects** except the free-scan prefix, which is served through signed URLs too |
| Signed URLs | 15 min for screenshots and evidence; 60 min for report downloads; 7 days max for share links. `getSignedUrl(agencyId, key)` **asserts the key starts with `agencies/{agencyId}/`** before signing and throws otherwise |
| Encryption | SSE-S3 (AES-256) at rest by default; TLS in transit |
| Content type | Set explicitly on upload; `Content-Disposition: attachment` on PDFs |
| Max sizes | Screenshot 5 MB, evidence blob 10 MB, report 50 MB, logo 2 MB — enforced before upload |
| Upload validation | Magic-byte check on logos (PNG/JPEG/SVG/WebP only); SVGs are sanitized (script and event attributes stripped) or rejected |
| Lifecycle | Provider lifecycle rules delete the free-scan prefix after 7 days; retention-based deletion of agency objects is done by our `cleanup` job (it must respect per-plan retention, which lifecycle rules cannot express) |
| Cleanup | On website deletion, report deletion, or agency deletion, a `cleanup` job deletes the corresponding prefix and verifies emptiness |
| Versioning | Enabled on the bucket with a 7-day noncurrent expiry — protects against an accidental mass-delete bug |

## 10.8 Observability

**Structured logging.** Pino, JSON to stdout, collected by the platform. Every line carries `service`, `env`, `requestId` or `jobId`, `agencyId` (when known), `level`, `msg`. A serializer redacts `authorization`, `cookie`, `set-cookie`, `password`, `token`, `apiKey`, `secret` at any depth. Log levels: `error` (needs action), `warn` (degraded but handled), `info` (state transitions), `debug` (dev only).

**Metrics** (Prometheus format at `/metrics` on workers, scraped by the platform):

| Metric | Type | Alert threshold |
|---|---|---|
| `scan_total{status}` | counter | Success rate < 90% over 30 min |
| `scan_duration_seconds` | histogram | p95 > 400 s |
| `scan_phase_undetermined_total{phase,reason}` | counter | Rate > 15% for any phase |
| `consent_adapter_result_total{cmp,result}` | counter | Any CMP success < 80% over 24 h |
| `queue_depth{queue}` | gauge | `scan` > 1,000 for 15 min |
| `queue_wait_seconds{queue}` | histogram | p95 > 600 s |
| `job_failed_total{queue,error}` | counter | > 20/hour |
| `browser_pool_utilization` | gauge | > 0.9 sustained 10 min |
| `browser_crash_total` | counter | > 5/hour |
| `http_request_duration_seconds{route}` | histogram | p95 > 800 ms |
| `db_query_duration_seconds` | histogram | p95 > 200 ms |
| `db_connections_active` | gauge | > 80% of pool |
| `ai_request_total{feature,status}` | counter | Validation failure > 5% |
| `ai_cost_microcents_total{agency}` | counter | Daily platform budget breach |
| `email_delivery_total{status}` | counter | Bounce rate > 5% |
| `storage_operation_total{op,status}` | counter | Error rate > 1% |
| `stripe_webhook_total{type,status}` | counter | Any failure |

**Tracing.** OpenTelemetry via `instrumentation.ts` in the web app and an equivalent bootstrap in workers. Spans across HTTP → service → Prisma → Redis, and scan → phase → adapter action. Trace IDs propagate into job payloads so a scan is traceable from the API call that queued it.

**Error tracking.** Sentry (or equivalent) in web and workers, with `agencyId` and `scanId` as tags and release tracking tied to the git SHA.

**Uptime.** External checks on `/api/health` (liveness, no dependencies) and `/api/health/ready` (checks Postgres, Redis, S3 — used by the platform's readiness probe).

**Dashboards:** Operations (queue depths, scan success, worker health) · Product (activation funnel, scans, issues) · Cost (AI spend, storage growth, compute) · Reliability (error rates, latency, external dependency status).

**Alert routing:** Critical (queue backlog, scan success collapse, database or Redis down, Stripe webhook failures) → immediate page. Warning (elevated failures, slow queries, cost anomaly) → Slack. Info → daily summary.

## 10.9 Repository, Docker, and Local Development

### Monorepo decision

**pnpm workspaces + Turborepo.** Justified concretely:
- `packages/scanner` must be imported by both `apps/worker` (real scans) and `apps/web` (URL validation, free-scan orchestration). Publishing it privately or duplicating it would be worse.
- `packages/database` must export one Prisma client and one set of types to web, worker, and tests. Two copies of a Prisma client is a class of bug we can eliminate structurally.
- `packages/schemas` gives us one Zod definition shared by API validation, job payload validation, and test factories.
- Web and worker need **different Docker images** with different base layers (worker needs Chromium, web must not carry it) but the **same source of truth**. A monorepo is the only clean way to get both.
- Turborepo gives us task caching, so a change to `packages/email` does not rebuild the scanner.

The current `src/app` scaffold moves to `apps/web/src/app`. `tsconfig.json`'s `@/*` → `./src/*` mapping is preserved inside `apps/web`.

### Docker

**`apps/web/Dockerfile`** — multi-stage: `deps` (pnpm fetch + install), `builder` (`pnpm --filter web build`, Next standalone output), `runner` (`node:22-slim`, non-root, copies `.next/standalone`, `.next/static`, `public`). No Chromium. Final image ~180 MB.

**`apps/worker/Dockerfile`** — base `mcr.microsoft.com/playwright:v1.x-noble` (Chromium and its system dependencies pre-installed and patched), non-root `pwuser`, `--shm-size=1g` at run time, seccomp profile applied. Final image ~1.4 GB (unavoidable — it contains a browser).

**`docker-compose.yml` (local development only):**

```yaml
services:
  postgres:  { image: postgres:16-alpine, ports: ["5432:5432"], volumes: [pgdata:/var/lib/postgresql/data] }
  redis:     { image: redis:7-alpine,     ports: ["6379:6379"] }
  minio:     { image: minio/minio,        ports: ["9000:9000","9001:9001"] }   # S3-compatible
  mailpit:   { image: axllent/mailpit,    ports: ["8025:8025","1025:1025"] }   # email capture
  fixtures:  { build: ./packages/scanner/fixtures, ports: ["4000:4000"] }      # scanner test targets
```

**Why local containers differ from production:** in production, Postgres and Redis are **managed services** (automated backups, PITR, failover, patching, monitoring) — operating them ourselves would be a poor use of engineering time and a worse reliability outcome. Object storage is the provider's S3-compatible service, not MinIO. Only `web` and `worker` are containers we build and deploy. The compose file exists so a developer gets a complete environment with one command, and so CI has deterministic dependencies.

### Local setup

```bash
git clone <repo> && cd drift-monitor
pnpm install
cp .env.example .env.local            # then fill in Clerk/Stripe/Resend test keys
docker compose up -d                  # postgres, redis, minio, mailpit, fixtures
pnpm db:migrate                       # prisma migrate dev
pnpm db:seed                          # tracker vendors, plans, feature flags, demo agency
pnpm dev                              # turbo: web (3000) + worker, in parallel
```

`pnpm dev:web`, `pnpm dev:worker`, `pnpm db:studio`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck` are the remaining scripts. `pnpm dev` runs `next dev` — note this regenerates the `AGENTS.md` block (see §0.4) and writes to `.next/dev`, so a concurrent `next build` is blocked by a lockfile.

**Note:** because Turbopack is now the default for `next build`, **no custom `webpack` config may be added** — it would make the build fail. Bundler customization goes through the `turbopack` config key.

### CI/CD (GitHub Actions)

**Pull request pipeline** (`.github/workflows/pr.yml`) — runs on every PR, all jobs required:
1. Install (pnpm cache) → 2. `pnpm lint` (ESLint flat config; note `next lint` no longer exists) → 3. `pnpm typecheck` (runs `next typegen` first so `PageProps`/`RouteContext` globals exist) → 4. `pnpm test` (Vitest, unit + integration against a service-container Postgres and Redis) → 5. `pnpm build` (all packages) → 6. Scanner fixture suite F01–F30 → 7. `gitleaks` secret scan → 8. `pnpm audit --audit-level=high` → 9. Prisma migration check (`migrate diff` must be empty against the committed schema; a `DROP` requires the `migration:destructive` label).

**Main branch pipeline** (`.github/workflows/deploy.yml`):
1. All PR checks → 2. Build and push `web` and `worker` images tagged with the git SHA → 3. **Run `prisma migrate deploy` as a discrete step, before any new container starts** → 4. Deploy `web` (rolling, health-gated on `/api/health/ready`) → 5. Deploy `worker` (rolling, drains in-flight jobs on SIGTERM) → 6. Smoke tests against production (health, signup page renders, a seeded scan completes) → 7. Notify.

**Migration safety:** migrations never run automatically if they contain a destructive statement — the deploy halts and requires a manual approval step in the workflow. Rollback is by redeploying the previous image tag; because migrations are expand/contract, the previous image is always compatible with the new schema.

**E2E pipeline** (nightly + pre-release): Playwright against a staging environment seeded with fixture data.

## 10.10 Environment Variables

`.env.example`, fully specified. **No secret ever carries the `NEXT_PUBLIC_` prefix.**

```bash
# ── App ─────────────────────────────────────────────────────────────
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MARKETING_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Privacy Drift Monitor"
LOG_LEVEL=debug

# Required for multi-container deploys: MUST be identical across all web instances,
# and stable across deploys, or Server Action closures break.
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=

# ── Database ────────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drift_monitor?schema=public
DATABASE_URL_UNPOOLED=                 # direct connection for migrations (bypasses PgBouncer)
DATABASE_POOL_SIZE=10

# ── Redis ───────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
REDIS_TLS=false

# ── Clerk ───────────────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app/onboarding

# ── Stripe ──────────────────────────────────────────────────────────
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PORTAL_CONFIGURATION_ID=

# ── Resend ──────────────────────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
EMAIL_FROM="Privacy Drift Monitor <alerts@example.com>"
EMAIL_REPLY_TO=support@example.com

# ── Object storage (S3-compatible) ──────────────────────────────────
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=drift-monitor
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_FORCE_PATH_STYLE=true               # required for MinIO; false for AWS
S3_SIGNED_URL_TTL_SECONDS=900

# ── AI (provider-independent) ───────────────────────────────────────
AI_PROVIDER=openai                     # swap target for the AIProvider abstraction
AI_API_KEY=
AI_BASE_URL=                           # optional; for compatible gateways
AI_MODEL_STANDARD=                     # small/fast model id
AI_MODEL_ADVANCED=                     # large/reasoning model id
AI_MAX_INPUT_TOKENS=1500
AI_TIMEOUT_MS=60000
AI_DAILY_BUDGET_USD=50                 # platform-wide kill switch
AI_ENABLED=true

# ── Scanner ─────────────────────────────────────────────────────────
SCAN_TIMEOUT_MS=600000
SCAN_NAV_TIMEOUT_MS=30000
SCAN_SETTLE_MAX_MS=15000
SCAN_OBSERVE_MS=10000
SCAN_CONSENT_TIMEOUT_MS=15000
SCAN_PHASE_TIMEOUT_MS=90000
SCAN_PAGE_TIMEOUT_MS=120000
SCAN_MAX_PAGES=10
SCAN_MAX_REDIRECTS=3
SCAN_MAX_RESPONSE_BYTES=52428800
SCAN_CONCURRENCY=2
SCAN_BROWSER_POOL_SIZE=2
SCAN_BROWSER_MAX_USES=50
SCAN_BROWSER_MAX_AGE_MS=1800000
SCAN_CONSENT_MIN_CONFIDENCE=0.5
SCAN_BLOCK_MEDIA=true
SCAN_RESPECT_ROBOTS=true
SCAN_USER_AGENT_SUFFIX="PrivacyDriftMonitor/1.0 (+https://example.com/bot)"
SCANNER_VERSION=1.0.0

# ── Abuse control ───────────────────────────────────────────────────
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
FREE_SCAN_RATE_PER_IP_HOUR=3
FREE_SCAN_RATE_PER_IP_DAY=10
FREE_SCAN_TIMEOUT_MS=45000
FREE_SCAN_RETENTION_DAYS=7

# ── Observability ───────────────────────────────────────────────────
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
OTEL_EXPORTER_OTLP_ENDPOINT=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# ── Feature flags / ops ─────────────────────────────────────────────
MAINTENANCE_MODE=false
WORKER_ROLES=scan,analysis,report,ai,notification,cleanup   # which queues this container consumes
```

## 10.11 Backups and Disaster Recovery

**Backups**

| Asset | Method | Frequency | Retention | RPO |
|---|---|---|---|---|
| PostgreSQL | Managed automated backups + continuous WAL archiving (PITR) | Continuous | 30 days PITR, 90 days weekly fulls | **< 5 min** |
| Postgres logical dump | `pg_dump` to a **different provider's** object storage | Daily | 30 days | 24 h |
| S3 objects | Bucket versioning + cross-region replication | Continuous | 7-day noncurrent | Near-zero |
| Redis | **Not backed up** — it holds only queue state and caches, both reconstructible | — | — | n/a |
| Secrets | Platform secret store + an offline encrypted copy held by two people | On change | — | — |
| Code/IaC | Git, mirrored to a second remote | On push | — | — |

The off-provider logical dump is deliberate: it is the only backup that survives our hosting provider's account being lost or compromised.

**Restore testing.** A quarterly restore drill provisions a fresh database from the latest PITR snapshot, runs migrations, boots the app against it, and executes a smoke suite. The drill is a scheduled calendar obligation with a written runbook; a backup that has never been restored is not a backup.

**Targets: RPO < 5 minutes, RTO < 4 hours for a full-region loss.**

### Disaster scenarios

| Scenario | Detection | Immediate impact | Fallback | Recovery |
|---|---|---|---|---|
| **Database outage** | Health check fails; connection errors | Total outage — app cannot serve | Maintenance page; workers stop claiming jobs and jobs stay queued | Managed failover to standby (typically < 60 s). If the primary is lost: restore PITR to a new instance, repoint `DATABASE_URL`, redeploy. **RTO ~2 h** |
| **Redis outage** | Health check; BullMQ connection errors | No new scans queue; caches miss; **the app remains readable** | API enters degraded mode: reads work, scan/report/AI enqueueing returns 503 with a clear message; an operator alert fires | Managed failover or new instance. Queued jobs are lost — the reconciliation sweep re-enqueues `QUEUED` scans from the database, which is precisely why scan intent lives in Postgres, not only in Redis |
| **S3 outage** | Upload/download errors | Screenshots and reports unavailable; scans still complete | Evidence rows still persist (they are in Postgres); screenshot upload retries up to 5×, then the scan completes with `screenshotsUnavailable` set; report generation is retried | Provider recovery; a `maintenance` job re-uploads any buffered screenshots |
| **AI provider outage** | Circuit breaker opens | AI explanations unavailable | **Scanning, detection, drift, scoring, alerts, and reports all continue unaffected.** AI sections show "temporarily unavailable"; queued AI jobs retry with backoff | Circuit half-opens automatically |
| **Stripe outage** | API errors; webhook gap | Checkout and portal unavailable | **We never change subscription state on our own inference.** Existing subscriptions keep working; a banner explains billing is temporarily unavailable | Reconciliation job syncs state once Stripe recovers; Stripe replays missed webhooks |
| **Resend outage** | Send errors | Emails delayed | Jobs retry for up to ~2 hours; **in-app notifications are unaffected**, so alerts still reach users who are logged in | Queue drains on recovery |
| **Clerk outage** | Auth failures | New logins fail; **existing sessions continue** (JWT-based) | Status banner; portal access is unaffected (separate auth) | Provider recovery |
| **Scanner worker outage** | Heartbeat/queue depth alerts | Scans queue but do not run | Jobs are durable in Redis; nothing is lost | Autoscaler or manual scale-up; stuck-scan sweep resets `RUNNING` rows |
| **Full region loss** | All checks fail | Total outage | — | Deploy images to a secondary region, restore Postgres from PITR, repoint DNS. **RTO ~4 h.** Runbook maintained and drilled |
| **Accidental mass deletion** | Alert on anomalous delete volume; customer report | Data loss | S3 versioning restores objects; Postgres PITR restores to just before the event | Documented runbook |

## 10.12 Performance Budgets

| Surface | Metric | Target | Measurement |
|---|---|---|---|
| Marketing pages | LCP | < 2.0 s | Real-user monitoring + Lighthouse CI in the PR pipeline |
| Marketing pages | CLS / INP | < 0.1 / < 200 ms | RUM |
| App dashboard | Time to interactive | < 2.5 s on a warm cache | RUM |
| App list pages | Server response (TTFB) | p95 < 400 ms | Server metrics |
| API — reads | Latency | p95 < 300 ms, p99 < 800 ms | Histogram per route |
| API — writes | Latency | p95 < 500 ms | Histogram |
| Database queries | Latency | p95 < 100 ms, p99 < 300 ms | Prisma middleware timing |
| Evidence viewer | 5,000-row table interaction | < 100 ms per interaction | Virtualized; measured in E2E |
| Scan (4 phases, 1 page) | Duration | p50 < 150 s, p95 < 400 s | `scan_duration_seconds` |
| Scan queue wait | Time to start | p95 < 5 min (scheduled), < 60 s (manual) | `queue_wait_seconds` |
| Report generation | End to end | p50 < 30 s, p95 < 120 s | Job duration |
| AI call | Latency | p95 < 8 s | `ai_request_duration` |

**How they are enforced:** Lighthouse CI budgets fail the PR pipeline on marketing regressions. API and database histograms alert on breach. Scan duration is a tracked product-quality metric reported weekly. The evidence viewer's performance is asserted in an E2E test against a seeded 5,000-request scan.

**Optimization levers already designed in:** virtualized tables, cursor pagination, batched evidence inserts (`createMany` in 1,000-row chunks), denormalized counters, Redis caching of dashboard summaries, per-widget streaming with `<Suspense>` so a slow widget does not block the shell, `next/image` for all screenshots, and route-level code splitting via route groups.

---

# Part XI — Design System & UX

## 11.1 Design Principles

1. **Evidence is always one click away.** Any claim the UI makes must be traceable without leaving the flow.
2. **Severity is legible at a glance** — color plus icon plus text, never color alone.
3. **Density where experts work** (issue queue, evidence viewer), **spacious where clients look** (portal, reports).
4. **Never imply legal certainty.** Visual language avoids pass/fail badges in favor of detected/not detected/undetermined.
5. **Every state is designed** — loading, empty, error, partial, and success are all specified before a screen is considered done.

## 11.2 Typography

- **UI:** Inter Variable, self-hosted via `next/font/local` (self-hosting is both a performance and a privacy decision — we do not send our users' IPs to a font CDN, and a privacy product loading third-party fonts would be indefensible).
- **Monospace:** JetBrains Mono for URLs, cookie names, selectors, evidence.
- The scaffold's Geist fonts are replaced; note the scaffold's `globals.css` sets `font-family: Arial…` on `body`, which must be removed or it will override the font variable.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 48/56 | 700 | Marketing hero |
| `h1` | 30/38 | 600 | Page titles |
| `h2` | 24/32 | 600 | Section headers |
| `h3` | 20/28 | 600 | Card titles |
| `h4` | 16/24 | 600 | Sub-sections |
| `body` | 14/22 | 400 | Default UI |
| `body-lg` | 16/26 | 400 | Marketing body, portal |
| `small` | 13/20 | 400 | Secondary |
| `caption` | 12/16 | 500 | Labels, metadata |
| `mono` | 13/20 | 400 | Technical values |

## 11.3 Color Tokens

Semantic tokens as CSS custom properties in `globals.css` using Tailwind v4's `@theme inline` (matching the existing scaffold's approach — the project is on Tailwind v4 with `@import "tailwindcss"` and no `tailwind.config.js`).

```css
@import "tailwindcss";

:root {
  --background: #ffffff;      --foreground: #0a0a0a;
  --card: #ffffff;            --card-foreground: #0a0a0a;
  --muted: #f4f4f5;           --muted-foreground: #71717a;
  --border: #e4e4e7;          --input: #e4e4e7;   --ring: #2563eb;
  --primary: #2563eb;         --primary-foreground: #ffffff;
  --secondary: #f4f4f5;       --secondary-foreground: #18181b;
  --success: #16a34a;         --success-foreground: #ffffff;  --success-muted: #f0fdf4;
  --warning: #d97706;         --warning-foreground: #ffffff;  --warning-muted: #fffbeb;
  --danger:  #dc2626;         --danger-foreground: #ffffff;   --danger-muted: #fef2f2;
  --info:    #0891b2;         --info-foreground: #ffffff;     --info-muted: #ecfeff;

  /* Severity — deliberately distinct from status colors */
  --severity-critical: #b91c1c;  --severity-critical-bg: #fef2f2;
  --severity-high:     #ea580c;  --severity-high-bg:     #fff7ed;
  --severity-medium:   #ca8a04;  --severity-medium-bg:   #fefce8;
  --severity-low:      #0284c7;  --severity-low-bg:      #f0f9ff;
  --severity-info:     #64748b;  --severity-info-bg:     #f8fafc;

  /* Score bands */
  --score-excellent: #16a34a;  /* 90–100 */
  --score-good:      #65a30d;  /* 75–89  */
  --score-fair:      #ca8a04;  /* 50–74  */
  --score-poor:      #ea580c;  /* 25–49  */
  --score-critical:  #b91c1c;  /* 0–24   */

  --radius: 0.5rem;
}

.dark { /* full dark-mode remapping of every token above */ }

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-severity-critical: var(--severity-critical);
  /* …one mapping per token */
}
```

**Severity is never conveyed by color alone.** Each severity has a paired icon (`ShieldAlert`, `AlertTriangle`, `AlertCircle`, `Info`, `Circle`) and a text label, satisfying WCAG 1.4.1.

## 11.4 Component Inventory (shadcn/ui)

| Component | Primary uses |
|---|---|
| `Button` | All actions; variants `default`/`secondary`/`outline`/`ghost`/`destructive`; loading state with a spinner and disabled |
| `Input`, `Textarea`, `Label` | All forms; error state with `aria-invalid` and `aria-describedby` |
| `Select`, `Combobox` | Client picker, filters, frequency |
| `Command` | `⌘K` global search |
| `Dialog`, `AlertDialog` | Add website wizard, confirmations |
| `Sheet`, `Drawer` | Mobile nav, mobile filters |
| `DropdownMenu` | Row actions, user menu |
| `Tabs` | Website detail, client detail, alerts |
| `Table` | Every list; with TanStack Table + TanStack Virtual for evidence |
| `Card` | Dashboard widgets, plan cards, evidence blocks |
| `Badge` | Severity, status, category, party |
| `Alert` | Inline warnings, partial-scan notices, plan limits |
| `Toast` (Sonner) | Mutation feedback |
| `Tooltip` | Metric explanations, truncated values, disabled-reason hints |
| `Popover` | Notification bell, score breakdown, filter chips |
| `Progress` | Scan progress, usage meters |
| `Skeleton` | Every loading state |
| `Calendar`, `DateRangePicker` | Report periods, filters |
| `Accordion` | FAQ, evidence groups |
| `Separator`, `ScrollArea`, `Avatar`, `Switch`, `Checkbox`, `RadioGroup`, `Slider` | Supporting |
| `Chart` (Recharts wrapper) | Score trend, tracker donut, drift timeline |

**Custom components** (in `components/domain/`): `SeverityBadge` · `ScoreGauge` · `ScoreBreakdown` · `ConsentPhaseMatrix` · `EvidenceCard` · `DriftDiffCard` · `TrackerChip` · `CookieTable` · `RequestTable` (virtualized) · `ScanProgressPanel` · `AiOutputCard` (with the persistent AI label and evidence links) · `EntitlementGate` · `Can` (permission gate) · `EmptyState` · `PartialScanNotice`.

## 11.5 Responsive Behavior

| Breakpoint | Range | Layout |
|---|---|---|
| Mobile | < 768 px | Single column; sidebar → `Sheet`; tables → card lists; filters → bottom `Drawer`; bottom-fixed primary action; charts simplified to sparklines |
| Tablet | 768–1279 px | Icon-only collapsed sidebar; 2-column dashboard; tables horizontally scrollable with a sticky first column; modals full-width with margin |
| Desktop | ≥ 1280 px | Full sidebar; 3–4 column dashboard; full tables; side-panel detail views; multi-column forms |

**Mobile-specific decisions:** the evidence viewer is intentionally desktop-first — on mobile it shows a summary with a "best viewed on desktop" note rather than an unusable table. The issue queue and dashboard are fully mobile-capable because triage on a phone is a real workflow. Report PDFs render identically regardless of the requesting device.

## 11.6 Accessibility (WCAG 2.2 AA)

| Requirement | Implementation |
|---|---|
| Keyboard navigation | Every interactive element reachable and operable; logical tab order; no keyboard traps; `⌘K`, `g`-prefixed navigation, `?` shortcut sheet |
| Focus visible | 2 px `--ring` outline with 2 px offset on every focusable element; never removed |
| Focus management | Dialogs trap focus and restore it on close; route changes move focus to the `h1`; toasts are `aria-live="polite"` |
| Semantic HTML | `header`/`nav`/`main`/`aside`/`footer`; one `h1` per page; heading levels never skipped |
| ARIA | `aria-label` on icon buttons; `aria-describedby` on inputs with help or error text; `aria-current="page"` in nav; `aria-sort` on sortable columns; `role="status"` on scan progress |
| Form errors | Inline, adjacent to the field, referenced by `aria-describedby`, announced via a live region; error summary at the top of long forms |
| Color contrast | ≥ 4.5:1 body, ≥ 3:1 large text and UI components; every token pair verified; agency brand colors validated at save time |
| Non-color signals | Severity = color + icon + text; charts use pattern fills as well as color |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables transitions and animated counters; Playwright contexts use `reducedMotion: 'reduce'` |
| Screen reader | Tested with VoiceOver and NVDA on: dashboard, issue list, issue detail, add-website flow, and the portal |
| Target size | ≥ 24×24 px minimum (WCAG 2.2), ≥ 44×44 px on touch |
| Skip link | "Skip to main content" as the first focusable element |
| Zoom | Usable at 200% zoom and at 320 px width without horizontal scroll |

**Enforcement:** `eslint-plugin-jsx-a11y` in the lint gate; `axe-core` assertions in E2E tests for the ten highest-traffic pages; a manual keyboard-only pass before each release.

## 11.7 Loading States

Skeletons that match the final layout's shape — never a centered spinner on a full page.

**Scan progress** is a first-class experience, since it is the user's first-value moment. Live-updating (polled every 2 s, or SSE in V1.1) with real stage transitions driven by `ScanPhase` rows:

```
● Preparing browser              ✓ 2s
● Loading page                   ✓ 4s
● Detecting consent banner       ✓ 3s   → "Complianz detected"
● Testing: no consent            ✓ 18s  → "3 trackers observed"
● Testing: Reject All            ⣾ 12s
○ Testing: Accept All
○ Testing: withdrawal
○ Analyzing trackers
○ Comparing with previous scan
○ Generating results
```

Each completed stage shows what it found, so the wait is informative rather than dead time. Failed stages show the reason inline and the run continues.

## 11.8 Empty and Error States

Every empty state names the concept, explains the value, and offers the action.

| Context | Copy | Action |
|---|---|---|
| No websites | "Add your first client website to start monitoring privacy behavior." | Add Website · Import CSV |
| No clients | "Clients group websites together for reporting and portal access." | Add Client |
| No issues (site) | "No potential privacy issues detected in the latest scan, completed 3 hours ago." | View scan |
| No issues (filtered) | "No issues match these filters." | Clear filters |
| No reports | "Generate your first monitoring report after a completed scan." | Generate Report |
| No drift events | "No changes detected since monitoring began. We'll tell you the moment something changes." | — |
| No scans yet | "The first scan is queued and usually takes about two minutes." | — |
| No notifications | "You're all caught up." | — |
| No team members | "Invite your team so they can review and resolve issues." | Invite |
| Search no results | "No results for '{q}'." | Clear |

Error states, in user language:

| Error | Message | Action |
|---|---|---|
| Website unreachable | "We couldn't reach this website. It may be offline, or it may be blocking automated visits." | Retry · How to allowlist us |
| Scan timed out | "The scan took longer than expected and was stopped. Sites with heavy scripts sometimes need a retry." | Retry |
| Banner not detected | "We couldn't find a consent banner on this page. If there is one, you can tell us where to look." | Configure selectors |
| Bot challenge | "This website is protected by a bot challenge we couldn't pass. Allowlisting our scanner will let monitoring continue." | View our IPs |
| Plan limit | "You've reached your plan's limit of {n} websites." | Upgrade · Archive a site |
| AI unavailable | "AI explanations are temporarily unavailable. The technical details above are complete." | Retry later |
| Report failed | "We couldn't generate this report. Nothing was charged against your report allowance." | Try again · Contact support |
| Partial scan | "Some consent tests couldn't be completed on this scan. Results below cover only the tests that ran." | See what was skipped |
| Generic 500 | "Something went wrong on our side. Reference: {requestId}" | Retry · Contact support |

## 11.9 Onboarding

Target: **under 4 minutes to a running first scan.**

```
1. Welcome            "Let's get your first website monitored."     [15s]
2. Agency name        Pre-filled from the email domain             [20s]
3. Agency type        WordPress / SEO / Full-service / Other       [10s]  → segmentation data
4. Portfolio size     1–10 / 11–50 / 51–200 / 200+                 [10s]  → plan recommendation
5. First website      URL input with live validation               [45s]  → pre-filled from a free scan if present
6. Scan frequency     Weekly (recommended) / Daily / Monthly       [15s]
7. Initial scan       Live progress panel                          [~2m]  ← the value moment
8. First result       Score + findings + guided tour of one issue  [45s]
9. Alerts             Email address + immediate/digest choice      [20s]
10. Branding          Logo upload — SKIPPABLE, prompted later      [30s]
```

**Design rules:** steps 2–6 are one scrolling page, not ten modals. Every step after 5 is skippable. Progress is saved on each step so an interrupted signup resumes. Step 7 shows real progress with real findings, and while it runs we invite the user to add a second website — turning dead time into activation. Step 10 is deliberately last and optional; branding matters enormously for retention but must not stand between signup and first value.

## 11.10 First Value Moment

**Activation event: the user views the results of their first completed scan.**

Instrumented as `scan_completed` followed by a result view within the same session. Everything in onboarding is optimized for this single moment. Supporting measures: the baseline scan is queued at **HIGH priority** so new users never wait behind scheduled work; the progress panel makes the wait informative; and if the first scan fails, the failure screen is a designed experience with a retry and a "try a different URL" path — not a dead end.

Secondary activation (the retention predictor): **first white-label report generated within 14 days.** Prompted by an in-app card and a day-7 email once at least one scan has completed.

## 11.11 Internationalization and Timezones

**i18n readiness without shipping i18n.** English only at launch, but architected so a locale can be added without touching components:
- All user-facing strings live in `packages/shared/src/copy/en.ts` as a typed nested object, accessed via a `t()` helper. No string literals in JSX.
- Dates and numbers formatted through `Intl.DateTimeFormat`/`Intl.NumberFormat` with an explicit locale parameter, never hardcoded formats.
- Email and report copy is already separated from layout (`packages/email/src/copy/`, `packages/reports/src/copy/`).
- The app router structure supports a future `[locale]` segment without moving files, because all app routes already sit inside route groups.
- **Note:** the *scanner* already handles multilingual content — the generic consent adapter matches button text in seven languages, because client websites are multilingual even when our UI is not.

**Timezones.** All timestamps stored in UTC. `Agency.timezone` and `User.timezone` (user overrides agency) drive display. Rendering uses `Intl.DateTimeFormat` with the resolved zone; relative times ("3 hours ago") via a small formatter with an absolute value in the tooltip. Scheduled work — digests, weekly summaries, monthly reports, quiet hours — is computed in the agency's timezone, implemented by grouping agencies by zone and running one repeatable job per distinct zone rather than per agency.

## 11.12 Support and Help

**MVP:** `/app/help` with searchable MDX articles, a categorized FAQ, a contact form pre-filled with agency and user context (and the current page URL, which dramatically improves support quality), a status page link, and a changelog. Support email routed to a shared inbox; `/admin/agencies` carries a support-notes field.

**Future:** in-app chat, a public knowledge base with its own SEO surface, and an AI support assistant grounded in the help content (which is exactly the same grounded-retrieval pattern as the rest of our AI — no new architecture).

## 11.13 Feature Flags

```ts
// packages/shared/src/flags.ts
export const FLAGS = {
  AI_ASSISTANT_PAGE: 'ai_assistant_page',
  AI_AUTO_EXPLAIN: 'ai_auto_explain',
  SLACK_INTEGRATION: 'slack_integration',
  WEBHOOKS: 'webhooks',
  CLIENT_PORTAL: 'client_portal',
  ADVANCED_SCAN: 'advanced_scan',           // multi-page, deeper crawling
  CMP_ADAPTER_EXPERIMENTAL: 'cmp_adapter_experimental',
  SCORING_ENGINE_V2: 'scoring_engine_v2',
  NL_SEARCH: 'nl_search',
  COPILOT: 'copilot',
} as const;
```

Resolution order: **agency override → plan targeting → percentage rollout (stable hash of `agencyId`) → global default.** Cached 60 s in Redis and in process. Server-side via `await isEnabled(FLAGS.X, agencyId)`; client-side through a flags object passed down from the app layout, so there is no flash of wrongly-gated content.

Every flag has an owner and a removal date recorded in `/admin/feature-flags`. Flags are also **kill switches**: `AI_AUTO_EXPLAIN` off stops all automatic AI spend instantly; `ADVANCED_SCAN` off reduces scanner load during an incident. `SCORING_ENGINE_V2` specifically supports shadow-mode rollout — compute both scores, store both, compare, then flip.

---

# Part XII — Execution Plan

## 12.1 Repository Structure

```
drift-monitor/
├── apps/
│   ├── web/                                  # Next.js 16 application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/              # public site — static-friendly
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx              # /
│   │   │   │   │   ├── features/
│   │   │   │   │   ├── how-it-works/
│   │   │   │   │   ├── pricing/
│   │   │   │   │   ├── free-scanner/[[...token]]/
│   │   │   │   │   ├── blog/[slug]/
│   │   │   │   │   ├── legal/[doc]/
│   │   │   │   │   └── opengraph-image.tsx
│   │   │   │   ├── (auth)/
│   │   │   │   │   ├── login/[[...rest]]/
│   │   │   │   │   └── signup/[[...rest]]/
│   │   │   │   ├── (app)/                    # authenticated agency app
│   │   │   │   │   ├── layout.tsx            # AppShell + AgencyContext
│   │   │   │   │   ├── app/
│   │   │   │   │   │   ├── page.tsx          # dashboard
│   │   │   │   │   │   ├── onboarding/
│   │   │   │   │   │   ├── websites/[websiteId]/
│   │   │   │   │   │   ├── clients/[clientId]/
│   │   │   │   │   │   ├── issues/[issueId]/
│   │   │   │   │   │   ├── scans/[scanId]/
│   │   │   │   │   │   ├── trackers/[trackerId]/
│   │   │   │   │   │   ├── drift/
│   │   │   │   │   │   ├── reports/[reportId]/
│   │   │   │   │   │   ├── alerts/  notifications/  ai/
│   │   │   │   │   │   ├── team/  billing/  help/
│   │   │   │   │   │   └── settings/{general,branding,notifications,scanning,ai,security,integrations}/
│   │   │   │   ├── (admin)/admin/…           # super-admin surfaces
│   │   │   │   ├── (portal)/portal/…         # client portal, separate session
│   │   │   │   ├── api/                      # Route Handlers (mirrors the API inventory)
│   │   │   │   ├── layout.tsx                # root layout: fonts, theme, providers
│   │   │   │   ├── globals.css               # Tailwind v4 @import + @theme tokens
│   │   │   │   ├── error.tsx  not-found.tsx  global-error.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/                       # shadcn primitives
│   │   │   │   ├── domain/                   # SeverityBadge, ScoreGauge, EvidenceCard…
│   │   │   │   ├── layout/                   # AppShell, Sidebar, Header, Breadcrumbs
│   │   │   │   └── marketing/
│   │   │   ├── features/                     # feature-sliced UI + hooks
│   │   │   │   ├── websites/  issues/  scans/  drift/  reports/  billing/  ai/  team/  portal/
│   │   │   ├── server/
│   │   │   │   ├── auth/                     # requireAgencyContext, requirePermission
│   │   │   │   ├── actions/                  # 'use server' — one file per domain
│   │   │   │   ├── services/                 # orchestration; the only caller of repositories
│   │   │   │   └── http/                     # handle(), parseJson(), json(), rate limiting
│   │   │   ├── hooks/  lib/  types/
│   │   │   ├── proxy.ts                      # ⚠️ NOT middleware.ts — renamed in Next 16
│   │   │   └── instrumentation.ts            # OpenTelemetry + onRequestError
│   │   ├── public/  next.config.ts  postcss.config.mjs  eslint.config.mjs  Dockerfile
│   │
│   └── worker/
│       ├── src/
│       │   ├── index.ts                      # bootstrap; WORKER_ROLES selects queues
│       │   ├── queues/                       # queue + connection definitions
│       │   ├── jobs/
│       │   │   ├── scan.job.ts               # orchestrates packages/scanner
│       │   │   ├── scan-analysis.job.ts      # classification + rules + issues + score
│       │   │   ├── drift-analysis.job.ts
│       │   │   ├── report-generation.job.ts
│       │   │   ├── ai.job.ts
│       │   │   ├── notification.job.ts  email.job.ts
│       │   │   └── cleanup.job.ts  maintenance.job.ts
│       │   ├── schedulers/scan-scheduler.ts  digest-scheduler.ts
│       │   └── lib/                          # graceful shutdown, health server, metrics
│       └── Dockerfile                        # playwright base image
│
├── packages/
│   ├── database/          # prisma schema, migrations, seed, client, repositories, tenant extension
│   ├── scanner/           # browser pool, consent adapters, recorders, rules, drift, scoring, SSRF guard, fixtures
│   ├── ai/                # AIProvider, OpenAI impl, prompts, schemas, validators, context builders, cache
│   ├── billing/           # Stripe client, entitlements, usage metering, webhook processors
│   ├── email/             # React Email templates, Resend client, copy
│   ├── reports/           # report templates (React), PDF renderer, branding resolver
│   ├── storage/           # S3 client, key builders, signed URLs, upload validation
│   ├── schemas/           # Zod: API inputs, job payloads, AI outputs, shared enums
│   ├── shared/            # errors, logger, rate limiting, circuit breaker, flags, permissions, copy, analytics, url utils
│   ├── ui/                # cross-app components (used by web and report renderer)
│   └── config/            # shared eslint, tsconfig, tailwind preset
│
├── .github/workflows/{pr,deploy,e2e,security}.yml
├── docker-compose.yml
├── turbo.json  pnpm-workspace.yaml  package.json
├── .env.example
├── AGENTS.md  CLAUDE.md  README.md  PLAN.md
```

### Key modules — responsibility, dependencies, public interface

| Module | Responsibility | Depends on | Public interface |
|---|---|---|---|
| `packages/database/src/client.ts` | Single Prisma client instance, connection pooling, query timing middleware | prisma | `prisma` |
| `packages/database/src/tenant.ts` | Tenant-scoped client factory; the enforcement point for P3 | client | `forAgency(agencyId)` |
| `packages/database/src/repositories/*` | Typed data access per aggregate; the only place raw Prisma is used | client, tenant | `websiteRepo`, `issueRepo`, `scanRepo`, … |
| `packages/scanner/src/orchestrator.ts` | Runs a full scan: pool → phases → evidence; returns a `ScanResult` | browser, consent, recorders, net | `runScan(input): Promise<ScanResult>` |
| `packages/scanner/src/browser/pool.ts` | Browser lifecycle, recycling, semaphore | playwright | `BrowserPool` |
| `packages/scanner/src/consent/registry.ts` | Adapter resolution cascade | adapters | `resolveAdapter(page): Promise<ResolvedAdapter>` |
| `packages/scanner/src/consent/adapters/*` | One file per CMP + generic + none | playwright | `ConsentAdapter` |
| `packages/scanner/src/net/guard.ts` | **SSRF validation** — the security-critical module | dns, ipaddr | `assertSafeUrl(url): Promise<PinnedTarget>` |
| `packages/scanner/src/trackers/classifier.ts` | Artifact → vendor matching with confidence | vendor DB | `classify(artifacts, vendors): Detection[]` |
| `packages/scanner/src/rules/registry.ts` | Rule set, precedence, evaluation | types | `evaluateRules(ctx): Finding[]` |
| `packages/scanner/src/drift/{normalize,diff}.ts` | Fingerprinting and set-diff | — | `buildFingerprints`, `computeDrift` |
| `packages/scanner/src/scoring/score.ts` | Deduction model + breakdown | rules | `computeScore(input): ScoreResult` |
| `packages/scanner/src/privacy/sanitize.ts` | URL/value redaction before persistence | — | `sanitizeUrl`, `redactValue` |
| `packages/ai/src/provider.ts` | Provider-agnostic contract | schemas | `AIProvider` |
| `packages/ai/src/validate.ts` | Schema + grounding + terminology + claim checks | schemas | `validateAIOutput(feature, raw, ctx)` |
| `packages/billing/src/entitlements.ts` | The single source of plan logic | database, redis | `EntitlementService` |
| `packages/storage/src/signed-url.ts` | Tenant-asserted signed URL issuance | s3 | `getSignedUrl(agencyId, key, ttl)` |
| `packages/shared/src/errors.ts` | Error taxonomy with stable codes | — | `AppError` subclasses |
| `packages/shared/src/permissions.ts` | RBAC matrix, shared by UI and server | — | `can(role, permission)` |
| `apps/web/src/server/http/handle.ts` | The single API error boundary | shared | `handle(req, fn)` |
| `apps/web/src/server/auth/context.ts` | Session → tenant context resolution | clerk, database | `requireAgencyContext`, `requirePermission` |
| `apps/worker/src/jobs/scan.job.ts` | Job wrapper around the scanner orchestrator | scanner, database | BullMQ processor |

## 12.2 Testing Strategy

| Layer | Tool | Scope | Gate |
|---|---|---|---|
| **Unit** | Vitest | Scoring, tracker classification, consent text/pattern matching, drift normalization + diff, entitlement resolution, permission matrix, Zod schemas, AI output validators, URL normalization, **SSRF guard**, error mapping, state machines | Every PR; **coverage ≥ 85% on `packages/scanner` and `packages/billing`** |
| **Integration** | Vitest + testcontainers | Repositories against real Postgres, **tenant isolation across every model**, BullMQ job round-trips, Stripe webhook processing (fixture events), S3 via MinIO, email queueing, API route handlers with a mocked Clerk session, entitlement enforcement | Every PR |
| **Scanner fixtures** | Vitest + Playwright + local fixture server | F01–F30 (Part IV §4.15) | Every PR touching `packages/scanner`; **F28 (no spurious drift) is a hard gate** |
| **AI** | Vitest + `MockProvider` | Schema validation, grounding rejection (unresolvable ref), terminology rejection, claim rejection, repair path, cache hit/miss, budget enforcement, context token budget | Every PR |
| **E2E** | Playwright | Signup → onboarding → first scan → result; add website incl. invalid URLs; issue triage → resolve → verify; report generation → download; billing checkout (Stripe test mode) → webhook → entitlement change; team invite → accept; portal invite → magic link → view → download; RBAC (each role sees/does the right things); a11y (axe) on 10 key pages | Nightly + pre-release |
| **Load** | k6 | 100 concurrent scans; dashboard under 50 concurrent users; evidence viewer with 5,000 rows | Pre-release |
| **Security** | Manual + automated | SSRF vector suite, tenant-escape attempts, authz bypass attempts, dependency audit, secret scan | Pre-release + quarterly |

**Test data:** `packages/database/src/testing/factories.ts` provides typed factories (`makeAgency`, `makeWebsite`, `makeScanWithEvidence`) so tests never hand-build fixtures. A seeded "demo agency" with realistic multi-month scan history exists for E2E and for local development.

## 12.3 Phased Implementation

Effort: **S** (≤ 3 days), **M** (~1 week), **L** (~2 weeks), **XL** (~3–4 weeks) for one experienced full-stack engineer. All estimates are **ESTIMATES**, not commitments.

---

### Phase 0 — Foundation
**Goal:** a monorepo where every subsequent phase can be built and shipped safely.
**Dependencies:** none.

| Task | Effort |
|---|---|
| Convert the scaffold to a pnpm + Turborepo monorepo; move `src/` → `apps/web/src/` | S |
| Create all ten `packages/*` with shared tsconfig/eslint presets, strict mode everywhere | S |
| `packages/database`: Prisma init, full schema (Part V), first migration, seed script | M |
| `packages/shared`: error taxonomy, Pino logger, rate limiter, circuit breaker, permissions, copy module | M |
| `packages/schemas`: base Zod schemas and shared enums | S |
| Clerk integration: `proxy.ts`, `requireAgencyContext`, webhook sync, login/signup routes | M |
| `docker-compose.yml` (postgres, redis, minio, mailpit) | S |
| Design system: Tailwind v4 tokens, shadcn install, base components, theme provider, dark mode | M |
| CI: PR workflow (lint, typecheck, test, build, secret scan, migration check) | M |
| `instrumentation.ts`, structured logging, Sentry, `/api/health` + `/api/health/ready` | S |

**Files:** `pnpm-workspace.yaml`, `turbo.json`, `packages/*/package.json`, `packages/database/prisma/schema.prisma`, `apps/web/src/proxy.ts`, `apps/web/src/app/globals.css`, `.github/workflows/pr.yml`.
**DB:** initial migration, all models.
**Acceptance:** `pnpm install && pnpm dev` boots web + worker · a user can sign up and reach an empty `/app` · `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass in CI · migrations apply cleanly to a fresh database · tenant-isolation test suite exists and passes (with zero models, trivially, but the harness is in place).

---

### Phase 1 — Core SaaS Shell
**Goal:** agencies can manage clients and websites. No scanning yet.
**Dependencies:** Phase 0.

| Task | Effort |
|---|---|
| Tenant extension `forAgency()` + repository layer + **tenant isolation test suite over every model** | M |
| RBAC: permission matrix, `requirePermission`, `<Can>` component | S |
| AppShell: sidebar, header, breadcrumbs, `⌘K` search, notification bell, user menu | M |
| Onboarding wizard (steps 1–6, 9) | M |
| Clients: CRUD, list, detail, assignment | M |
| Websites: CRUD, list (table + grid), filters, sort, bulk actions, groups, CSV import/export | L |
| URL validation service + **SSRF guard** (`packages/scanner/src/net/guard.ts`) with the full test-vector suite | M |
| Add Website wizard incl. the full validation error matrix | M |
| Team: invitations, members, role changes | M |
| Settings: general, notifications, security (audit log viewer) | M |
| Audit logging service, wired into every mutating operation | S |
| Dashboard shell with empty states | S |
| Marketing site: home, features, how-it-works, legal pages | L |

**Acceptance:** a user completes signup → onboarding → adds a client → adds a website → sees it listed · invalid, private-IP, and unreachable URLs are rejected with the correct messages · a second agency cannot see the first's data (asserted in tests, not just by inspection) · every role sees the correct navigation and is blocked server-side from actions it lacks · every list has a designed empty state · the audit log records website creation.

---

### Phase 2 — The Scanner
**Goal:** a real scan runs end to end and stores evidence. **The highest-risk phase.**
**Dependencies:** Phase 1.

| Task | Effort |
|---|---|
| Worker app bootstrap: BullMQ queues, connection handling, graceful shutdown, health + metrics server | M |
| Browser pool: lifecycle, recycling, semaphore, crash recovery | M |
| Recorders: network, cookie, storage, console, screenshot | L |
| Resource interception policy (record-then-abort) | S |
| Navigation, settle, observation window, scroll | M |
| Consent adapter framework + registry + resolution cascade | L |
| Five known CMP adapters (Cookiebot, CookieYes, Complianz, OneTrust, Usercentrics incl. shadow DOM) | L |
| `GenericBannerAdapter` — the four-strategy heuristic cascade | L |
| Four-phase orchestration with isolated contexts + withdrawal flow | L |
| Scan state machine + `ScanPhase` persistence | M |
| Evidence persistence with batching and sanitization/redaction | M |
| S3 integration: screenshot upload, key builders, signed URLs | M |
| Scan job + scheduler (database-driven) + stuck-scan recovery | M |
| **Fixture server + F01–F30** | L |
| Scan detail page + evidence viewer (virtualized) | L |
| Scan progress UI (live stages) | M |

**Acceptance:** a scan of a real website completes and stores requests, cookies, storage, and screenshots · all four consent phases execute against fixtures F03–F07 · a site with no banner is correctly recorded as `cmpId: 'none'` · a phase failure produces `PARTIAL`, never a clean result · F28 produces **zero** drift events on identical consecutive scans · a crashed browser does not leak contexts (asserted) · SSRF vectors are all blocked · evidence contains no cookie values, no storage values, and no query strings.

---

### Phase 3 — Intelligence
**Goal:** raw evidence becomes findings, changes, and a score.
**Dependencies:** Phase 2.

| Task | Effort |
|---|---|
| Tracker vendor database: schema, ~250-vendor seed, admin CRUD | L |
| Classification engine with confidence and corroboration | M |
| Rule engine: framework, precedence, registry, all 25 launch rules | L |
| Issue creation with fingerprint deduplication and lifecycle | M |
| Ignore rules and FP suppression | M |
| Drift engine: normalization, fingerprints, diff, event generation, suppression | L |
| Health score: deduction model, breakdown persistence, partial handling | M |
| Analysis and drift jobs (separate from the scan job) | M |
| Issue list + issue detail pages (all 10 sections) | L |
| Website detail tabs: Overview, Issues, Trackers, Cookies, Consent, Changes, Scans, Evidence | XL |
| Drift feed page | M |
| Dashboard: all six widgets, live | L |
| Portfolio tracker inventory pages | M |

**Acceptance:** F11–F17 produce exactly the expected rules with the expected severities · an issue seen in two scans is one issue with `occurrenceCount: 2` · a resolved-then-recurring issue transitions to `REOPENED` · the score breakdown sums to the displayed score · a partial scan shows an asterisked score with the untested phases named · an ignored issue never regenerates or alerts · drift correctly reports `+3 trackers, +5 domains` on F16.

---

### Phase 4 — Agency Workflow
**Goal:** findings become alerts, reports, and client-facing value.
**Dependencies:** Phase 3.

| Task | Effort |
|---|---|
| Notification system: types, preferences, in-app center | M |
| Alert rules, dispatcher, digests, quiet hours, flood control | L |
| Email: Resend integration, all 19 templates, delivery webhooks | L |
| Report system: 5 types, React templates, Playwright PDF renderer, S3 storage, async job | XL |
| White-label: branding settings, contrast validation, snapshotting, leakage tests | M |
| Client portal: magic-link auth, sessions, 5 pages, client-safe serializers | L |
| Verification re-scan workflow | M |
| Reports UI: library, wizard, detail, share links | M |
| Settings: branding, scanning, alerts pages | M |

**Acceptance:** a critical issue produces an email within 60 s and an in-app notification · quiet hours defer non-critical alerts · a daily digest groups a day's issues into one email · a monthly report renders with agency branding and downloads as a PDF · two agencies' reports rendered concurrently do not cross-contaminate branding (asserted) · a portal user logs in by magic link and sees only their client's data · a resolved issue re-scans and transitions to `VERIFIED`.

---

### Phase 5 — AI
**Goal:** grounded explanation and recommendation.
**Dependencies:** Phase 4.

| Task | Effort |
|---|---|
| `AIProvider` interface + `OpenAIProvider` + `MockProvider` | M |
| Context builders for all four MVP features | M |
| Prompts (versioned) + JSON output schemas | M |
| Validation pipeline: schema, grounding, terminology, claim checks | M |
| Caching (`inputHash`), deduplication lock, usage metering, budget enforcement | M |
| AI job + API routes | S |
| UI: `AiOutputCard`, issue detail sections 7–8, drift summary, client message dialog, `/app/ai` | L |
| AI settings page + usage chart + admin AI usage page | M |

**Acceptance:** an explanation references only real evidence IDs · a response with a fabricated ref is rejected and the deterministic content shows instead · a response containing "GDPR violation" is rejected · an identical second request is served from cache at zero cost · exceeding the credit cap blocks the call *before* the provider is contacted · with the AI provider unreachable, every other part of the product works and the AI sections show the unavailable state.

---

### Phase 6 — Commercial & Admin
**Goal:** the product can be sold and operated.
**Dependencies:** Phase 5.

| Task | Effort |
|---|---|
| Stripe: products, prices (3 currencies), checkout, portal, all webhook handlers, reconciliation job | L |
| Entitlement service + enforcement at all nine points + usage metering | L |
| Billing UI: plan card, usage meters, invoices, upgrade/downgrade, grace handling | M |
| Pricing page with currency toggle and comparison table | M |
| Free public scanner: flow, Turnstile, rate limits, isolated queue, result page, conversion tracking | L |
| Admin panel: all 15 pages | XL |
| Feature flags: service, admin UI, resolution | M |
| Analytics instrumentation (all events) | M |
| Cleanup/retention jobs + counter reconciliation | M |

**Acceptance:** checkout creates a subscription and the entitlement change is driven **by the webhook**, not the redirect · a duplicate webhook is a no-op · payment failure moves the agency to read-only for scanning while leaving all data visible · a downgrade over-limit triggers grace, not deletion · the free scanner enforces every abuse control · an admin can retry a failed job and add a tracker vendor · retention deletes expired evidence but never evidence on an open issue.

---

### Phase 7 — Hardening & Launch
**Goal:** production-ready.
**Dependencies:** Phase 6.

| Task | Effort |
|---|---|
| Security review: SSRF vectors, tenant escape, authz bypass, dependency audit, CSP | M |
| Load testing (k6) and tuning to the performance budgets | M |
| Full observability: dashboards, alert routing, runbooks | M |
| Backups configured; **restore drill executed and documented** | S |
| DR runbook written and walked through | S |
| Accessibility audit (axe + manual keyboard + screen reader) and fixes | M |
| Full E2E suite green | M |
| Production infrastructure, deploy pipeline, smoke tests | M |
| Legal pages finalized with counsel review | S |
| Help content, onboarding emails, changelog | M |
| Launch checklist execution | S |

**Acceptance:** the entire production readiness checklist (§12.5) is green.

---

## 12.4 Milestone Acceptance Criteria

**M1 — Foundation:** monorepo builds · migrations apply · signup works · CI green on lint/typecheck/test/build · health endpoints report dependency status.

**M2 — Website onboarding:** user can add a URL · URL is validated and normalized · invalid/private/unreachable URLs produce the correct distinct errors · the website persists with `registrableDomain` · an initial scan is queued · tenant isolation is proven by test · the action is audit-logged · the entitlement limit blocks with an upgrade prompt.

**M3 — Scanner:** browser launches and is pooled · the no-consent phase records requests, cookies, and storage · all four phases run against fixtures · a consent action failure yields `UNDETERMINED` and `PARTIAL`, never a pass · evidence persists with consent-phase attribution · screenshots upload to a tenant-prefixed S3 key · failures are classified and retried per policy · contexts are always cleaned up · SSRF vectors are blocked.

**M4 — Detection:** trackers classify to named vendors with confidence · unknown third parties are recorded as unknown vendors · all 25 rules fire correctly against fixtures · issues deduplicate on fingerprint · ignore rules suppress at creation time · the score breakdown is explainable and sums correctly.

**M5 — Drift:** two identical scans produce **zero** drift events · a new tracker produces `TRACKER_ADDED` plus PDM-R013 · a reject-all regression produces `CONSENT_REGRESSION` at Critical · drift never compares against a `PARTIAL` scan · rotating cookie names and cache-busted scripts do not produce false drift · accepted changes stay suppressed.

**M6 — Alerts:** a critical issue emails within 60 s · digests group correctly and respect the agency timezone · quiet hours defer non-critical alerts · duplicate alerts are suppressed within 4 hours · delivery status is recorded from Resend webhooks.

**M7 — Reports:** all five types generate · PDFs carry agency branding · generation is asynchronous with progress and completion notification · concurrent multi-tenant generation does not leak branding · reports are stored under the tenant prefix and served by signed URL · a failed report does not consume the allowance.

**M8 — Client portal:** magic link authenticates and expires · sessions are scoped to one client · internal notes, rule IDs, and raw evidence are structurally absent · revocation invalidates sessions immediately · portal activity is audit-logged.

**M9 — AI:** outputs validate against schema · unresolvable evidence refs reject the response · forbidden terminology rejects the response · caching works · budgets enforce before the provider call · every AI surface degrades gracefully.

**M10 — Billing:** checkout completes and the webhook drives entitlements · duplicate webhooks are idempotent · every entitlement is enforced at its point of use · payment failure degrades to read-only scanning without hiding data · downgrade grace works · usage counters are accurate under concurrency.

**M11 — Production:** all performance budgets met · security review passed · backups restored in a drill · DR runbook walked · a11y audit passed · E2E suite green · monitoring and alerting live.

## 12.5 Production Readiness Checklist

**Product**
- [ ] Signup → onboarding → first scan → result works end to end
- [ ] All core workflows complete (websites, issues, drift, reports, portal, billing)
- [ ] Every list has a designed empty state
- [ ] Every error has user-readable copy and a next action
- [ ] Mobile layouts verified on the dashboard, issues, and portal
- [ ] Accessibility audit passed (WCAG 2.2 AA)
- [ ] Approved terminology enforced; CI terminology check passing
- [ ] Legal pages reviewed by counsel; disclaimer present in app, reports, and portal

**Security**
- [ ] Tenant isolation tested across every model, including nested relations
- [ ] SSRF guard passes the full vector suite; egress firewall configured
- [ ] Chromium sandbox enabled; containers non-root with dropped capabilities
- [ ] Rate limiting on every public and expensive endpoint
- [ ] Secrets in the platform secret store; no secrets in the repo; secret scan in CI
- [ ] All webhook signatures verified before parsing
- [ ] CSP and security headers set and tested
- [ ] Audit logging on all sensitive actions, including admin reads and impersonation
- [ ] Dependency audit clean at high/critical

**Scanner**
- [ ] Browser workers stable over a 24-hour soak with no memory growth
- [ ] All timeouts enforced at every level
- [ ] Retry policy correct; deterministic failures not retried
- [ ] `PARTIAL` handled everywhere; no clean verdict from an incomplete scan
- [ ] Evidence captured, sanitized, and traceable to findings
- [ ] Fixtures F01–F30 passing; F28 (zero spurious drift) green
- [ ] Consent adapter success rate > 90% per supported CMP on fixtures
- [ ] Stuck-scan recovery verified by killing a worker mid-scan

**Database**
- [ ] All migrations tracked and applied cleanly to a fresh database
- [ ] All indexes from Part V §5.3 present; slow-query log reviewed
- [ ] Foreign keys and cascades correct
- [ ] Automated backups + PITR enabled
- [ ] **Restore drill completed and documented**
- [ ] Counter reconciliation job running and finding zero drift
- [ ] Connection pooling (PgBouncer) configured and load-tested

**Billing**
- [ ] Checkout, portal, upgrade, downgrade, cancel all verified in Stripe test mode
- [ ] Every webhook type handled; unknown types return 200
- [ ] Webhook idempotency verified with replayed events
- [ ] Subscription reconciliation job running
- [ ] Failed payment degrades correctly without data loss
- [ ] Entitlements enforced at all nine points
- [ ] Tax/VAT collection configured

**AI**
- [ ] Every output schema-validated
- [ ] Grounding check rejects fabricated evidence refs
- [ ] Terminology and claim checks rejecting correctly
- [ ] Per-agency credit caps and platform daily budget enforced
- [ ] Caching verified; cost per feature measured
- [ ] Every AI surface degrades gracefully when the provider is down

**Infrastructure**
- [ ] CI/CD deploying web and workers with health-gated rollout
- [ ] Migrations run as a discrete pre-deploy step with destructive-change guard
- [ ] Structured logs shipping and searchable
- [ ] Metrics and dashboards live
- [ ] Alerts routed with an on-call path
- [ ] Autoscaling on queue depth configured and tested
- [ ] Graceful shutdown verified (no jobs lost on deploy)
- [ ] DR runbook written and walked through

## 12.6 Launch Checklist

**Technical:** production build deployed · all environment variables set (including a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` across instances) · migrations applied · **tracker database seeded** · plans seeded and matched to live Stripe products/prices · workers deployed with correct `WORKER_ROLES` · Redis provisioned · S3 bucket created with lifecycle, versioning, and CORS · Stripe live keys and webhook endpoint configured · Resend domain verified with SPF/DKIM/DMARC · Clerk production instance with production webhook · Turnstile production keys · custom domain and TLS · monitoring and error tracking live.

**Product:** pricing live and correct in all three currencies · Terms, Privacy, Cookie Policy, and Disclaimer published and linked from the app, reports, and portal · support email live and monitored · onboarding tested by someone outside the team · free scanner tested against 20 real websites · help content published · `/bot` page live explaining the scanner and how to allowlist or exclude.

**QA:** full regression pass · cross-browser (Chrome, Safari, Firefox, Edge) · mobile (iOS Safari, Android Chrome) · all 30 scanner fixtures green · billing flows in live mode with a real card and immediate refund · AI outputs reviewed for tone and accuracy on 20 real issues · emails rendered in Gmail, Outlook, and Apple Mail · PDF reports opened in Preview, Acrobat, and Chrome.

**Go-live:** feature flags set for launch state · a beta cohort of 5–10 agencies onboarded and interviewed · incident response contacts documented · rollback procedure tested · launch announcement ready.

## 12.7 Risk Register

| Risk | Prob. | Impact | Mitigation | Fallback | Owner |
|---|---|---|---|---|---|
| **Consent adapters fail on real-world CMP diversity** | **High** | **High** | Five known adapters + a four-strategy generic cascade; confidence scoring; per-website selector overrides; 30 fixtures; per-CMP success metrics | Per-website override lets support fix any site without a deploy; `UNDETERMINED` never becomes a false pass | Eng lead |
| **False positives destroy trust** | Medium | **Critical** | Confidence thresholds by severity; corroboration required for Critical; `UNVERIFIED` state; ignore rules; per-rule FP tracking; replay-based rule tuning | Retire or downgrade a rule via feature flag without a deploy | Eng lead |
| **SSRF exploited** | Low | **Critical** | Multi-layer guard, IP pinning, redirect revalidation, full test-vector suite, **infrastructure egress firewall**, no metadata credentials on scanner workers | Egress firewall holds even if the app guard has a bug | Security |
| **Scanner instability / browser leaks** | Medium | High | Pool recycling by use and age, hard timeouts, `finally` cleanup enforced by lint and test, crash recovery, 24 h soak test | Autoscale + stuck-scan recovery; worker restarts are cheap | Eng lead |
| **Browser costs exceed model** | Medium | Medium | Record-then-abort interception, screenshot policy, page limits, scan budgets, priority queues, per-agency concurrency caps | Reduce default frequency; raise prices; move to cheaper compute | Founder |
| **AI hallucination reaches a client** | Low | **High** | Grounding check on every ref, terminology validator, claim validator, `is_hypothesis`, drafts always human-edited before sending | Kill switch via feature flag; deterministic content is always sufficient | Eng lead |
| **AI cost runaway** | Medium | Medium | Per-agency caps, platform daily budget kill switch, caching, model tiering, on-demand default | Daily budget halts spend automatically | Eng lead |
| **Sites block our scanner** (WAF/bot protection) | **High** | Medium | Identifiable UA, published IPs, `/bot` page, robots respect, clear "allowlist us" guidance in the error state | Per-website override; document the limitation honestly | Support |
| **Stripe webhook loss corrupts billing** | Low | High | Idempotent processing, event log with replay, **daily reconciliation against Stripe** | Reconciliation catches divergence within 24 h | Eng lead |
| **S3 outage** | Low | Medium | Retries, evidence rows independent of S3, versioning + replication | Scans complete without screenshots; reports retry | Eng lead |
| **Redis outage** | Low | High | Scan intent lives in Postgres, not only Redis; reconciliation re-enqueues; degraded read-only API mode | Nothing is permanently lost | Eng lead |
| **Database as the bottleneck** | Medium | High | Indexes designed up front, batched inserts, denormalized counters, PgBouncer, read replicas, partitioning path designed | Scale vertically first; partition `network_requests` | Eng lead |
| **Data privacy incident** (we store client-site PII) | Low | **Critical** | Aggressive minimization: no bodies, no cookie values, no storage values, no query strings, screenshot redaction, encryption at rest, retention enforcement | Documented breach runbook; minimization limits blast radius | Security |
| **Scanner abuse** (used to attack third parties) | Low | High | Terms prohibition, rate limits, abuse detection, blocklist, identifiable UA, opt-out honored | Manual suspension; blocklist | Support |
| **Legal challenge over scanning without site-owner consent** | Low | Medium | Public, identifiable, low-volume, robots-respecting, opt-out-honoring scanner; Terms place responsibility on the agency | Honor exclusion requests within one business day; **ASSUMPTION flagged for legal review before launch** | Founder |
| **Positioned as legal compliance and sued over a missed issue** | Low | High | Terminology enforcement in UI, reports, emails, and AI outputs; disclaimer everywhere; documented limitations | Legal review of all customer-facing copy pre-launch | Founder |
| **Low activation** (signups that never scan) | Medium | High | Onboarding under 4 minutes, high-priority baseline scan, informative progress, free-scan pre-fill | Activation funnel instrumented from day one; iterate | Founder |
| **Weak retention** (monitoring becomes background noise) | Medium | High | Drift alerts create recurring value; monthly reports create a recurring ritual; the report habit is the retention lever | Push report generation in onboarding and at day 7 | Founder |
| **CMP vendors add monitoring and bundle it free** | Medium | Medium | Vendor neutrality is the wedge — we monitor *their* product; agency-native workflow and multi-site management are not their focus | Deepen the agency workflow moat and the historical-data moat | Founder |

## 12.8 Assumptions

Every item below is an **ASSUMPTION**, not a verified fact. Each should be validated before it becomes load-bearing.

1. **ASSUMPTION:** Agencies will pay $49–$799/month for privacy monitoring as an addition to existing care plans. *Validate:* 20 customer interviews and 10 pre-sales before Phase 6 completes.
2. **ASSUMPTION:** Agencies can resell monitoring at $10–25 per site per month, giving a 3–7× margin. This is the core sales argument and the justification for site-count pricing. *Validate:* interviews.
3. **ASSUMPTION:** The average agency monitors 30 websites at weekly frequency. All infrastructure and margin calculations depend on this. *Validate:* after 50 customers.
4. **ASSUMPTION:** Average scan duration is ~180 seconds for four phases on one page. *Validate:* measure across 500 real sites during beta.
5. **ASSUMPTION:** Compute cost of ~$0.09/hour for a 2 vCPU / 4 GB worker running 2 concurrent scans. *Validate:* first provider invoice.
6. **ASSUMPTION:** Five CMP adapters plus a generic heuristic cover ≥ 80% of UK/EU agency-managed sites. *Validate:* measure adapter resolution across the first 1,000 real scans; the unknown rate directly drives the V1.1 adapter backlog.
7. **ASSUMPTION:** A seed database of ~250 vendors keeps the unknown-third-party rate below 15%. *Validate:* the unknown-vendor metric from day one.
8. **ASSUMPTION:** OpenAI standard-tier pricing makes an issue explanation cost ~$0.0004. *Validate:* first provider invoice; the model tier mapping is config, so this is cheap to adjust.
9. **ASSUMPTION:** Trial-to-paid conversion of 25% and free-scan-to-signup of 8%. *Validate:* first 90 days.
10. **ASSUMPTION:** Generating a white-label report in month 1 is the strongest retention predictor. *Validate:* cohort analysis at 90 days. If confirmed, restructure onboarding around it.
11. **ASSUMPTION:** A public, identifiable, robots-respecting, opt-out-honoring scanner operating at low volume is legally and ethically proportionate without per-domain ownership verification. **Flagged for legal review before launch.**
12. **ASSUMPTION:** English-only is acceptable at launch for UK/EU agencies, even though their clients' sites are multilingual (which is why the *scanner* is multilingual and the UI is not).
13. **ASSUMPTION:** The Prisma tenant extension provides isolation equivalent to Postgres RLS for our threat model. **Revisit before handling regulated client data.**
14. **ASSUMPTION:** Managed Postgres and Redis from a single provider meet our availability needs without self-managed HA.
15. **ASSUMPTION:** Playwright + Chromium in the Microsoft base image remains the most reliable scanning stack. *Revisit:* if bot-detection failures exceed 10% of scans.
16. **ASSUMPTION:** `cacheComponents` (Next 16's PPR successor) offers no benefit for a request-time tenant dashboard and is therefore correctly left off in v1.
17. **ASSUMPTION:** Cursor pagination for evidence and offset for entity lists matches user expectation without confusion.
18. **ASSUMPTION:** Postgres full-text and trigram search suffices to ~50k issues per tenant.
19. **ASSUMPTION:** 14 days is the right trial length for a product whose value requires at least two scans to demonstrate drift. *Validate:* if activation clusters late, extend to 21 days.
20. **ASSUMPTION:** A monorepo with two deployable apps is the right structure at this scale and will not need splitting before ~1,000 customers.

## 12.9 Open Questions

Each carries a **default decision** so implementation is never blocked.

1. **Do we verify domain ownership before monitoring?**
   *Default:* **No.** Terms-based responsibility, identifiable scanner, robots respect, honored opt-out. Revisit if abuse reports appear. This is the single most consequential open question and should go to legal review during Phase 1.

2. **Should the client portal support custom domains (`privacy.agency.com`)?**
   *Default:* **No for v1.** Path-based branded portal at `/portal`. Custom domains add certificate management and routing complexity for a feature no customer has yet asked for. Revisit at 100 customers.

3. **Does the free scanner require an email before showing results?**
   *Default:* **No.** Show limited results freely; require email for the PDF and for "monitor this website." Gating results kills the conversion signal we need most.

4. **How many pages per scan by default?**
   *Default:* **Homepage only**, with configurable additional paths up to the plan limit. Most tracking is site-wide; multi-page multiplies cost linearly for sub-linear detection gain. Sitemap-driven discovery is a V1.1 evaluation.

5. **Do we notify site owners that we are scanning their site?**
   *Default:* **No proactive notification** (the agency is the customer and manages the relationship), but the `/bot` page, identifiable UA, and published IPs make us discoverable, and exclusion requests are honored within one business day.

6. **Should Privacy Health Score be visible in the client portal?**
   *Default:* **Yes**, with plain-language interpretation and no numeric comparison to other clients. Agencies can disable it per client if a low score would be awkward.

7. **Do we retain evidence after an agency cancels?**
   *Default:* **30 days**, then purge. Stated in Terms and in the cancellation flow, with an export option offered before deletion.

8. **Is AI opt-in or opt-out for new agencies?**
   *Default:* **Opt-out** (AI on by default, auto-explain limited to Critical issues). AI is a headline value; requiring opt-in would suppress the feature that most improves the account manager's experience. A single settings toggle disables it.

9. **Should we support scanning behind authentication in v1?**
   *Default:* **Basic auth only** (credentials in the secret store, Admin+ only), for staging sites. Form-based login automation is fragile, high-support, and a credential-storage liability. Revisit in V1.5.

10. **How do we handle a website that redirects to a different registrable domain?**
    *Default:* **Ask the user during the add flow** which to monitor, and store the choice. Silently following the redirect would produce confusing drift when the redirect changes.

11. **Monthly reports: auto-send to clients, or agency-approved?**
    *Default:* **Agency-approved for v1** — generate on schedule, notify the agency, agency clicks send. Agencies will not tolerate un-reviewed communication going to their clients. Auto-send becomes a per-client opt-in in V1.1.

12. **Do we expose a public API in the MVP?**
    *Default:* **No.** V1.5, on the Agency plan and above, with scoped keys. A public API is a permanent compatibility commitment and should follow, not precede, product stability.

13. **Should scanner workers run in multiple regions at launch?**
    *Default:* **No — single EU region.** Geo-differentiated tag serving is real but is a V1.5 feature (multi-region scanning as a plan differentiator). Document the limitation honestly.

14. **What happens to monitoring during the downgrade grace period?**
    *Default:* **Everything keeps running** for 14 days; only additions are blocked. After grace, excess sites are auto-paused (never deleted), oldest first, with an email naming exactly which and how to restore.

---

## Appendix A — Terminology Quick Reference

| Concept | Definition |
|---|---|
| **Scan** | One complete monitoring run of a website across up to four consent phases |
| **Consent phase** | One of `NO_CONSENT`, `REJECT_ALL`, `ACCEPT_ALL`, `WITHDRAW`, each executed in an isolated browser context |
| **Evidence** | An immutable record of an observed browser event, tied to a scan, phase, and detection rule |
| **Finding** | The output of one rule evaluation over evidence |
| **Issue** | A persistent, deduplicated finding with a lifecycle, identified by `(websiteId, fingerprint)` |
| **Drift event** | A detected change between two completed scans of the same website |
| **Consent regression** | Drift in which Reject All previously blocked a tracker category and no longer does |
| **Privacy Health Score** | A 0–100 explainable deduction model with a stored per-component breakdown |
| **Fingerprint** | A normalized, stable identity for an artifact, used for deduplication and diffing |
| **Corroboration** | Two independent signal types matching the same vendor, raising confidence |
| **Partial scan** | A scan in which at least one consent phase could not be executed — never reported as clean |
| **Entitlement** | A plan-derived limit or capability, resolved by one central service |

## Appendix B — Future WordPress Plugin (Architectural Note Only)

Planned for V2, specified here only far enough to prevent a wrong decision later.

**The plugin is a thin client. The scanner never runs inside WordPress.** Running Chromium — or any detection logic — on a client's shared hosting would be slow, unreliable, impossible to keep updated across thousands of installs, and would produce evidence from inside the server rather than from a real external visitor, which defeats the entire premise of runtime scanning.

**Capabilities (all of them thin):**

| Capability | Mechanism |
|---|---|
| Connect the site to the agency's account | One-time pairing code issued in the app, exchanged for a scoped site token via the V1.5 public API |
| Trigger a scan | Authenticated `POST /api/websites/:id/scan` with the site token; rate-limited identically to the app |
| Show current status | Read-only widget on the WP dashboard: health score, open issue counts, last scan time — fetched from a scoped read endpoint |
| Deep-link into the SaaS | Every element links to the corresponding page in the agency app; the plugin renders no findings detail of its own |
| Notify on a new critical issue | WP admin notice driven by the same read endpoint |

**Constraints:** the token is scoped to one `websiteId`, is read-mostly (scan trigger is the only write), and is revocable from `/app/settings/integrations`. The plugin stores no evidence, renders no reports, and contains no detection rules — so a stale plugin version can never produce a stale finding. Distribution is via the WordPress plugin directory, which makes it an acquisition channel as much as a convenience feature.

## Appendix C — Quick Reference: Non-Obvious Decisions

| Decision | Why |
|---|---|
| `proxy.ts`, not `middleware.ts` | Renamed in Next.js 16; middleware is deprecated |
| No custom webpack config | Turbopack is the default build tool in 16; a webpack config makes `next build` fail |
| Every Server Action re-authorizes | Proxy does not reliably cover Server Actions in Next 16 |
| `cacheComponents` off | A tenant dashboard is request-time; enabling it adds build errors without benefit |
| Analysis is a separate job from scanning | Releases the browser — the scarcest resource — seconds earlier, and makes rule changes replayable |
| Database-driven scheduler, not BullMQ repeatables | Avoids synchronizing 100k repeatable jobs with database state |
| Chromium sandbox stays on | We execute untrusted third-party JavaScript |
| Portal auth is ours, not Clerk | Portal users are the agency's customers; Clerk would inflate MAU cost and complicate the org model |
| Prisma extension, not RLS, for tenancy | Pooling makes per-request session variables fragile; revisit before regulated data |
| Screenshots only on change by default | Largest storage cost, lowest marginal value on unchanged scans |
| Drift never compares against a `PARTIAL` scan | The largest false-positive source in the entire product |
| Auto-resolve, but never auto-verify | Absence in one scan is weaker evidence than a confirming scan |
| AI never classifies trackers in the MVP | Classification is a detection decision, and P1 forbids the LLM from making those |
| Grounding failures are not repaired | A model that invented a citation is not to be coaxed into a better one |
| 404, not 403, for cross-tenant resources | A 403 confirms the resource exists |

---

*End of plan. This document is the single source of truth for Privacy Drift Monitor from initial setup through production launch and post-launch scaling. It should be revised as assumptions are validated — particularly the pricing, cost, adapter-coverage, and activation assumptions in §12.8.*


