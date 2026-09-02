# Module 10 — Immutable Evidence Vault & PII Redaction

> **Tier:** MVP · **Package:** `@pdm/scanner`, `@pdm/storage`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Developers will not fix an issue unless they see technical proof (request initiator, exact cookie payload, screenshot). However, storing raw web traffic risks capturing user PII and credentials.

## 2. Architecture & Data Flow
* **Data Collected:** Exact timestamp (UTC), request URL, method, status code, initiator stack, cookie attributes, DOM screenshots.
* **Integrity:** Generates a SHA-256 hash for every raw network event to ensure tamper-evident storage.
* **PII Sanitization:**
  * Strips `Authorization`, `Proxy-Authorization`, and `Cookie` session values (`[REDACTED]`).
  * Masks POST body form payloads (passwords, credit cards, SSNs).
  * Scrubs sensitive query keys (`token`, `auth`, `key`, `password`).

## 3. Key Files
* `packages/scanner/src/record/evidence.ts`: Evidence normalization and PII redaction.
* `packages/storage/src/s3.ts`: S3 client managing screenshots and signed URLs.
* `src/components/evidence/evidence-viewer.tsx`: High-performance evidence viewer.

## 4. Acceptance Criteria
* **Given** a network request carrying `Authorization: Bearer secret-jwt-token`,
* **When** the evidence collector writes to the database,
* **Then** the header value is sanitized to `Bearer [REDACTED]`,
* **And** a SHA-256 integrity hash is persisted.
