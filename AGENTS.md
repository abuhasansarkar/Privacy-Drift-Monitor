<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Privacy Drift Monitor

Continuous privacy and consent monitoring for web agencies. The product loads each client
website in a real browser (Playwright/Chromium) across four consent journeys — no consent,
Reject All, Accept All, withdraw — records every request, cookie and storage write tagged
with the consent state it happened under, diffs each scan against the last to detect
**privacy drift**, and turns that into evidence-backed findings, alerts and white-label
client reports.

## Current state — read this before claiming anything exists

This repo is **greenfield**. It contains a stock `create-next-app` scaffold and two planning
documents. There is no product code yet.

| | |
|---|---|
| Exists | `src/app/` (default scaffold page + layout), `src/app/globals.css`, `next.config.ts` (empty), `tsconfig.json`, `eslint.config.mjs`, `PLAN.md`, `UI_DESIGN_PROMPTS.md` |
| Does **not** exist yet | the monorepo (`apps/`, `packages/`), Prisma schema, the worker, the scanner, auth, billing, any route group, any UI component |

Everything in `PLAN.md` Part XII §12.1 is a **target**, not a description. Never write or
speak about planned architecture as if it were already built, and never import from a path
that does not exist yet.

## PLAN.md is the source of truth

~402 KB, ~7,800 lines. It exceeds the 256 KB single-read limit, so **read it in ranges,
never whole**.

Build a live index first, then read only the part you need:

```bash
grep -n "^#\{1,3\} " PLAN.md          # full heading index with line numbers
grep -n "^# Part" PLAN.md             # part boundaries only
```

| Part | Covers |
|---|---|
| Part 0 | How to read the doc, non-negotiable principles, **verified Next.js 16.3.3 baseline**, deployment posture |
| Part I | Vision, ICP, the five personas, JTBD, differentiators, non-goals, **approved terminology** |
| Part II | MVP boundary, feature inventory with priorities, roadmap, moat |
| Part III | Information architecture, **every page spec**, admin, client portal, page inventory |
| Part IV | The scanner: Playwright engine, consent adapters, tracker/cookie/network engines, drift, risk, score, evidence, rules |
| Part V | Prisma schema, indexes, tenancy, retention |
| Part VI | Auth, RBAC, API architecture and inventory, validation, issues, alerts, reports, white-label, portal |
| Part VII | Redis, BullMQ, scan pipeline, scheduler, retries, scaling |
| Part VIII | `AIProvider`, prompts, output contracts, safety, cost control |
| Part IX | Stripe, entitlements, pricing, unit economics, email, analytics |
| Part X | Security, SSRF, abuse, errors, observability, Docker, CI/CD, env, backups, DR, performance budgets |
| Part XI | Design tokens, component inventory, responsive, a11y, states, onboarding |
| Part XII | File map, phases 0–7, acceptance criteria, risk register, checklists |

**Rule:** before implementing a feature, read the part that specifies it. Do not invent a
design the plan already fixes. If this file and `PLAN.md` disagree, `PLAN.md` wins. If the
code and `PLAN.md` disagree, say so explicitly rather than silently diverging.

`UI_DESIGN_PROMPTS.md` is the companion image-generation prompt pack for the visual design;
it encodes the same tokens as Part XI and must stay in sync with them.

## Non-negotiable product rules

These are architectural, not stylistic. Violating one is a defect regardless of whether
tests pass.

1. **The deterministic scanner is the only source of truth.** An LLM may never be the
   authority on whether a request happened, a cookie exists, a consent button was clicked, a
   tracker fired, a scan succeeded, or a site was reachable. Those facts come from Playwright
   instrumentation and rule-based processing only.
2. **AI explains evidence; AI never invents it.** Every AI output carries `evidence_refs`
   that must resolve to real `IssueEvidence` primary keys. An output with an unresolvable
   reference is rejected at the validation boundary and never reaches a user.
3. **Findings render with or without AI.** AI is additive, never load-bearing. An AI provider
   outage degrades explanations only — scanning, detection, drift, scoring, alerts and
   reports all continue.
4. **Multi-tenant isolation is enforced at the data-access layer**, not by convention. Every
   tenant query is scoped by `agencyId`. Agency A must never reach Agency B's websites,
   clients, scans, evidence, screenshots, reports, billing or AI outputs.
5. **`PARTIAL` is a first-class scan outcome.** An incomplete scan may never produce a clean
   verdict. If the Reject-All phase failed, the UI says so explicitly rather than reporting
   "no issues found".
6. **Nothing downstream of `EvidenceCollector` may add facts.** The classifier, rule engine,
   drift engine and risk engine only interpret recorded evidence, which is what makes the
   pipeline replayable.

### Banned terminology — CI-enforced

The product is a technical monitoring service. It does not provide legal advice and does not
determine compliance. This applies to **UI copy, email templates, PDF reports, AI system
prompts, error messages and test fixtures**.

| Use | Never use |
|---|---|
| Potential issue | Violation |
| Tracker detected before consent | GDPR breach |
| Review recommended | You must / You are required to |
| Technical evidence | Proof of non-compliance |
| Observed request / detected behavior | Confirmed violation |
| Technical monitoring | Compliance certification |
| This may require review by your privacy advisor | This is legal advice |
| Detected · Not detected · Could not be determined | Compliant · Non-compliant · Pass/Fail |

Approved phrases live in `packages/shared/src/copy/terminology.ts`; `scripts/check-terminology.ts`
greps the tree for the forbidden list. Full table: Part I §1.12.

