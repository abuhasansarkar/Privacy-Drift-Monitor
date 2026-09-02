# Module 02 — Browser Pool & Worker Orchestrator

> **Tier:** MVP · **Package:** `@pdm/scanner`, `worker`  
> **Status:** ✅ Complete & Verified

---

## 1. Objective & Business Pain
Launching Chromium instances per scan request is too slow (~500ms) and leaks memory over time if long-lived sessions are kept unmanaged. The pool manages reusable Chromium instances with isolated contexts.

## 2. Architecture & Data Flow
* **Reuse Browsers, Never Reuse Contexts:** Maintains 2–4 long-lived Chromium instances per worker.
* **Recycling Limit:** Automatically shuts down and replaces browsers after 50 context executions or 30 minutes of uptime.
* **Context Isolation:** Every consent journey runs in a fresh `BrowserContext` with dedicated cookie jars and local storage.

## 3. Implementation Code
```typescript
// packages/scanner/src/browser/pool.ts
export interface BrowserPool {
  acquire(): Promise<PooledBrowser>;
  release(browser: PooledBrowser): Promise<void>;
  drain(): Promise<void>;
}
```

## 4. Key Files
* `packages/scanner/src/browser/pool.ts`: Browser pool lifecycle and semaphore acquisition.
* `packages/scanner/src/browser/launch.ts`: Hardened Chromium flags (`--disable-dev-shm-usage`, `--js-flags=--max-old-space-size=512`).
* `worker/src/index.ts`: Worker process lifecycle and graceful shutdown handling.

## 5. Acceptance Criteria
* **Given** a busy scan worker executing 100 consecutive scans,
* **When** observing memory consumption over 2 hours,
* **Then** memory remains stable without runaway leaks,
* **And** a crashed browser automatically respawns with in-flight jobs retried.
