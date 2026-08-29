# Feature 02 — Clients

> **Phase:** 1 · **Priority:** P0 · **Effort:** M · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part III §3.7, Part V (Client model)

## What it is

Client records that group websites together for reporting, portal access and billing
reference. A client owns many websites; a website belongs to one client.

## Why it exists

Sites must roll up to a billable client. Persona A resells monitoring per client, so
per-client rollups, per-client reports and per-client portal access are the commercial unit —
not the website.

## Dependencies

Feature 01 (tenancy). Blocks: feature 03 (websites assign to clients), 14 (reports scoped to
a client), 15 (portal is client-scoped).

## Scope

**In:** CRUD · list with filters · detail with six tabs · website assignment · logo · primary
contact · billing reference · internal notes · portal enable/disable · archive.

**Out:** client-level billing (we bill the agency, not the client) · client sub-users beyond
the portal.

## Data model

`Client { id, agencyId, name, slug, logoUrl?, contactName?, contactEmail?, contactPhone?, notes?, portalEnabled, archivedAt? }`

Full definition in Part V. `notes` is **internal only** — never shown in the portal or in
reports. Enforce that in the serializer, not in the template.

## Build steps

- [ ] Prisma model + migration + repository
- [ ] Zod schemas for create/update
- [ ] List page: table — Client (logo/initials + name) · Websites count · Health (average
      score) · Open Issues · Portal Access badge · Last Report · actions
- [ ] Filters: search, has-portal-access, has-critical-issues; sort by name/health/site count
- [ ] Detail page with six tabs:
  - [ ] **Overview** — aggregate health, site count, open issues by severity, recent activity,
        next scheduled report
  - [ ] **Websites** — assigned sites, assign/unassign
  - [ ] **Issues** — issues across all this client's sites
  - [ ] **Reports** — reports scoped to this client; generate new
  - [ ] **Portal** — enable/disable, invited portal users, invitation status, revoke access,
        portal activity log
  - [ ] **Settings** — name, logo, contact, billing reference, internal notes, archive
- [ ] Inline "Create new client" from the Add Website wizard's client combobox
- [ ] Empty state: *"No clients yet. Clients group websites together for reporting and portal
      access."*

## Permissions

View: all roles · Create/edit: Manager+ · Portal toggle: Admin+ · Archive: Admin+.

## Acceptance criteria

- [ ] A client can be created, edited and archived
- [ ] Websites can be assigned and unassigned
- [ ] Aggregate health and issue counts are correct across the client's websites
- [ ] Internal notes are structurally absent from portal and report payloads
- [ ] Archiving a client does not delete its websites' history

## Tests required

| Level | What |
|---|---|
| Integration | Repository under tenant scoping; aggregate rollups |
| Integration | Serializer omits `notes` for portal and report contexts |
| E2E | Add client → assign website → see rollup |

## Traps

- Aggregate health is an **average across the client's websites**; decide and document the
  behaviour when a website has never been scanned (exclude it rather than counting it as 0,
  or the number misleads).
- Archive ≠ delete. Reports and scan history must remain retrievable.
