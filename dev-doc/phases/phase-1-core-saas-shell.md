# Phase 1 — Core SaaS Shell

> **Goal:** agencies can manage clients and websites. No scanning yet.
> **Dependencies:** Phase 0 · **Status:** ✅ Complete
> **Plan ref:** Part XII §12.3 (Phase 1), Part III §3.3–§3.7, Part VI (auth, RBAC, API)

The product becomes a real multi-tenant SaaS here. Everything in this phase is a prerequisite
for the scanner having somewhere to put its results.

## Tasks

All complete. The table below records what each task actually shipped, because
several differ from the original one-line description.

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 1.1 | Tenant extension `forAgency()` + repository layer + **tenant isolation suite over every model** | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ✅ |
| 1.2 | RBAC: permission matrix, `requirePermission`, `<Can>` component | S | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ✅ |
| 1.3 | AppShell: sidebar, header, breadcrumbs, `⌘K` search, notification bell, user menu | M | [21-design-system](../features/21-design-system.md) | ✅ |
| 1.4 | Onboarding wizard (steps 1–6, 9) | M | [12-dashboard](../features/12-dashboard.md) | ✅ |
| 1.5 | Clients: CRUD, list, detail, assignment | M | [02-clients](../features/02-clients.md) | ✅ |
| 1.6 | Websites: CRUD, list (table + grid), filters, sort, bulk actions, groups, CSV import/export | L | [03-websites](../features/03-websites.md) | ✅ |
| 1.7 | URL validation service + **SSRF guard** with the full test-vector suite | M | [04-url-validation-ssrf](../features/04-url-validation-ssrf.md) | ✅ |
| 1.8 | Add Website wizard incl. the full validation error matrix | M | [03-websites](../features/03-websites.md) | ✅ |
| 1.9 | Team: invitations, members, role changes | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ✅ |
| 1.10 | Settings: general, notifications, security (audit log viewer) | M | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ✅ |
| 1.11 | Audit logging service, wired into every mutating operation | S | [01-tenancy-auth-rbac](../features/01-tenancy-auth-rbac.md) | ✅ |
| 1.12 | Dashboard shell with empty states | S | [12-dashboard](../features/12-dashboard.md) | ✅ |
| 1.13 | Marketing site: home, features, how-it-works, legal pages | L | [20-marketing-site](../features/20-marketing-site.md) | ✅ |

## Order of attack

1. **1.1 first, and prove it.** Tenant isolation is the foundation everything else sits on,
   and retrofitting it is not realistic. The test suite must assert isolation across *every*
   model including nested relations — not spot checks.
2. **1.2 next** — RBAC shapes every subsequent UI decision (a Viewer never sees Billing).
3. **1.7 before 1.8.** The SSRF guard must exist before any code accepts a user-supplied URL.
   It is a Critical-impact risk in §12.7 and it is easier to build the wizard on top of a
   working guard than to retrofit one.
4. **1.3 → 1.5 → 1.6 → 1.8** — shell, then clients, then websites, then the add flow.
5. **1.13 in parallel** — the marketing site shares only the design system, so it can be
   built by anyone, any time after Phase 0.

## Acceptance criteria

From §12.3 and M2 (§12.4).

- [ ] A user completes signup → onboarding → adds a client → adds a website → sees it listed
- [ ] Invalid, private-IP and unreachable URLs are rejected with the **correct distinct** messages
- [ ] A second agency cannot see the first's data — **asserted in tests, not by inspection**
- [ ] Every role sees the correct navigation and is blocked **server-side** from actions it lacks
- [ ] Every list has a designed empty state
- [ ] The audit log records website creation
- [ ] The website persists with `registrableDomain` (eTLD+1 via the Public Suffix List)
- [ ] An initial scan is queued (the job need not run yet — Phase 2 consumes it)
- [ ] The entitlement limit blocks with an upgrade prompt (stub entitlements are acceptable
      until Phase 6; the *enforcement point* must exist)

## Watch out for

- **Server Actions bypass the proxy.** Every action re-checks authorization itself.
- `www` is **not** stripped during URL normalization — `www.x.com` and `x.com` can behave
  differently. Store the canonical form actually reached after redirects, plus `originalUrl`.
- Filters must be URL-serialized (`?client=x&status=active`) so views are shareable and
  back-navigable.
- Marketing pages must not call `cookies()`/`headers()` or they lose static prerendering.


## What landed late, and why it is worth knowing

The first pass through this phase left three gaps that were only found by
re-reading §3.2 and §3.5 against the code:

- **Legal pages** (task 1.13) — all four now exist at `/legal/[doc]`, statically
  prerendered, with a sticky table of contents (§4.11). §3.2 specifies MDX from
  `content/legal/*.mdx`; they are structured TypeScript instead, because these
  four documents are headings and paragraphs and MDX would have cost a
  dependency plus a `next.config` change for no rendering benefit. The table of
  contents is derived from the data rather than parsed out of rendered HTML, so
  an anchor and its entry cannot drift apart.
- **`DISCLAIMER_FULL`** — §3.2 gives the boundary statement verbatim and says
  "do not paraphrase it per surface — import it". It now lives in
  `packages/shared/src/copy/terminology.ts` next to `DISCLAIMER_SHORT`, word for
  word. It passes the terminology gate unchanged.
- **Settings → Security** (task 1.10) — sessions and 2FA are **not**
  reimplemented; Clerk owns authentication, and a second copy of session state
  we do not control would eventually disagree with the real one. The page says
  where the real control is, links the audit log, and shows API keys and the IP
  allowlist as explicitly unavailable rather than as disabled controls.
- **Websites: grid view, client/group filters, CSV export, and the three
  unimplemented bulk actions** (task 1.6) — `scan`, `assignClient` and
  `assignGroup` were in the schema but had no implementation. Groups are created
  by typing a name while moving sites into one; there is deliberately no group
  management screen, because a group with no websites in it is not something
  anyone wants to create.

Both CSV exports guard against formula injection — a leading `=`, `+`, `-` or
`@` is prefixed, because a website label is user-controlled and a spreadsheet
treats those as executable.
