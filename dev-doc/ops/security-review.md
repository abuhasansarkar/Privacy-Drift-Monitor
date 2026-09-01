# Security review

> **Plan ref:** Part X §10.1–§10.6, Part XII §12.3 (Phase 7 task 7.1), §12.5
> **Reviewed:** 2026-09-01 · **Scope:** the Phase 6 + 7 diff and the surfaces it touches

## Findings

Each one was found during this phase, each is fixed, and each is here because the failure was
**silent** — the code worked and the tests were green.

### 1. The SSRF guard had no call site inside the scanner — CRITICAL, fixed

`assertSafeUrl` ran once, in the web app, when a URL was submitted. `assertSafeRedirect` and
`MAX_REDIRECT_HOPS` were written, exported and unit-tested, and **called from nowhere**. Two
live vectors:

- **R4, DNS rebinding.** `attacker.com` resolves public when the app validates it and
  `169.254.169.254` a second later when Chromium resolves it again.
- **R5, redirect.** A perfectly public host answers `302` to `http://127.0.0.1:6379/`.

The fixture suite passed *because* nothing was enforced. The free public scanner turns both from
"an authenticated customer could probe our network" into "anyone on the internet can", which is
why it was found while building it.

**Fixed:** one `page.route` handler (shared with media blocking — two `route("**/*")`
registrations silently mean only one runs), `navigate()` re-checks the entry URL, hop limit
enforced. `urlGuard` is injectable **only** so §4.15's 127.0.0.1 fixtures can run; the default
is the real guard, so a forgotten parameter fails closed. Nine assertions in
`packages/scanner/src/__tests__/ssrf-navigation.test.ts`.

### 2. Security headers were absent from every auth redirect — MEDIUM, fixed

Set in `proxy.ts`, they never reached a response Clerk's `auth.protect()` produced — which is
every unauthenticated hit on `/app` and `/admin`. Moved to `next.config.ts`'s `headers()`, which
Next applies to that redirect too. CSP stays in the proxy because it needs a per-request nonce.

### 3. No CSP at all — MEDIUM, fixed

§10.1 specified one; none was set. Now two policies, and the split is forced by a genuine
conflict: a nonce requires dynamic rendering, and §3.2 requires the marketing pages to be
prerendered. Dynamic surfaces get the strict nonce policy; static marketing gets the same policy
with `'unsafe-inline'`, which is defensible **only** because those pages render no
user-controlled data — every string comes from `copy/en.ts` or `content/`. `/free-scanner/[token]`,
which renders data derived from a third-party site, is dynamic and gets the strict policy.

Two things learned wiring it, both recorded in `src/proxy.ts`:

- `'strict-dynamic'` makes browsers **ignore host allowlists**, so it broke Clerk outright.
  §10.1's own policy names hosts explicitly and does not include it.
- `worker-src 'self' blob:` is required and is not in §10.1's list; Clerk builds its session
  worker from a blob URL.

### 4. Six design tokens failed WCAG AA contrast — MEDIUM, fixed

Not conventionally a security finding; included because it is an access failure with the same
shape as the others — invisible, systemic, shipped. `--muted-foreground` at 4.39:1 is the
most-used pair in the product. Measured ratios are recorded beside each token in `globals.css`.

### 5. Sentry would have been silently inert — LOW, fixed

`process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN`: `??` does not fall through on
the **empty string**, and `.env.example` ships both declared and blank. Setting only
`SENTRY_DSN` would have produced no error reports and no way to tell from outside.

## Threat model review (§10.1)

| Threat | Control | State |
|---|---|---|
| SSRF | §10.3 guard at submission **and** every navigation and redirect hop | ✅ Fixed this phase |
| Tenant escape | `agencyId` column, `forAgency()` extension, an ESLint rule, and a cross-tenant suite | ✅ 19 tenancy assertions; every model classified exactly once (a registry test failed until `FreeScanBlocklist` was classified) |
| Authz bypass | `requirePermission` in every action and handler; admin re-checks in all three places | ✅ Tested at handler level, not just layout |
| XSS | React escaping; `dangerouslySetInnerHTML` only over our own constants (JSON-LD, the theme script); strict CSP on dynamic surfaces | ✅ |
| CSRF | Next 16's built-in Origin/Host check on Server Actions; webhooks use signatures | ✅ |
| Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | ✅ Asserted in E2E |
| Webhook forgery | Signature verified **before** the body is parsed | ✅ Stripe and Clerk; ⚠️ neither exercised with a live signed event |
| Enumeration | 404 not 403 cross-tenant; portal auth always 204; the SSRF message is deliberately vague | ✅ Asserted in E2E |
| Secret exposure | Secrets from env; `NEXT_PUBLIC_*` only for genuinely public values; Sentry redaction | ✅ 8 redaction assertions |
| Abuse (free scanner) | Turnstile, IP + global domain limits, circuit breaker, isolated queue, blocklist | ✅ 10 assertions |
| Dependency vulnerabilities | `npm audit` | ⚠️ Accepted — below |

## Accepted risk: `deepmerge-ts` in the Prisma CLI

`npm audit` reports 3 high findings, all one advisory: `deepmerge-ts <8.0.0` stack exhaustion on
recursive object graphs, reached via `prisma` → `@prisma/config` → `deepmerge-ts`.

**Not fixable by override.** `@prisma/config@6.19.3` pins the exact version `7.1.5`; npm
`overrides` in both the flat and nested form leave the tree unchanged.

**Reachability:** `prisma` is a **devDependency** — the CLI, not the runtime. Production ships
`@prisma/client`, which does not depend on `@prisma/config`. `@prisma/config` is loaded only to
read a `prisma.config.ts`, **and this repository has none**. The advisory is a denial of service
triggered by hostile *config* input; the only input is a file in our own repository.

**Accepted** with these conditions:

- [ ] Re-check when Prisma releases a version depending on `deepmerge-ts@^8`
- [ ] CI runs `npm audit --audit-level=high` and this advisory is the only permitted exception
- [ ] Revisit immediately if a `prisma.config.ts` is ever added

## What this review did NOT cover

- **The webhook signature paths have never seen a real signed event.** `STRIPE_WEBHOOK_SECRET`
  and `RESEND_WEBHOOK_SECRET` are unset; the handlers fail closed, which is correct and
  unproven. The Clerk webhook has never received a live event either.
- **No penetration test.** This is a code review plus an automated vector suite.
- **No production infrastructure review** — container hardening, network policy, secret storage
  and the deploy pipeline are §10.7/§10.9 and need infrastructure that does not exist.
- **Manual screen-reader testing** is outstanding (§7.6); axe covers roughly a third of WCAG.
