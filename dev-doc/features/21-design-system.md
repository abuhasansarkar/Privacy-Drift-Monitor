# Feature 21 — Design System, Shell & Accessibility

> **Phase:** 0 (tokens + primitives) → 1 (AppShell) · **Priority:** P0 · **Effort:** M + M · **Value:** 4
> **Status:** ⬜ Not started
> **Plan refs:** Part XI §11.1–§11.8, Part III §3.3 (app shell)

## What it is

Tokens, typography, the shadcn/ui component set, the domain component library, the
authenticated AppShell, and the state conventions (loading / empty / error / partial) that
every screen inherits.

## Why it exists

Part XI §11.1 principle 5: **every state is designed** — loading, empty, error, partial and
success are all specified before a screen is considered done. A design system is how that
becomes cheap instead of repetitive.

## Dependencies

None. Blocks essentially everything with a UI.

## Design principles (Part XI §11.1)

1. **Evidence is always one click away**
2. **Severity is legible at a glance** — colour + icon + text, never colour alone
3. **Density where experts work, spacious where clients look**
4. **Never imply legal certainty** — detected / not detected / undetermined, not pass/fail
5. **Every state is designed**

## Build steps

### Typography
- [ ] **Inter Variable, self-hosted** via `next/font/local` — self-hosting is a *privacy*
      decision as much as a performance one; a privacy product loading third-party fonts is
      indefensible
- [ ] JetBrains Mono for URLs, cookie names, selectors, evidence
- [ ] The 10-token type scale from Part XI §11.2
- [ ] ⚠️ **Delete `font-family: Arial, Helvetica, sans-serif` from `globals.css`** — the
      scaffold sets it on `body` and it overrides the font variable

### Colour
- [ ] All tokens from Part XI §11.3 as CSS custom properties + Tailwind v4 `@theme inline`
- [ ] **No `tailwind.config.js`** — the project is on Tailwind v4 with `@import "tailwindcss"`
- [ ] Full dark-mode remapping of every token
- [ ] Severity scale (critical/high/medium/low/info) **distinct from status colours**
- [ ] Score bands
- [ ] Each severity paired with an icon (`ShieldAlert`, `AlertTriangle`, `AlertCircle`, `Info`,
      `Circle`) and a text label — WCAG 1.4.1

### Components
- [ ] shadcn/ui primitives per the §11.4 inventory
- [ ] Domain components in `components/domain/`: `SeverityBadge` · `ScoreGauge` ·
      `ScoreBreakdown` · `ConsentPhaseMatrix` · `EvidenceCard` · `DriftDiffCard` ·
      `TrackerChip` · `CookieTable` · `RequestTable` (virtualized) · `ScanProgressPanel` ·
      `AiOutputCard` · `EntitlementGate` · `Can` · `EmptyState` · `PartialScanNotice`
- [ ] `packages/ui` for components shared between the web app and the report renderer

### AppShell
- [ ] Collapsible sidebar persisted to `localStorage`, nav **filtered by role**
- [ ] Header: breadcrumbs · `⌘K` command palette over websites/clients/issues/trackers ·
      live scan-activity indicator · notification bell · user menu
- [ ] Keyboard: `⌘K`, `g d`, `g w`, `g i`, `?` shortcut sheet, `Esc`
- [ ] Global conventions: skeletons on every list · `AlertDialog` on every destructive action
      (**irreversible ones require typing the resource name**) · toast on every mutation ·
      optimistic updates with rollback

### Responsive (§11.5)
- [ ] Mobile < 768: sidebar → `Sheet`, tables → cards, filters → bottom `Drawer`
- [ ] Tablet 768–1279: icon-only sidebar, 2-column dashboard, sticky first table column
- [ ] Desktop ≥ 1280: full sidebar, 3–4 column dashboard, side-panel detail
- [ ] **The evidence viewer is deliberately desktop-first** — on mobile show a summary with a
      "best viewed on desktop" note rather than an unusable table
- [ ] The issue queue and dashboard are **fully mobile-capable** — triage on a phone is real

### States (§11.7, §11.8)
- [ ] Skeletons matching the final layout's shape — **never a centered full-page spinner**
- [ ] Every empty state from the §11.8 table: names the concept, explains the value, offers
      the action
- [ ] Every error state from the §11.8 table, in user language with a next action
- [ ] `PartialScanNotice` prominent, not buried

### Accessibility (§11.6, WCAG 2.2 AA)
- [ ] 2 px `--ring` focus outline with 2 px offset, **never removed**
- [ ] Dialogs trap focus and restore on close; route changes move focus to the `h1`
- [ ] `aria-label` on icon buttons, `aria-describedby` on inputs with help/error,
      `aria-current="page"`, `aria-sort` on sortable columns, `role="status"` on scan progress
- [ ] Contrast ≥ 4.5:1 body, ≥ 3:1 large text and UI; **agency brand colours validated at save time**
- [ ] Charts use pattern fills as well as colour
- [ ] `prefers-reduced-motion` disables transitions and animated counters
- [ ] Target size ≥ 24×24 px, ≥ 44×44 px on touch
- [ ] Usable at 200% zoom and 320 px width without horizontal scroll
- [ ] `eslint-plugin-jsx-a11y` in the lint gate; `axe-core` in E2E for the 10 top pages

### i18n readiness (§11.11)
- [ ] All user-facing strings in `packages/shared/src/copy/en.ts` behind `t()` — **no string
      literals in JSX**
- [ ] `Intl.DateTimeFormat` / `Intl.NumberFormat` with an explicit locale
- [ ] UTC storage; display in user → agency timezone; relative times with absolute in tooltip

## Acceptance criteria

- [ ] Every list has a designed empty state
- [ ] Every error has user-readable copy and a next action
- [ ] Severity is never conveyed by colour alone
- [ ] Accessibility audit passes (WCAG 2.2 AA), incl. manual keyboard and screen-reader passes
- [ ] Mobile layouts verified on dashboard, issues and portal
- [ ] Dark mode remaps every token

## Cross-reference

`UI_DESIGN_PROMPTS.md` encodes these exact tokens for image generation. **If a token changes
here, change it there** — the two must not diverge.
