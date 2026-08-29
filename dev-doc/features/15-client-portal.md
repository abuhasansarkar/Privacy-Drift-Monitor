# Feature 15 — Client Portal

> **Phase:** 4 · **Priority:** P1 · **Effort:** L · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part III §3.13, Part VI §6.10 (portal security)

## What it is

A separate, deliberately smaller read-only surface at `/portal` where the agency's client
(Persona D) can see monitoring status, current items, and download reports. Separate session,
separate auth, agency-branded.

## Why it exists

Persona D is non-technical and "never logs into anything if she can avoid it." She needs to
know the site is watched and to have something to show her own boss. For the agency it is
proof of work — JTBD J8, *"let me sell this as a service line."*

## Dependencies

Features 02 (clients), 11 (score), 14 (branding + reports). Gated by the `CLIENT_PORTAL` flag.

## Pages

| Page | Contents |
|---|---|
| `/portal` | Branded header · score gauge with **plain-language interpretation** · monitoring status ("Monitored daily · last checked 3 hours ago") · items needing attention by severity · recent changes in plain language · latest report download |
| `/portal/issues` | Simplified list; severity as plain words; the static rule copy only; status; date. Detail shows the client-safe explanation and, if generated, the AI **client summary** |
| `/portal/reports` | Report list, download PDFs |
| `/portal/scans` | Date, status ("checked successfully" / "partially checked"), score. No technical detail |
| `/portal/settings` | Contact details, notification preferences. Nothing else |

## Never exposed in the portal

This list is a **security requirement**, not a UI preference:

internal notes · agency-internal issue assignments · rule IDs · raw network requests · cookie
values · evidence exports · other clients' anything · agency billing · AI cost data · scanner
version details · developer fix guidance.

## Build steps

- [ ] Magic-link authentication with expiry
- [ ] Portal sessions **scoped to one client**, entirely separate from the Clerk agency session
- [ ] Invitation, resend, revoke — **revocation invalidates sessions immediately**
- [ ] **Client-safe serializers** — the forbidden fields must be *structurally absent* from
      the response payload, not hidden in the template
- [ ] Plain-word severity mapping: Needs attention / Worth reviewing / Informational
- [ ] Branding resolution per render, `agencyId`-scoped (see feature 14's leakage rule)
- [ ] Portal activity audit logging
- [ ] Five pages, spacious layout, 16px body type (Part XI §11.5 — "spacious where clients look")

## Acceptance criteria

- [ ] A portal user logs in by magic link and sees only their client's data
- [ ] Magic links expire
- [ ] Revocation invalidates sessions immediately
- [ ] **Internal notes, rule IDs and raw evidence are structurally absent** from responses
- [ ] Portal activity is audit-logged
- [ ] Branding is the owning agency's, resolved by explicit `agencyId` query
- [ ] Portal access is unaffected by a Clerk outage (separate auth)
- [ ] The score shows plain-language interpretation with no cross-client comparison

## Tests required

| Level | What |
|---|---|
| Integration | Serializer omits every forbidden field — assert on the JSON, not the render |
| Integration | Session scoping: a portal session for client A cannot read client B |
| Integration | Revocation invalidates in-flight sessions |
| E2E | Portal invite → magic link → view → download |

## Design note

Deliberately different from the app: spacious, larger type, plain language, no monospace, no
tables of technical values. Part XI §11.1 principle 3 — *"density where experts work, spacious
where clients look."* See `UI_DESIGN_PROMPTS.md` §7.

## Traps

- The temptation is to reuse the app's issue serializer with a `hideInternal` flag. Don't —
  a flag defaults wrong exactly once and leaks internal notes to a client. Build a separate
  client-safe serializer.
- Custom domains (`privacy.agency.com`) are explicitly **out for v1** (§12.9 Q2). Path-based
  `/portal` only. Revisit at 100 customers.
- The score is visible by default but agencies can disable it per client (§12.9 Q6).
