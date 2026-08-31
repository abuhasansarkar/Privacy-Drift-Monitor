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

**Phases 0–4 are complete. `npm run verify` passes: lint, typecheck,
terminology (318 files), 452 tests, `next build`.** Both processes have been
started and exercised against the docker-compose stack.

| | |
|---|---|
| Built and exercised | `packages/{config,database,shared,schemas,scanner,analysis,storage,notifications,email,reports}`, `worker/` (scan + analysis + notification + email + report + digest, with a scan pool and a **separate** report browser), the `(marketing)` / `(auth)` / `(app)` / `(portal)` route groups, the scan pipeline, the F01–F30 fixture matrix, all 25 rules, drift, scoring, alerts, the five report types, the client portal, the four legal documents |
| Built, **never run against the real dependency** | Resend (no `RESEND_API_KEY`: every send records as `simulated`, visibly, in Alerts → History), the Resend delivery webhook, the Clerk webhook, CI |
| Does **not** exist | `packages/{ai,billing,ui}`, billing and Stripe, the free public scanner, `/admin`, `/app/ai`, `/app/billing`, `/app/help`, `/pricing`, `/blog`, `/resources`, `/about`, `/contact`, shadcn |

### Three things here are CONTRACTS, not labels

Each was found mis-numbered once, and each failure was **silent** — the code
worked, the tests were green, and the green meant nothing.

| Contract | Where | What a mismatch costs |
|---|---|---|
| Fixture ids `F01`–`F30` | §4.15, `packages/scanner/src/testing/fixtures.ts` | "F28 passes" stops meaning "no spurious drift" |
| Rule ids `PDM-R001`–`PDM-R025` | §4.11, `packages/analysis/src/rules/` | Renaming one orphans every `Issue` row that stores it |
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
5. **`server-only` throws in vitest**, because outside a bundler it resolves to
   the client entry whose job is to throw. `test/server-only-stub.ts` is aliased
   in `vitest.config.ts` so `src/server/**` can be tested directly.

`pnpm-workspace.yaml` is an inert tombstone awaiting deletion; the workspace is npm.

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

`dev-doc/` reorganizes the plan into build order: `dev-doc/phases/` is the step-by-step
sequence (Phase 0 → 7) and `dev-doc/features/` holds one working sheet per feature with build
steps, acceptance criteria and failure modes. Start there to find *what to do next*; go to
`PLAN.md` for the full specification of *how*. Tick the checkboxes as work lands.

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
Never use pnpm or yarn here — `pnpm-workspace.yaml` is an inert tombstone pending deletion.

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
