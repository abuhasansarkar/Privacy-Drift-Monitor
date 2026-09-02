# 00 — Developer Guide, Invariants & Definition of Done

> **The Developer Contract for Privacy Drift Monitor**  
> Every engineer contributing to this repository must follow these rules without exception. Violating any of these rules breaks CI or introduces silent security/compliance defects.

---

## 1. The 6 Production Contracts (Never Break These)

These are architectural contracts. A mismatch breaks production silently or causes build failure:

| Contract | Location | What a Violation Costs |
|---|---|---|
| **1. Fixture IDs `F01`–`F30`** | `packages/scanner/src/testing/fixtures.ts` | Test harness failure; "F28 passes" stops meaning "zero spurious drift". |
| **2. Prompt Versions `<FEATURE>_V<n>`** | `packages/ai/src/prompts/index.ts` | The version is baked into `inputHash`. Changing a prompt without bumping `_V<n>` serves stale cached output forever. |
| **3. Rule IDs `PDM-R001`–`PDM-R050`** | `packages/analysis/src/rules/` | Renaming or deleting an ID orphans historical `Issue` database records. |
| **4. BullMQ Job IDs (No Colons `:`)** | `packages/scanner/src/queue/queues.ts` | BullMQ rejects `:` at runtime. Always sanitize via `toJobId()`. |
| **5. Tenant Scoping (`forAgency`)** | `packages/database/src/tenant.ts` | Raw `prisma` client imports in application code bypass tenant isolation. Must use `forAgency(agencyId)`. |
| **6. Terminology Enforcement** | `packages/shared/src/copy/terminology.ts` | Forbidden words (`violation`, `GDPR breach`, `compliant`) fail `npm run check:terminology`. |

---

## 2. Next.js 16.3.3 & Clerk Core 3 Invariants

1. **`src/proxy.ts` replaces `middleware.ts`:**
   * Never set `export const runtime = 'edge'` inside `proxy.ts` (Next 16 throws at build time).
   * Node.js runtime is mandatory.
2. **Server Actions do not rely on Proxy matchers:**
   * Server Actions POST to their invoking page. You MUST call `requireAgencyContext()` inside every Server Action function.
3. **Promises on Request State:**
   * `cookies()`, `headers()`, `params`, and `searchParams` are Promises. Always `await`:
     ```typescript
     export default async function Page({ params }: { params: Promise<{ websiteId: string }> }) {
       const { websiteId } = await params;
     }
     ```
4. **Clerk Core 3 Primitives:**
   * `<SignedIn>` and `<SignedOut>` are removed in Clerk v7. Use `<Show when="signed-in">` and `<Show when="signed-out">`.
5. **Turbopack Compatibility:**
   * Turbopack is the default for `next dev` and `next build`. Do not introduce custom `webpack` configurations.

---

## 3. Definition of Done (DoD) for Any Module

A module is complete **only** when all of the following gates pass:

- [ ] **Data Scoping:** All tenant-owned queries pass through `forAgency(agencyId)`.
- [ ] **Input Validation:** All API Route Handlers and Server Actions validate incoming payloads using Zod schemas from `@pdm/schemas`.
- [ ] **Deterministic Facts:** No LLM is used to assert whether an HTTP request or cookie occurred.
- [ ] **Error Handling:** Errors return structured, typed application codes from `@pdm/shared/errors` (e.g., `NotFoundError`, `AuthorizationError`, `SsrfBlockedError`).
- [ ] **UI States Complete:** Every page component implements **Loading** (skeletons), **Empty**, **Error**, and **Success** states.
- [ ] **Accessibility (WCAG 2.2 AA):**
  - Text contrast ratio ≥ 4.5:1 against background.
  - Severity is never communicated by color alone (always icon + color + text label).
  - Focus rings are visible (minimum 2px).
- [ ] **Terminology Clean:** `npm run check:terminology` passes with 0 violations.
- [ ] **Automated Tests:** Unit and integration tests cover happy path and edge-case negative tests.
- [ ] **Build & Lint Green:** `npm run lint` and `npm run typecheck` pass with 0 errors.
