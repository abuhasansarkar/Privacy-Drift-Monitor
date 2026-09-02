# Feature 27 — Interactive Journeys, CNAME Cloaking & Advanced Detection

> **Phase:** 12 · **Priority:** P1 · **Effort:** L · **Value:** 5
> **Status:** 🟢 Complete — Journey 6 INTERACTIVE_ACTION added, advanced rules PDM-R038 to PDM-R048 & PDM-R050 implemented and tested.
> **Plan refs:** PLAN-V2 Part I, Part II §2.3–§2.4, Part III

## What it is

This feature implements:
1. **Interactive & Deep-Page Action Simulator (Journey 6)**: Simulating scroll depth dwells (25%, 50%, 75%, 100%), hover actions, dummy form field entry, and cart button clicks.
2. **DNS CNAME Cloaking Resolver**: Resolving first-party subdomain CNAME chains to unmask third-party ad-tech masquerading as first-party endpoints.
3. **Advanced Detection Rules (`PDM-R038`–`PDM-R048`, `PDM-R050`)**: Supercookies/IndexedDB, Fingerprinting, GTM container re-injection, payload weight, insecure HTTP, and bot challenge detection.

## Why it exists

Modern ad-tech avoids standard detection via CNAME cloaking, scroll-delayed script injection, and secondary tag containers. Testing static landing pages without user interaction misses dynamic trackers that fire upon form entry or scrolling.

## Dependencies

- Feature 05 (Scan Engine)
- Feature 08 (Tracker Detection)
- Feature 09 (Rule Engine)

## Deterministic Rules

| Rule ID | Category | Name & Trigger | Severity |
|---|---|---|---|
| `PDM-R038` | `CLOAKING` | **CNAME Cloaked Third-Party Tracker Detected** | **High** |
| `PDM-R039` | `STORAGE` | **Supercookie / IndexedDB Tracking Mechanism** | **High** |
| `PDM-R040` | `TRANSPORT` | **Cross-Border PII Exfiltration** | **Medium** |
| `PDM-R041` | `CMP_HYGIENE` | **Asymmetric Button Sizing / Dark Pattern** | **Medium** |
| `PDM-R042` | `INTERACTION` | **Post-Interaction Delayed Tracker Spike** | **High** |
| `PDM-R043` | `INTERACTION` | **Form Submission Tracker Trigger** | **High** |
| `PDM-R044` | `TAG_MANAGER` | **GTM Container Re-Injection Bypass** | **Critical** |
| `PDM-R045` | `FINGERPRINT` | **Canvas / WebGL / Audio Fingerprinting Detected** | **Critical** |
| `PDM-R046` | `PERFORMANCE` | **Excessive Third-Party Script Payload Weight (> 1.5MB)** | **Low** |
| `PDM-R047` | `SECURITY` | **Third-Party Script Loaded Over Insecure HTTP** | **High** |
| `PDM-R048` | `COOKIE_BEHAVIOR` | **SameSite=None Cookie Missing Secure Flag** | **Medium** |
| `PDM-R050` | `SCAN_HEALTH` | **Bot Challenge / Cloudflare Turnstile Block on Geo-Egress** | **Medium** |

## Build steps

- [x] Extend `ConsentPhase` with `INTERACTIVE_ACTION`.
- [x] Implement rules `PDM-R038` through `PDM-R048`, `PDM-R050` in `packages/analysis/src/rules/advanced.ts`.
- [x] Register rules in `SCAN_RULES` with precedence ranking.
- [x] Add rule coverage and integration assertions.

## Acceptance criteria

- [x] First-party vanity subdomains resolving to external tracking endpoints trigger `PDM-R038`.
- [x] Multiple GTM container IDs on a single page trigger `PDM-R044` at Critical severity.
- [x] All findings carry exact evidence references.
