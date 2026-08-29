# Feature 08 — Tracker Detection & Vendor Database

> **Phase:** 3 · **Priority:** P0 · **Effort:** L + M · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part IV (classifier), Part III §3.11 (portfolio inventory), §3.12 (admin CRUD)

## What it is

The vendor database (~250 seeded vendors with categories, risk levels, domain/script/cookie
patterns) and the classification engine that turns raw artifacts into **named vendors with
confidence**.

## Why it exists

"Raw domains mean nothing to an account manager." `connect.facebook.net` is noise;
"Meta Pixel · Marketing · High risk" is something Persona B can explain to a client. This is
also moat component #3 — a vendor database refined by real observations.

## Dependencies

Feature 07 (evidence). Blocks: features 09, 10, 11.

## Public interface

```ts
classify(artifacts, vendors): Detection[]   // trackers/classifier.ts
```

## Build steps

- [ ] Vendor schema: name, category, risk, domain patterns, script patterns, cookie patterns,
      docs URL, confidence, aliases
- [ ] **Seed ~250 vendors** — this must be done before launch or every third party reads
      "unknown" (it is on the launch checklist for exactly that reason)
- [ ] Classification engine with **confidence scoring and corroboration**
- [ ] Unknown third parties are recorded as **unknown vendors**, not dropped — they are the
      input to the admin unknown-domain queue and to the V1.5 AI classification feature
- [ ] Admin vendor CRUD + bulk JSON import/export
- [ ] **Unknown-domain queue** in admin: observed domains matching no vendor, ranked by
      frequency across tenants, with one-click "create vendor from this domain"
- [ ] Website detail → Trackers tab (Part III §3.8)
- [ ] Portfolio inventory `/app/trackers` + vendor detail `/app/trackers/[id]`

## The critical column

On the Trackers tab, **"first seen under consent state"** is the column that carries the
product's value. `Before consent` renders in red. Everything else on that table is context.

## Acceptance criteria

- [ ] Trackers classify to named vendors with confidence
- [ ] Unknown third parties are recorded as unknown vendors
- [ ] Corroboration is required before a detection can drive a Critical finding
- [ ] The unknown-domain queue ranks by cross-tenant frequency
- [ ] An admin can add a vendor and it takes effect without a deploy
- [ ] Portfolio inventory correctly rolls up "websites affected" per vendor

## Tests required

| Level | What |
|---|---|
| Unit | Classification against known artifacts; confidence scoring; alias resolution |
| Integration | Admin CRUD; bulk import; unknown-domain aggregation across tenants |

## Traps

- A single weak signal (one domain match) must not produce high confidence. Corroboration
  across request + cookie + script is what makes a Critical finding defensible — false
  positives are a **Critical-impact** risk.
- Vendors change domains. Aliases and pattern lists need to be editable in admin without a
  deploy, which is why admin CRUD is in the same phase as the seed.
- Do not let the classifier *add* facts — it interprets recorded artifacts only.

## Assumption to validate

§12.8 #7: a ~250-vendor seed keeps the unknown-third-party rate below 15%. **Instrument the
unknown-vendor metric from day one** — it is both a product-quality signal and the backlog
driver for the vendor database.