## Next.js 16.3.3 — what differs from training data

Read `node_modules/next/dist/docs/` before writing framework code. The traps that bite most
often in this codebase:

- **`middleware.ts` is gone** → write `src/proxy.ts`. Node runtime only; setting `runtime`
  inside a proxy file **throws**. `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`.
- **The proxy does not reliably cover Server Actions** (they POST to the invoking route).
  Re-check authorization **inside every Server Action** — never delegate it to proxy matchers.
- **`cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are Promises.**
  `const { id } = await params`. Client Components read via React `use()`.
- **Turbopack is the default for `next dev` AND `next build`.** A custom `webpack` config
  makes `next build` fail — use `turbopack.*` config keys.
- **`next lint` is removed**, and the `eslint` key in `next.config` is removed. Use
  `npm run lint` (eslint flat config).
- **`revalidateTag(tag, profile)` takes two arguments.** The single-arg form is a TS error.
- **`runtime = 'edge'` is deprecated.** Everything stays on Node — required anyway by Prisma,
  Redis and Playwright.
- **`PageProps<'/route'>`, `LayoutProps<'/route'>`, `RouteContext<'/route'>` are global** — no
  import. They require `next dev` / `next build` / `next typegen` to have run.
- **Route Handler `GET` is not cached by default.** Do not cargo-cult `dynamic = 'force-dynamic'`.
- **`cacheComponents` stays OFF for v1.** A tenant-scoped dashboard is request-time by nature.
- **Every parallel-route slot needs an explicit `default.tsx`** or the build fails.
- **`after()` throws if you call `cookies()`/`headers()` inside it in a Server Component.**
  Read request state first and close over the values.
- Removed entirely: AMP, `serverRuntimeConfig`/`publicRuntimeConfig`, `experimental.dynamicIO`,
  `experimental.useCache`, `experimental.ppr`. Do not reference these.

The full verified table is `PLAN.md` Part 0 §0.4 and is binding.

## Engineering conventions

**Code**
- TypeScript `strict: true`. `any` requires an inline justification comment and a lint
  suppression that names the reason.
- No business logic inside React components. Components render; `packages/*` and
  `src/server/*` decide.
- Domain-oriented modules, small and focused. Centralized Zod validation, centralized
  authorization, centralized error handling.

**API**
- Every input validated by a Zod schema before business logic runs.
- Every protected route authenticated; every tenant resource authorized against `agencyId`.
- Stable machine-readable error codes; documented rate limits; idempotency wherever
  repetition would duplicate state.

**Database**
- Tracked Prisma migrations only. Never `db push` against a deployed environment.
- No destructive migration without a reviewed expand/contract sequence (Part X §10.9).
- Every foreign key declared, every hot query path indexed, transaction boundaries explicit.

**Scanner**
- Never trust a target URL. SSRF guard on every navigation **and every redirect hop**.
- Browser workers isolated, resource-limited, timeout-bounded. Every phase wrapped in
  `try/finally` that closes the page, closes the context and releases pool capacity — a
  leaked context takes down a worker within hours.
- Every finding traceable to stored evidence.

**UI**
- Design tokens are semantic CSS custom properties in `globals.css` via Tailwind v4
  `@theme inline`. There is no `tailwind.config.js` and there should not be one.
- Severity is never conveyed by colour alone — colour **plus** icon **plus** text (WCAG 1.4.1).
- Every state is designed before a screen is done: loading (skeletons shaped like the real
  content, never a full-page spinner), empty, error, partial, success.
- User-facing strings live in `packages/shared/src/copy/en.ts` behind a `t()` helper. No
  string literals in JSX — this keeps a future `[locale]` segment cheap.
- Dates and numbers through `Intl.DateTimeFormat` / `Intl.NumberFormat` with an explicit
  locale. Timestamps stored in UTC, displayed in the user's (else the agency's) timezone.

## Pending scaffold cleanups

Two known defects inherited from `create-next-app`, both specified in Part XI §11.2:

- `src/app/globals.css` sets `font-family: Arial, Helvetica, sans-serif` on `body`. This
  **overrides the font variable** and must be removed when the type system lands.
- The Geist fonts are to be replaced with self-hosted Inter Variable + JetBrains Mono via
  `next/font/local`. Self-hosting is a privacy requirement, not a preference — a privacy
  product that ships its users' IPs to a font CDN is indefensible.

## Commands

Package manager is **npm** (`package-lock.json`, lockfileVersion 3).

```bash
npm run dev      # next dev (Turbopack)
npm run build    # next build (Turbopack)
npm run start    # next start
npm run lint     # eslint, flat config — `next lint` no longer exists
```

## Definition of done

A change is done when: it matches the relevant `PLAN.md` part; inputs are Zod-validated;
tenant resources are `agencyId`-scoped; loading, empty, error and partial states exist;
no banned terminology appears in any user-visible string; `npm run lint` and `npm run build`
both pass; and any new user-facing claim traces to recorded evidence.

## Do not

- Do not remove the `nextjs-agent-rules` block above — `next dev` re-adds it, so deleting it
  only produces a dirty tree. Commit it with your work.
- Do not add a `tailwind.config.js` or a `webpack` key to `next.config.ts`.
- Do not let an LLM decide a fact the scanner is responsible for.
- Do not widen scope into SEO, performance, accessibility or security scanning — explicitly
  out of scope (Part I §1.11).
- Do not commit or push unless asked.
