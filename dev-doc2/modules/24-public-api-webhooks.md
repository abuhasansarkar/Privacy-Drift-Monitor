# Module 24 — Public REST API & Outbound Webhook Delivery Engine

> **Tier:** V1.5 · **Package:** `src/app/api/v1`, `src/server/services`  
> **Status:** 🟡 Tiered for Fast-Follow (V1.5)

---

## 1. Objective & Business Pain
Larger digital agencies need to integrate Privacy Drift Monitor into internal CI/CD pipelines, custom client portals, and automation tools (Zapier, Make, n8n) via REST APIs and real-time webhooks.

## 2. Architecture & Security
* **API Authentication:** Scoped API keys with prefix `pdm_live_...` stored as SHA-256 hashes in the database.
* **Rate Limiting:** Sliding-window rate limiting per agency (100 req/min on Agency plan, 500 req/min on Scale).
* **Outbound Webhook Delivery:**
  * Payload signed with HMAC-SHA256 in header `X-PDM-Signature`.
  * Exponential backoff retry (up to 5 attempts) for failed deliveries (HTTP 4xx/5xx).
  * Dead-letter queue (DLQ) logging after repeated failures.

## 3. Supported Webhook Events
* `website.scan.completed`: Scan finishes and health score is updated.
* `privacy_drift.detected`: New unapproved tracker or cookie change discovered.
* `issue.created`: New Critical or High severity finding opened.
* `issue.verified`: Finding confirmed resolved via verification scan.

## 4. Key Files
* `packages/database/prisma/schema.prisma`: `ApiKey` and `WebhookEndpoint` models.
* `src/server/services/webhooks.ts`: Signature generation and queue worker delivery.
* `src/app/api/v1/`: Public REST API route handlers.

## 5. Acceptance Criteria
* **Given** a registered webhook endpoint with secret `whsec_xyz`,
* **When** a Privacy Drift event occurs,
* **Then** the webhook worker dispatches an HTTP POST with valid `X-PDM-Signature`,
* **And** the event payload matches the verified schema.
