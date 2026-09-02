# Module 17 — Free Public Scanner & Lead Capture Engine

> **Tier:** V1 · **Package:** `src/app/(marketing)/free-scanner`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
To drive inbound agency customer acquisition, the platform provides a free single-page scanner on the marketing site. It acts as an automated lead magnet demonstrating immediate tracking leaks.

## 2. Architecture & Abuse Protection
* **Resource Isolation:** Dispatches to a dedicated low-priority BullMQ queue (`scan:free`) that can never starve paying customer queues.
* **Abuse Controls:**
  * Cloudflare Turnstile bot verification on submission.
  * Per-IP rate limiting (5 scans per 24 hours).
  * Per-domain global cooldown (1 scan per hour).
  * Global circuit breaker halting free scans during peak system load.
* **Lead Capture Gate:** Displays high-level score and issue counts; requires email submission to unlock the detailed breakdown.

## 3. Database Schema
```prisma
model FreeScanSession {
  id          String   @id @default(uuid())
  token       String   @unique
  targetUrl   String
  status      String   @default("QUEUED")
  score       Int?
  leadEmail   String?
  createdAt   DateTime @default(now())
}
```

## 4. Key Files
* `src/app/(marketing)/free-scanner/page.tsx`: Public scan form with Turnstile widget.
* `src/app/(marketing)/free-scanner/[token]/page.tsx`: Dynamic result page with lead capture modal.
* `worker/src/jobs/free-scan.ts`: Dedicated free scan execution worker.

## 5. Acceptance Criteria
* **Given** an anonymous user submitting a URL,
* **When** the scan completes,
* **Then** the page renders the health score and pre-consent tracker count,
* **And** entering an email unlocks the full report and registers the lead.
