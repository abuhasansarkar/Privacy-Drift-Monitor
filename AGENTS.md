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

**Phases 0–18 have landed.** `npm run verify` runs lint, typecheck, terminology,
**env drift** and `next build`.

⚠️ **IT DOES NOT RUN TESTS, BECAUSE THERE ARE NONE.** Commit `2a192cf` deleted 105 test
files (18,380 lines) and `vitest.config.ts`; vitest is not installed. What survives is three
Playwright specs in `e2e/`. The four contracts listed below therefore have **nothing
enforcing them** — restoring that is `dev-doc/tasks/T01` and `T02`, and it blocks everything
else. See `NEW-PLAN.md` for the measured state and `OVERVIEW.md` for the 2026-09-03 audit.

⚠️ **THIS SECTION HAS BEEN WRONG BEFORE, IN THE DIRECTION THAT COSTS MOST.** It
claimed `verify` passed while `build` was failing and two lint errors were
committed; it claimed 25 rules when 50 were registered, six of which could never
fire; it listed `packages/billing` and `/admin` as non-existent long after both
shipped; and it claimed `verify` ran a coverage gate for a suite that had been
deleted. Everything below is dated. If you are about to rely on a line here,
run the gate.

**Measured 2026-09-04:** 58 Prisma models · 52 registered rules (`PDM-R001`–`R052`,
`PDM-X01`–`X02`) · 8 BullMQ queues, all with workers · 89 pages · 33 API route handlers ·
~82,400 lines · **0 unit tests**.

| | |
|---|---|
| Built and exercised | Every `packages/*` (including **`billing`**), `worker/` (scan + analysis + notification + email + report + digest + ai + free-scan + schedulers, with a scan pool and a **separate** report browser), the `(marketing)` / `(auth)` / `(app)` / `(portal)` / `(admin)` / `(onboarding)` route groups, the scan pipeline, the F01–F30 fixture matrix, drift, scoring, alerts, the five report types, the client portal, the free public scanner, Stripe billing, the admin surface, and the AI layer |
| Built, **never run against the real dependency** | The Resend delivery webhook (`RESEND_WEBHOOK_SECRET` unset — the handler fails closed with 401, which is correct), the Clerk webhook, the Stripe webhook, CI |
| Exercised against the real dependency | Resend: a live `portal-magic-link` went through `processEmailJob` and Resend reported `delivered`. With no verified domain, `EMAIL_FROM` points at `onboarding@resend.dev` and delivery is restricted — production needs a verified domain. **OpenAI**: both tiers produce validated, grounded output — `gpt-4o-mini` (standard) and `gpt-5-nano` (advanced) — via `worker/src/ai.smoke.ts` |
| Specified but **NOT wired** | *Nothing currently on this list.* Everything previously recorded here has since shipped — verify each before relying on it: **Outbound webhooks** are wired (`triggerWorkerWebhooks` fires `website.scan.completed` and `privacy_drift.detected` from the scan pipeline in `worker/src/index.ts`; `webhook.job.ts` delivers with HMAC-SHA256 signatures and exponential-backoff retries; `webhook-service.ts` manages endpoints; `/app/settings/api` renders recent deliveries). **Slack** delivers (`packages/notifications/src/slack.ts` via `sendSlackAlert` in `notification.job.ts`, driven by `SLACK_WEBHOOK_URL`). **Public API v1** is live under `src/app/api/v1` with scoped `pdm_live_` keys (websites, scans, reports download, issues). The **WordPress plugin** is at `plugins/wordpress/privacy-drift-monitor/`, the **MCP server** at `packages/mcp`, the **GitHub Action** at `plugins/github-action/`. **Policy extraction** (Module 23, Phase 14) runs as `runPolicyAudit` in the scan pipeline; `PDM-R034` and `PDM-R049` are active and `DORMANT_RULE_IDS`/`RESERVED_RULE_IDS` in `rules.ts` are both empty. |
| Does **not** exist | shadcn. `/app/ai` EXISTS but is behind `AI_ASSISTANT_PAGE`, which defaults off |

### The rule inventory is three lists, not one number

"50 rules" was true and meaningless: R029, R040, R041, R043 and R045 were
registered with an `evaluate()` that returned `[]` under a comment describing
behaviour it did not have. `packages/analysis/src/rules.ts` now separates:

- **`RULES`** — registered and able to fire.
- **`DORMANT_RULE_IDS`** — implemented and correct, waiting on a fact source
  (`PDM-R034`, `PDM-R049` need policy extraction).
