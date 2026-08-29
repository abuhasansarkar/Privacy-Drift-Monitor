# Feature 13 — Notifications, Alerts & Email

> **Phase:** 4 · **Priority:** P0 · **Effort:** M + L + L · **Value:** 5
> **Status:** ⬜ Not started
> **Plan refs:** Part VI (alerts), Part III §3.11 (`/app/alerts`, `/app/notifications`)

## What it is

In-app notifications, configurable alert rules, the dispatcher, digests, quiet hours, flood
control, and 19 Resend email templates with delivery-status webhooks.

## Why it exists

JTBD J9: *"Don't make me babysit it."* Monitoring nobody is told about is not monitoring.
Agencies live in email — but **alert fatigue kills the product**, which is why digests and
quiet hours are P1, not polish.

## Dependencies

Features 09 (issues), 10 (drift). Blocks: nothing, but feeds 15 (portal critical alerts).

## Build steps

### Notifications
- [ ] Notification types + per-type channel matrix (in-app / email)
- [ ] `/app/notifications` — Unread/All tabs, type filter, mark all read, deep links
- [ ] Header bell with unread count and a popover of the latest five
- [ ] Cursor pagination

### Alert rules
- [ ] Rule model: type, scope (all sites / group / client / single site), channels, schedule
      (immediate / daily digest / weekly digest), threshold, quiet hours, enabled
- [ ] `/app/alerts` — Rules tab (list + create/edit dialog) and History tab
- [ ] Dispatcher with **flood control** and duplicate suppression within 4 hours
- [ ] Quiet hours with timezone; **defer non-critical alerts**, don't drop them
- [ ] Per-website overrides; alert profiles (Default / Critical only / Silent)

### Digests
- [ ] Daily and weekly digest builders
- [ ] **Computed in the agency's timezone.** Implement by grouping agencies by distinct
      timezone and running **one repeatable job per zone** — not one job per agency
- [ ] Weekly summary opt-in

### Email
- [ ] Resend integration in `packages/email`
- [ ] All 19 React Email templates, copy separated into `packages/email/src/copy/`
- [ ] Delivery-status webhooks → alert history
- [ ] Every template carries the disclaimer line and correct terminology

## Acceptance criteria

- [ ] A critical issue produces an email **within 60 s** and an in-app notification
- [ ] Quiet hours defer non-critical alerts
- [ ] A daily digest groups a day's issues into one email
- [ ] Digests are correct for the agency's timezone
- [ ] Duplicate alerts are suppressed within 4 hours
- [ ] Delivery status is recorded from Resend webhooks
- [ ] Alert history shows type, trigger, channel, recipients, sent time, delivery status
- [ ] No banned terminology in any template

## Tests required

| Level | What |
|---|---|
| Unit | Quiet-hours boundary logic across timezones and DST; duplicate-suppression window |
| Integration | Digest grouping; email queueing; Resend webhook processing |
| Manual | Render in Gmail, Outlook and Apple Mail before launch |

## Failure modes

| Mode | Handling |
|---|---|
| Resend outage | Emails delayed; jobs retry ~2 hours. **In-app notifications are unaffected**, so alerts still reach logged-in users. Keep the two paths independent |
| Recipient bounces | Record from the webhook, surface in alert history, don't silently keep sending |
| Alert storm (one site, many issues) | Flood control + digest rollup |

## Traps

- DST transitions break naive quiet-hours math. Test the boundaries explicitly.
- A per-agency repeatable job does not scale to thousands of agencies. Group by timezone.
- "Immediate" for a Critical issue must genuinely be under 60 s — that is an acceptance
  criterion, so the alert path cannot sit behind a slow analysis job.
- Emails are a place banned terminology leaks in, because template copy is often written
  quickly and outside the app. The CI terminology check covers `emails/` for this reason.
