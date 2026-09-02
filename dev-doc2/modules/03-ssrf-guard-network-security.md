# Module 03 — SSRF Guard & Network Isolation

> **Tier:** MVP · **Package:** `@pdm/scanner`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
An unauthenticated or untrusted user submitting a website URL could probe internal agency networks, local databases (`127.0.0.1:5432`), or cloud metadata endpoints (`169.254.169.254`).

## 2. Architecture & Defense in Depth
* **R1 — Scheme & Port Allowlist:** `http:` and `https:` only on ports `80`, `443`, `8080`, `8443`.
* **R2 — DNS Resolution:** Resolves all `A` and `AAAA` records. Rejects private RFC 1918, loopback, cloud metadata, and link-local ranges.
* **R3 — IP Pinning:** Pins the validated IP address to eliminate DNS-rebinding Time-of-Check to Time-of-Use (TOCTOU) exploits.
* **R4 — Per-Hop Redirect Validation:** Playwright's `page.route` intercepts HTTP 301/302/307 redirects and re-evaluates the SSRF guard before following, capped at 3 hops.

## 3. Key Files
* `packages/scanner/src/net/guard.ts`: The primary `assertSafeUrl` and `assertSafeRedirect` implementation.
* `packages/scanner/src/scan.ts`: The integrated route handler intercepting all browser navigation requests.

## 4. Acceptance Criteria
* **Given** a submitted URL targeting `http://169.254.169.254/latest/meta-data/`,
* **When** the scanner attempts navigation,
* **Then** the request is aborted immediately with `SsrfBlockedError`,
* **And** the user receives a vague error: *"We can't monitor this address."*