- **`RESERVED_RULE_IDS`** — id reserved, no implementation, with the specific
  evidence each would need written next to it.

`rules.test.ts` asserts the lists are disjoint and together cover
PDM-R001…R050. A registered rule that cannot fire is a defect, not a placeholder.

### Three things here are CONTRACTS, not labels

Each was found mis-numbered once, and each failure was **silent** — the code
worked, the tests were green, and the green meant nothing.

| Contract | Where | What a mismatch costs |
|---|---|---|
| Fixture ids `F01`–`F30` | §4.15, `packages/scanner/src/testing/fixtures.ts` | "F28 passes" stops meaning "no spurious drift" |
| Prompt versions `<FEATURE>_V<n>` | §8.7, `packages/ai/src/prompts/index.ts` | The version is in `inputHash`. **Editing a prompt without bumping it serves output from the OLD prompt forever** — the change appears to do nothing and the reason is invisible |
| Rule ids `PDM-R001`–`PDM-R050` | §4.11, `packages/analysis/src/rules/` | Renaming one orphans every `Issue` row that stores it |
| Queue and job ids | §7.2, `packages/scanner/src/queue/queues.ts` | BullMQ rejects a `:` in a job id, at runtime, in production |

All three now have a test that fails the build if one goes missing. Anything
that is ours rather than the plan's carries an `X` prefix (`X01`, `PDM-X01`) so
nobody mistakes it for a plan row.

**Reporting rule, unchanged:** do not describe something as working on the
strength of the code existing. `dev-doc/phases/phase-4-agency-workflow.md` is
the model — it marks each acceptance criterion ✅ only where a test or an
observed run backs it, and 🟡 otherwise.

### Defects that only appeared when the processes were actually started

All fixed, all worth knowing before you write similar code:

1. **BullMQ rejects a job id containing `:`** — the same trap already documented
   for queue *names*. `toJobId()` rewrites at the enqueue boundary; database
   keys keep their colons.
2. **`export *` in a `.ts` barrel is invisible to Node's ESM loader under tsx.**
   The worker died at boot on a symbol that demonstrably existed. Barrels
   consumed by `worker/` must re-export explicitly.
3. **esbuild transformed the report `.tsx` templates with the classic JSX
   runtime** and threw `React is not defined` at render time, on files `tsc` was
   happy with. Those three files carry an explicit `import * as React`.
4. **The generic consent adapter did not recognise "Deny"** — which is what
   Usercentrics actually renders. Fixture F07 caught it.
5. **`EMAIL_FROM` is RFC 5322, not a bare address.** `.env.example` is the
   contract and ships `"Name <addr>"`; the transport wrapped it a second time.
   No test caught it, because with no API key every send short-circuits to
   `simulated` before the From header is built — the whole email suite was green
   while the one thing that talks to the provider was malformed.
6. **A permanent provider rejection was retried eight times.** 403 from an
   unverified domain answers the same way every attempt; `EmailRejectedError`
   now splits deterministic rejections from transient ones, as the scanner
   already does for scan errors.
7. **White-label was given away for free**, and the entitlement was a hardcoded
   literal at seven call sites — one of them an EXPRESSION that a grep for the
   literal missed. §6.9 says enforcement lives in the resolver; it now does
   (`whiteLabelEntitlement`). **A delivered email found this, not a test.**
8. **The SSRF guard had no call site inside the scanner.** `assertSafeUrl` ran
   once, in the web app, when a URL was submitted; `assertSafeRedirect` and
   `MAX_REDIRECT_HOPS` were written, exported, unit-tested — and called from
   nowhere. So DNS rebinding (§10.3 R4) and a 302 to an internal address (R5)
   were both unguarded, and the fixture suite passed *because* nothing was
   enforced. The guard now lives in one `page.route` handler shared with media
   blocking (two `route("**/*")` registrations mean only one runs), `navigate()`
   re-checks the entry URL, and `urlGuard` is injectable **only** so §4.15's
   127.0.0.1 fixtures can run — the default is the real guard, so a forgotten
   parameter fails closed. Found while building the free public scanner, which
   turns both vectors from "a customer could probe our network" into "anyone
   can". See `packages/scanner/src/__tests__/ssrf-navigation.test.ts`.
