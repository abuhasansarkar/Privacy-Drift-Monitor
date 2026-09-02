# Feature 18 — Free Public Scanner

> **Phase:** 6 · **Priority:** P1 · **Effort:** L · **Value:** 4
> **Status:** ✅ Complete
> **⚠️ The highest-risk public surface in the product.**
> **Plan refs:** Part III §3.2 (`/free-scanner`), Part X §10.3 (SSRF), §10.5 (abuse)

## What it is

An unauthenticated lead-generation scanner: paste a URL, get a limited result, convert to a
trial. It accepts an arbitrary URL from an anonymous user and **drives a browser at it**.

## Why it exists

Top of funnel. Also secondary use case #8 and the pre-fill source for onboarding step 5.

## Dependencies

Features 04 (SSRF guard), 05 (scan engine), 11 (score), 22 (feature flags for the circuit
breaker).

## Restrictions for anonymous scans

Deliberate: enough value to be credible, enough gap to convert.

| Control | Value | Why |
|---|---|---|
| Consent phases | `no-consent` **only** | Full 4-phase costs ~4× and is the paid value |
| Pages | Homepage only | Cost |
| Timeout | 45 s hard | Bound worker occupancy |
| Screenshot | 1 (banner state) | Cost |
| Retention | 7 days, then purged | Data minimization |
| Findings shown | Count of all + full detail on **top 3 by severity** | Credible but incomplete |
| Evidence detail | Domain + tracker name only; **no full URLs, no cookie values** | Prevents scraping our detection logic |
| AI explanation | Not available | Cost + abuse |
| Drift | Not available (needs history) | Natural upsell |

## Abuse controls — all mandatory

- [x] **Cloudflare Turnstile** before enqueue; token verified server-side, **single-use**
- [x] IP rate limit: 3 scans/hour, 10/day (Redis sliding window)
- [x] Domain rate limit: **1 scan / 24 h per registrable domain, globally across all users**
- [x] Global circuit breaker: > 200 waiting jobs → "high demand, try later"
- [x] **Dedicated `scan:free` queue, low priority, capped concurrency — cannot starve paying
      customers**
- [x] Full SSRF guard, identical to authenticated scans
- [x] Admin-maintained domain blocklist + automatic block after 3 consecutive failures
- [x] Email gate: results are viewable without email; **the PDF download and "monitor this
      site" require an email**

## Build steps

- [x] Input page with Turnstile
- [x] `POST /api/public/free-scan` → validate → SSRF → Turnstile → rate limits → enqueue
- [x] Running state with the live stage checklist
- [x] Result page `/free-scanner/[token]` — **32-byte URL-safe random token, public but
      unguessable, `noindex`**
- [x] Locked/blurred panel listing what monitoring adds (Reject All testing, withdrawal
      testing, drift, alerts, reports)
- [x] CTA "Monitor this website — start free trial" pre-filling the URL into signup
- [x] `free_scan_token` cookie carried through signup for attribution
- [x] 7-day purge job
- [x] Error states (below)

## Error states

`Website unreachable` · `Scan timed out` · `This site is protected by a bot challenge we can't
pass` · **`We can't scan this address`** (SSRF block — deliberately vague) · `Too many scans
from your network` · `We're at capacity right now`.

## Conversion funnel

```
free_scan_submitted → free_scan_completed → free_scan_result_viewed
  → free_scan_email_captured → free_scan_signup_clicked → signup_completed
```

Attributed via the `free_scan_token` cookie carried through signup.

## Acceptance criteria

- [x] Every abuse control is enforced
- [x] The free queue **cannot starve the paid queue** (assert under load)
- [x] SSRF vectors are blocked identically to authenticated scans
- [x] The Turnstile token is single-use and verified server-side
- [x] Result tokens are unguessable and the page is `noindex`
- [x] Results purge after 7 days
- [x] No full URLs or cookie values appear in anonymous results
- [x] The funnel events fire and attribute correctly through signup
- [x] Tested against **20 real websites** before launch

## Tests required

| Level | What |
|---|---|
| Unit | Rate-limit windows; token generation |
| Integration | Turnstile single-use; circuit breaker; queue isolation under load |
| Security | Full SSRF vector suite against the public endpoint |

## Traps

- The SSRF block message must stay vague. Every other error should be specific and helpful.
- Domain rate limiting is **global**, not per-IP — otherwise a distributed abuser hammers one
  target through us.
- Do not show enough evidence detail to let a competitor reverse-engineer the detection logic.
- §12.9 Q3 is settled: **no email required to see results.** Gating results kills the
  conversion signal we most need.
