# Feature 01 — Tenancy, Auth, RBAC & Audit

> **Phase:** 0–1 · **Priority:** P0 · **Effort:** M+M+S+S · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part V (schema, tenancy), Part VI §6.1–§6.3 (auth, RBAC), Part 0 §0.2 P3

## What it is

Agency accounts, team members with roles, invitations, and the enforcement layer that makes
Agency A structurally unable to reach Agency B's data. Plus the audit log that records who
did what.

## Why it exists

The buyer is an agency owner with 3–50 staff (Persona A). Account managers, developers and
viewers need different rights over the same portfolio. And tenant isolation is principle P3 —
**enforced at the data-access layer, not by convention.**

## Dependencies

Phase 0 database and Clerk integration. Nothing else depends on convention here — everything
downstream depends on `forAgency()` being correct.

## Scope

**In:** Agency accounts · Clerk (email + password, Google OAuth, magic link) · Clerk
Organizations ↔ Agency mapping · team members · roles · invitations with optional
website-scope restriction · seat limits · audit log · session management · 2FA enforcement
at the org level.

**Out (v1):** SSO/SAML · IP allowlist (V2 placeholder) · API keys (V1.5 placeholder,
rendered as a disabled state).

## Build steps

- [ ] `packages/database/src/tenant.ts` — `forAgency(agencyId)` factory. **This is the single
      enforcement point.** Every repository takes a tenant-scoped client, never the raw one.
- [ ] Repository layer in `packages/database/src/repositories/*` — the only place raw Prisma
      is used
- [ ] **Tenant isolation test suite covering every model, including nested relations.** Write
      it as a table-driven test that enumerates models so a newly added model fails until it
      is covered
- [ ] `packages/shared/src/permissions.ts` — the RBAC matrix, `can(role, permission)`, shared
      by UI and server so they can never disagree
- [ ] `server/auth/context.ts` — `requireAgencyContext`, `requirePermission`
- [ ] `<Can>` component for UI gating — **presentation only; the server check is the real one**
- [ ] Clerk webhook sync (user created/updated/deleted → `AgencyMember`)
- [ ] Invitations: create, resend, revoke, accept. `/signup?invitation=<token>` binds the new
      user to the inviting agency and pre-fills the email; **the token is validated
      server-side before Clerk renders**
- [ ] Team page: members table, role change, remove, pending invitations, seat count vs. plan
      limit with an upgrade prompt at the ceiling
- [ ] Audit logging service, wired into **every** mutating operation
- [ ] Settings → Security: active sessions, 2FA enforcement, audit log viewer with filters and
      CSV export

## Roles

Owner · Admin · Manager · Developer · Viewer. The matrix lives in `permissions.ts`; the
per-page expectations are in Part III (each page spec names its permissions). Examples that
catch people out:

- A Viewer never sees Billing in the sidebar **and** is blocked server-side from it
- Ignoring an issue is Manager+ **and requires a mandatory reason**
- Evidence export is permission-gated **and audit-logged**
- Website archive/delete is Admin+; "Scan now" is Developer+

## Acceptance criteria

- [ ] A second agency cannot see the first's data — asserted in tests across every model
- [ ] Every role sees the correct navigation and is blocked **server-side** from actions it lacks
- [ ] The audit log records website creation (and every other mutation)
- [ ] An invitation binds the new user to the correct agency
- [ ] Seat limits block at the ceiling with an upgrade prompt
- [ ] Authorization is re-checked **inside every Server Action**, not delegated to the proxy

## Tests required

| Level | What |
|---|---|
| Unit | Permission matrix, every role × every permission |
| Integration | Tenant isolation across every model + nested relations; API route handlers with a mocked Clerk session |
| E2E | Team invite → accept; RBAC (each role sees/does the right things) |

## Failure modes

| Mode | Handling |
|---|---|
| Clerk outage | New logins fail; **existing sessions continue** (JWT-based). Status banner. Portal access is unaffected — separate auth |
| Session but no agency | Redirect to `/app/onboarding` |
| Suspended agency | Redirect to `/app/billing?suspended=1` |

## Traps

- **Server Actions POST to the invoking route, so `proxy.ts` does not reliably cover them.**
  Re-check authorization inside every action. This is the most likely authz hole in the app.
- A shared cache keyed by anything other than `agencyId` is a cross-tenant leak waiting to
  happen (see also the branding cache in feature 14).
- Part XII §12.8 assumption 13: the Prisma tenant extension is *assumed* equivalent to
  Postgres RLS for our threat model. **Revisit before handling regulated client data.**