9. **Six design tokens failed WCAG AA contrast, and every one of them shipped.**
   `axe-core` in the Phase 7 E2E suite found `--warning` at 3.07:1 on its own
   `--warning-muted` background; measuring the rest of the palette found
   `--success` (3.15), `--info` (3.54), `--danger` (4.41), `--severity-high`
   (3.35), `--severity-medium` (2.84), `--severity-low` (3.84) and
   `--muted-foreground` (4.39) all under the 4.5:1 threshold. The last is the
   most-used pair in the product — every caption and neutral chip. All are now
   darkened with the measured ratio recorded beside them in `globals.css`; dark
   mode already passed and is unchanged. **A design system reviewed by eye is
   not a design system that passes**, and none of the unit tests could have
   caught this (that suite has since been deleted — see `dev-doc/tasks/T01`).
10. **`server-only` throws in vitest**, because outside a bundler it resolves to
   the client entry whose job is to throw. `test/server-only-stub.ts` is aliased
   in `vitest.config.ts` so `src/server/**` can be tested directly.
11. **One `headers()` call in the ROOT layout made the entire product dynamic.**
   It read `x-nonce` for the inline theme script. Nothing errored — Next simply
   stopped prerendering, so §3.2's "statically prerendered marketing pages" were
   not prerendered at all (a build emitted `_global-error.html` and nothing
   else), and `proxy.ts`'s careful two-policy CSP was choosing between policies
   for a category of page that no longer existed. It surfaced only because
   `/solutions/[industry]` asserts its own staticness with `dynamic = "error"`
   and failed the build. The theme script is now allowed by **SHA-256**, derived
   from the same constant the component renders, and the root layout reads
   nothing. **The hash goes in the strict policy ONLY** — `'unsafe-inline'` is
   ignored by any browser that sees a hash in the same directive, so adding it
   to the static policy would switch `'unsafe-inline'` off and block Next's own
   prerendered bootstrap scripts.
12. **Six marketing pages shipped behind the login wall.** `/solutions` (+5
   industry pages), `/methodology`, `/security`, `/integrations` and
   `/changelog` were written, styled, linked from the header AND footer — and
   missing from `isPublicRoute`, so `auth.protect()` bounced every signed-out
   visitor to /login. The homepage linked ten dead URLs. Each page rendered
   perfectly when opened by someone already signed in, which is why review
   never caught it. `src/__tests__/marketing-routes.test.ts` now walks
   `content/marketing/nav.ts` against the matcher; the patterns moved to
   `src/lib/public-routes.ts` so a test can read them.
13. **A rule invented a fact and told a customer's client about it.** `PDM-R034`
   raised a HIGH-severity finding reading "<vendor> active on site but omitted
   from privacy policy" by filtering detections to advertising vendors, taking
   the first, and asserting the omission. No policy was fetched, parsed or
   compared — `RuleContext` had no field for one. This is precisely what P1 and
   P6 forbid, and nothing caught it because the output looked plausible. It now
   reads `context.policy.undisclosedVendors` and emits nothing until policy
   extraction exists.
14. **A working resolver, exported, tested, called from nowhere — again.** This
   is defect #8's exact shape. `net/cname.ts` resolves DNS CNAME chains against
   a known-networks list; `PDM-R038` "detected CNAME cloaking" by searching each
   request's HTTP `redirectChain` for the substring `"cname"`. Real cloaking is
   a DNS arrangement that produces no redirect and never contains that string,
   so the rule could not fire on the thing it was named after. Resolution now
   happens **at scan time** (a CNAME changes without notice, so resolving during
   analysis would break replayability) and is stored in `CnameResolution`.

The workspace is npm. `pnpm-workspace.yaml` has been deleted.

## Repository layout — read this before writing a path

There is **no `apps/` directory**. PLAN.md §10.9 supersedes §12.1 on this point:

