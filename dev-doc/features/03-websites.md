# Feature 03 — Websites

> **Phase:** 1 (CRUD, list, wizard) + 3 (detail tabs) · **Priority:** P0 · **Effort:** L + XL · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part III §3.5, §3.6, §3.8, Part V (Website model)

## What it is

The core managed object. CRUD, portfolio list (table + grid), filters, bulk actions, groups,
CSV import/export, the 4-step add wizard, and the 11-tab detail page.

## Why it exists

Persona A manages 10–200 client sites. The list must scale to 200 rows with useful filtering;
the detail page must serve three different personas (owner, account manager, developer) from
one URL.

## Dependencies

Features 01 (tenancy), 02 (clients), **04 (URL validation + SSRF guard — build first)**.
Detail tabs depend on features 05–11.

## Scope

**In:** CRUD · validation · grouping · pause/resume · archive · CSV import/export · scan
frequency/priority · monitored page list · alert profile · per-site ignore rules · custom
consent adapter overrides · basic-auth credentials for staging sites.

**Out (v1):** sitemap-driven page discovery (V1.1) · full-site crawling.

## Data model notes

- Store `registrableDomain` (eTLD+1 via the Public Suffix List) as a **separate indexed
  column** — the drift engine and third-party classification both need it.
- Store the canonical form the server actually reached after redirects, and `originalUrl`
  separately.
- Basic-auth credentials are **encrypted at rest, Admin+ only**.

## Build steps — list (Phase 1)

- [ ] Table view: checkbox · Website (favicon + domain + name) · Client · Status · Health
      Score pill · Open Issues (severity-split badges) · Trackers · Last Scan · Next Scan · `⋯`
- [ ] Grid view: screenshot thumbnail, domain, score ring, issue counts, last scan
- [ ] Filters: search (debounced 300 ms) · client · group · status · health-score range ·
      has-critical-issues · scan frequency · last-scan-before
- [ ] **Filters are URL-serialized** (`?client=x&status=active`) so views are shareable
- [ ] Sort: health score, last scan, open issues, domain, date added
- [ ] Bulk actions with a selection-aware toolbar: Scan now · Pause · Resume · Assign to
      client · Move to group · Change frequency · Export selected · Archive
- [ ] Bulk scan checks entitlement capacity first: *"12 of 15 queued — monthly scan limit reached."*
- [ ] CSV import with preview (ready / warning / error per row) and a downloadable template
- [ ] CSV export
- [ ] Empty state + mobile card layout + bottom-drawer filters

## Build steps — add wizard (Phase 1)

Four steps. The full flow diagram and the **validation error matrix** are in Part III §3.6 —
implement every row of that matrix, they are distinct user messages.

- [ ] **Step 1 URL** — server-side validation via a Server Action (`validateWebsiteUrl`) so
      the SSRF guard and DNS resolution run where they can be trusted. Live status line:
      *Checking DNS… Checking reachability… Looks good.*
- [ ] Normalization per `packages/shared/src/url/normalize.ts`: lowercase scheme and host,
      strip default ports, strip fragment, strip trailing slash on root, **preserve a
      user-supplied path**, upgrade `http://` → `https://` for the probe (fall back to http
      and raise `PDM-R022` insecure-transport, Medium), **do not strip `www`**
- [ ] **Step 2** — client combobox with inline create, optional group, internal label, notes
- [ ] **Step 3** — frequency (plan-gated) · priority (High plan-gated) · additional pages ·
      alert profile
- [ ] **Step 4** — review, "Run first scan now" (default on), Create
- [ ] On create: persist, write an `AuditLog` entry, enqueue a **baseline scan at HIGH
      priority**, redirect to detail with a live progress panel

## Build steps — detail page (Phase 3)

Header (favicon, domain, client chip, status, score ring with delta, actions), sub-header
metadata, and 11 URL-driven tabs (`?tab=`):

- [ ] Overview · [ ] Issues · [ ] Trackers · [ ] Cookies · [ ] Consent · [ ] Changes ·
      [ ] Scans · [ ] Evidence · [ ] Reports · [ ] AI · [ ] Settings

Each tab's contents are specified in Part III §3.8 — read it rather than inferring. The
Consent tab (feature 06) and Changes tab (feature 10) are the product's signature screens.

## Acceptance criteria

- [ ] Invalid, private-IP and unreachable URLs produce the **correct distinct** errors
- [ ] The website persists with `registrableDomain`
- [ ] An initial scan is queued at high priority
- [ ] The action is audit-logged
- [ ] The entitlement limit blocks with an upgrade prompt (*"You've reached your plan's
      website limit (25 of 25)"*)
- [ ] Adding an already-monitored site is blocked with a link to the existing record
- [ ] A redirect to a different registrable domain asks which to monitor
- [ ] Every tab is linkable and back-navigable

## Tests required

| Level | What |
|---|---|
| Unit | URL normalization, every row of the validation error matrix |
| Integration | CSV import incl. duplicates and malformed rows; bulk actions under entitlement limits |
| E2E | Add website incl. invalid URLs; bulk scan hitting the plan ceiling |

## Traps

- `www.x.com` and `x.com` can behave differently — never strip `www`.
- A TLS certificate problem is an **allow-with-acknowledgment**, not a block.
- 401/403 and bot challenges are allow-with-warning; the site is still worth monitoring
  partially.
- Redirect chain > 3 blocks the probe but allows a manual final URL.
