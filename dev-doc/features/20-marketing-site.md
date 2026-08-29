# Feature 20 — Marketing Site & Legal Pages

> **Phase:** 1 (core pages) + 6 (pricing) · **Priority:** P0 · **Effort:** L + M · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part III §3.2 (every public page), Part I §1.12 (terminology)

## What it is

The public `(marketing)` route group: home, features + 4 sub-pages, how-it-works, pricing,
resources/blog/guides, about, contact, and the four legal pages.

## Why it exists

Acquisition. Also the place where the product's **legal boundary** is stated publicly, which
is a launch requirement.

## Dependencies

Design system (feature 21). Pricing depends on feature 17 (plans). Otherwise independent —
this can be built in parallel with almost anything.

## Shared layout rules

- Sticky transparent-on-scroll header · footer with 4 columns + the disclaimer line ·
  **our own cookie banner (we must be exemplary)** · skip-to-content link
- `generateMetadata` per page · canonical URL · `opengraph-image.tsx` · JSON-LD
  `Organization` + `SoftwareApplication` in the root marketing layout
- Analytics `page_viewed` with `{ path, referrer, utm_* }`
- **Static by default — no `cookies()`/`headers()` in marketing pages** or they lose
  prerendering
- Single column below 768 px; nav collapses to a `Sheet` drawer

## Pages

| Page | Purpose | Notes |
|---|---|---|
| `/` | Convert to trial or free scan | 14 sections — see Part III §3.2 for the full list |
| `/features` | Prove technical depth | Sticky sub-nav over 12 feature blocks |
| `/features/[topic]` × 4 | Deep dive | One template: hero · how it works · technical detail · **limitations (honest)** · FAQ · CTA |
| `/how-it-works` | Convince a skeptical technical evaluator | 8-stage scrollytelling + a "what we can and can't see" honesty block |
| `/pricing` | Qualify + convert | Monthly/annual toggle, currency selector, 4 plan cards, comparison table, JSON-LD `Product`+`Offer` |
| `/free-scanner` | Lead gen | Feature 18 |
| `/resources`, `/blog`, `/guides` | SEO | MDX, `generateStaticParams`, JSON-LD `Article` |
| `/about`, `/contact` | Trust + inbound | Contact form: Zod + Turnstile + honeypot → Resend |
| `/legal/*` × 4 | Legal boundary | MDX through one `LegalLayout` |

## The homepage sections that carry the message

1. **Hero** with an inline URL field deep-linking into the free scanner
2. **Problem** — three cards, framing not fear
6. **Privacy Drift** — the differentiator. *"A snapshot tells you today. Drift tells you what changed."*
7. **AI explanations** with explicit trust copy: *"Grounded in recorded browser evidence."*
11. **Social proof** — ⚠️ **until real customers exist this renders a "Built with agencies in
    the UK and EU" trust strip. Never fabricated logos or invented testimonials.**

## Legal pages — launch blockers

| Page | Must contain |
|---|---|
| `/legal/terms` | Service definition, **explicit prohibition on scanning sites you don't control or have permission to scan**, account/payment/trial terms, liability, IP, governing law |
| `/legal/privacy` | What we collect, lawful bases, **sub-processors** (Clerk, Stripe, Resend, OpenAI, host, object storage), retention per data class, DSR rights, transfers, security |
| `/legal/cookie-policy` | Our own cookies enumerated with purpose and duration — **this page must be exemplary; a privacy product with a bad cookie policy is not credible** |
| `/legal/disclaimer` | The central boundary statement (full text in Part III §3.2) |

The disclaimer is also embedded in **every PDF report** and shown at onboarding.

## Acceptance criteria

- [ ] All pages prerender statically (no request-time APIs)
- [ ] LCP < 2.0 s, CLS < 0.1, INP < 200 ms (Lighthouse CI gates the PR pipeline)
- [ ] No banned terminology anywhere in marketing copy
- [ ] No fabricated logos or testimonials
- [ ] Legal pages reviewed by counsel before launch
- [ ] Disclaimer linked from the app, reports **and** portal
- [ ] Our own cookie banner works correctly (we are the example)
- [ ] `/bot` page live explaining who the scanner is and how to allowlist or exclude it

## Tests required

| Level | What |
|---|---|
| CI | Lighthouse budgets on marketing routes |
| CI | Terminology check across `apps/` and content |
| E2E | axe accessibility on the highest-traffic pages |

## Traps

- The `/bot` page is easy to forget and it is on the launch checklist. It is what makes the
  scanner ethically defensible — identifiable, allowlistable, excludable.
- Feature sub-pages each carry a **limitations block**. That honesty is a deliberate trust play,
  not a legal footnote — don't let marketing copy soften it.
- Marketing pages are the most likely place for "compliant" / "violation" language to creep
  in. The CI terminology check is the safety net; don't disable it for content files.