```
drift-monitor/
├── src/          Next.js app — default create-next-app layout, `@/*` → `./src/*`
├── packages/     pnpm workspace members, shared with the Phase 2 worker
├── worker/       separate Node process — added in Phase 2, does not exist yet
└── package.json  one package; no Turborepo
```

`PLAN.md` §12.1 still prints the old `apps/web/…` tree with a superseded banner on top. Its
**module map and public interfaces remain binding** — only strip the `apps/web/` prefix.
So: `src/proxy.ts`, not `apps/web/src/proxy.ts`.

## Where the plan lives

**`PLAN.md` does not exist.** It was deleted in `6f6059c` together with `PLAN-V2.md`,
`PLAN-V3.md`, `UI_Func.md`, `UI_DESIGN_PROMPTS.md` and the `dev-doc*/` trees. It is not
coming back. Read these instead:

| File | What it is |
|---|---|
| `NEW-PLAN.md` | Measured current state, gap register `G-01`…`G-12`, roadmap phases 19–23 |
| `dev-doc/README.md` | Task index — one small file per task under `dev-doc/tasks/` |
| `OVERVIEW.md` | The 2026-09-03 audit. Historical record, **not** a forward plan |

⚠️ **THE `PLAN.md §x.y` CITATIONS IN THE SOURCE CANNOT BE RESOLVED.** There are ~1,730 of
them. The deleted `PLAN.md` contained 41 sections; 1,315 citations named a section number it
never had, and where numbers collided the topics did not — code cites `§7.1` for BullMQ
queues while `§7.1` was "Consent State Machine", and `§3.2` for the free-scanner blocklist
while `§3.2` was the rule catalogue. The document in the repo was never the document the
code was written against.

**Treat every `§` citation as a hint about intent, never as an authority. Do not add new
ones.** When you need to point at a decision, point at the file and symbol that implements
it — those can be checked.

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

The authority is `node_modules/next/dist/docs/` — read it before writing framework code.

## Clerk v7 (Core 3) — what differs from training data

`@clerk/nextjs@^7` is **Clerk Core 3**, which removed API that every tutorial still shows.

- **`<SignedIn>` and `<SignedOut>` are GONE.** They are not deprecated — they throw at
  render time and return a 500. The replacement is one component:
  `<Show when="signed-in">` / `<Show when="signed-out">`, imported from `@clerk/nextjs`.
  It takes a `fallback` prop. See `src/components/site-header.tsx`.
- `<Show>` resolves auth state **on the server**, so any route that renders it opts out of
  static prerendering. Marketing pages that must prerender (§3.2) need the auth controls in
  a `"use client"` island using `useAuth()` instead.

If a Clerk symbol is not in the installed package, check
`node_modules/@clerk/nextjs/dist/types/index.d.ts` rather than assuming a rename.

## Engineering conventions

**Code**
- TypeScript `strict: true`. `any` requires an inline justification comment and a lint
  suppression that names the reason.
- No business logic inside React components. Components render; `packages/*` and
  `src/server/*` decide.
- **Never import the raw `prisma` client in application code.** Use
  `forAgency(agencyId)` from `@pdm/database/tenant`. `unsafeGlobalClient(reason)` exists for
  schedulers, retention sweeps and admin surfaces, and every call site is justified in review.
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

Package manager is **npm**, using **npm workspaces** (`package-lock.json`, lockfileVersion 3).
Never use pnpm or yarn here.

```bash
npm install
npm run db:generate     # prisma generate — REQUIRED before typecheck
npm run db:migrate      # prisma migrate dev
npm run dev             # next dev (Turbopack)
npm run build           # next build (Turbopack)
npm run lint            # eslint flat config — `next lint` no longer exists
npm run typecheck       # root + every workspace package
npm test                # vitest; DB-backed suites need `docker compose up -d`
npm run check:terminology
npm run verify          # all gates in sequence
```

Workspace-scoped: `npm run <script> -w @pdm/<pkg>`, `npm install <dep> -w @pdm/<pkg>`.

After changing any dependency, run `npm install` and **commit `package-lock.json`** — CI
uses `npm ci`, which fails if the lockfile has drifted.

## Definition of done

A change is done when: it satisfies the acceptance criterion in its `dev-doc/tasks/` file
**and that criterion was run**; inputs are Zod-validated; tenant resources are
`agencyId`-scoped; loading, empty, error and partial states exist; no banned terminology
appears in any user-visible string; `npm run verify` passes; and any new user-facing claim
traces to recorded evidence.

⚠️ `BUILT` (code exists, gates pass) is not `DONE` (acceptance was run, evidence written).
Conflating the two is the specific failure this repo has repeated.

## Do not

- Do not remove the `nextjs-agent-rules` block above — `next dev` re-adds it, so deleting it
  only produces a dirty tree. Commit it with your work.
- Do not add a `tailwind.config.js` or a `webpack` key to `next.config.ts`.
- Do not let an LLM decide a fact the scanner is responsible for.
- Do not widen scope into SEO, performance, accessibility or security scanning — explicitly
  out of scope (Part I §1.11).
- Do not commit or push unless asked.
