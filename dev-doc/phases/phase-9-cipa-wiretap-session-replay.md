# Phase 9 — CIPA Wiretap & Session Replay Inspector

> **Goal:** Detect session recording scripts and unmasked input recording liabilities under CIPA.
> **Dependencies:** Phase 2, Phase 3 · **Status:** ✅ Complete
> **Plan ref:** PLAN-V2 Part I, Part III, Part V, Part VI

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 9.1 | SessionReplayAudit Prisma model & multi-tenant relations | S | [24-cipa-wiretap-session-replay](../features/24-cipa-wiretap-session-replay.md) | ✅ |
| 9.2 | Replay vendor signatures (Hotjar, FullStory, Clarity, LogRocket, Smartlook) | S | [24-cipa-wiretap-session-replay](../features/24-cipa-wiretap-session-replay.md) | ✅ |
| 9.3 | Deterministic rules PDM-R036 (Unmasked Input) & PDM-R037 (Chat Interception) | M | [24-cipa-wiretap-session-replay](../features/24-cipa-wiretap-session-replay.md) | ✅ |
| 9.4 | Registration in SCAN_RULES with precedence resolution | S | [24-cipa-wiretap-session-replay](../features/24-cipa-wiretap-session-replay.md) | ✅ |

## What is verified

- [x] Rules `PDM-R036` and `PDM-R037` evaluated and registered in `SCAN_RULES`
- [x] `packages/analysis/src/__tests__/rules.test.ts` (34 tests) passing
- [x] Multi-tenant isolation verified in `packages/database/src/__tests__/tenancy.test.ts`
