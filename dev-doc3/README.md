# Privacy Drift Monitor V3 — Developer Documentation Index (`dev-doc3`)

> **The Definitive Step-by-Step Engineering Blueprint for V3 Implementation**
>
> Builds directly upon the verified production baseline (Next.js 16.3.3, 1,072 tests, 45 rules, 5 reports, 7 queues) to deliver the complete V3 architecture outlined in [`PLAN-V3.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/PLAN-V3.md).

---

## 1. Quick Navigation & Phase Tracking

Each phase file contains detailed architectural specifications, file maps, database schemas, instrumentation snippets, test recipes, and verification commands:

| Phase | Title | Focus Area | Status | Document Link |
|---|---|---|---|---|
| **Phase 13** | Google Consent Mode v2 & `dataLayer` Engine | GCM v2, `window.dataLayer` & `gtag` interception, `PDM-R051`, `PDM-R052` | ✅ Completed | [`phases/phase-13-google-consent-mode-v2.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-13-google-consent-mode-v2.md) |
| **Phase 14** | Policy-to-Code NLP Engine (Module 23) | Privacy Policy discovery & scraping, `POLICY_EXTRACT_V1`, un-dormant `PDM-R034` & `PDM-R049` | ✅ Completed | [`phases/phase-14-policy-to-code-auditor.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-14-policy-to-code-auditor.md) |
| **Phase 15** | Reserved Rules Activation & Deep Instrumentation | DOM gating (`R029`), GeoIP (`R040`), Asymmetric contrast (`R041`), Form pixel (`R043`), Fingerprint traps (`R045`) | 🟡 Ready for Dev | [`phases/phase-15-reserved-rules-activation.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-15-reserved-rules-activation.md) |
| **Phase 16** | Public REST API v1 & Outbound Webhooks Mesh (Module 24) | Scoped `ApiKey` auth, `/api/v1/*` routes, HMAC-SHA256 webhooks, retry worker, Slack blocks | 🟡 Ready for Dev | [`phases/phase-16-public-api-webhooks.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-16-public-api-webhooks.md) |
| **Phase 17** | Deep Spider, Authenticated Scanning & AI Classifier | Sitemap XML parser, multi-page archetypes, AES-256-GCM form login runner, `COOKIE_CLASSIFY_V1` | 🟡 Ready for Dev | [`phases/phase-17-deep-crawl-auth-classifier.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-17-deep-crawl-auth-classifier.md) |
| **Phase 18** | Developer Tooling, MCP Server, Plugin & UI Polish | JSON-RPC MCP Server, GitHub Action CI/CD, WordPress plugin (Module 25), UI audit fixes (F01–F07) | 🟡 Ready for Dev | [`phases/phase-18-mcp-plugin-developer-tools.md`](file:///d:/ABUHASAN/WEB/Privacy-Drift-Monitor/dev-doc3/phases/phase-18-mcp-plugin-developer-tools.md) |

---

## 2. Inviolable Engineering Invariants

Before implementing any V3 feature, you must uphold these non-negotiable architectural contracts:

1. **Deterministic Core Unbroken:** Fact extraction (network requests, cookies, storage keys, DOM coordinates, GCM signals) happens **solely via Playwright instrumentation**. AI never creates facts; AI only parses policies, categorizes unknown entities, or explains evidence.
2. **Strict Multi-Tenant Isolation:** Every new Prisma model owned by an agency **must include `agencyId`**. Always query via `forAgency(agencyId)` from `@pdm/database/tenant`.
3. **Banned Terminology Gate (`scripts/check-terminology.ts`):** Never output terms like `"GDPR breach"`, `"violation"`, `"compliant"`, or `"legal advice"`. Always use approved phrases (`"Observed request"`, `"Detected behavior"`, `"Review recommended"`).
4. **Zero Silent Failures:** Never register a rule that returns `[]` without real predicates. If a fact source does not exist yet, put the ID in `DORMANT_RULE_IDS` or `RESERVED_RULE_IDS`.
5. **No Breaking Database Migrations:** All schema additions in V3 must be non-destructive and backward-compatible (nullable fields or sensible `@default` values).

---

## 3. Developer Verification Suite

Every phase is complete only when the full verification suite passes:

```powershell
# 1. Generate Prisma Client after schema changes
npm run db:generate

# 2. Run TypeScript check across all packages and web app
npm run typecheck

# 3. Verify terminology enforcement
npm run check:terminology

# 4. Run Vitest test suite with coverage
npm run test:coverage

# 5. Run Next.js 16 build with Turbopack
npm run build

# 6. Master gate (Runs all of the above in sequence)
npm run verify
```
