# dev-doc — কাজের খাতা

`NEW-PLAN.md` বলে **কী অবস্থা আর কোথায় যেতে হবে**।
এই ফোল্ডার বলে **এখন হাতে কী কাজ, আর সেটা শেষ হলো কীভাবে বুঝব**।

## নিয়ম

1. এক task = এক ফাইল। ফাইল ছোট রাখুন — না পড়ে কেউ কাজ শুরু করে না।
2. প্রতিটা task-এ **Acceptance** থাকতেই হবে, আর সেটা এমন হবে যা **চালিয়ে দেখা যায়**।
   "Feature-টা কাজ করে" acceptance নয়। "এই command এই output দেয়" acceptance।
3. Task শেষ হলে ফাইলের উপরে `Status:` বদলান, আর নিচে **Evidence** যোগ করুন —
   কী চালিয়ে কী দেখলেন। Evidence ছাড়া কোনো task `DONE` নয়।
4. যা যাচাই করা যায়নি, সেটা `DONE` নয় — `BUILT` (code আছে, runtime চালানো হয়নি)।

## Status মান

| মান | মানে |
|---|---|
| `TODO` | শুরু হয়নি |
| `WIP` | চলছে |
| `BUILT` | Code আছে, gate pass, কিন্তু runtime যাচাই হয়নি |
| `DONE` | Acceptance চালানো হয়েছে, Evidence লেখা আছে |
| `BLOCKED` | আটকে আছে — কেন, লেখা আছে |

## অগ্রাধিকার

**P0** — এগুলো ছাড়া বাকি কাজের ফলাফল বিশ্বাস করা যায় না।
**P1** — Product ভুল উত্তর দিচ্ছে বা মিথ্যা দেখাচ্ছে।
**P2** — Feature নেই।
**P3** — Ops ও scale।

## Index

| # | Task | P | Status |
|---|---|---|---|
| [T01](tasks/T01-test-harness.md) | Test harness (vitest) ফেরানো | P0 | TODO |
| [T02](tasks/T02-contract-tests.md) | চারটা contract test | P0 | TODO |
| [T03](tasks/T03-zero-phase-confidence.md) | Phase-শূন্য scan `FULL` confidence দেখায় | P0 | DONE |
| [T04](tasks/T04-demo-seed-evidence.md) | Demo seed evidence row লেখে না — UI খালি | P0 | DONE |
| [T05](tasks/T05-env-drift.md) | `.env` drift — `PORTAL_TOKEN_SECRET` নেই | P1 | DONE |
| [T06](tasks/T06-dead-queues.md) | দুটো dead queue admin UI-তে দেখায় | P1 | DONE |
| [T07](tasks/T07-scaffold-debris.md) | Sentry example page/route production-এ যায় | P1 | DONE |
| [T08](tasks/T08-agents-md-sync.md) | `AGENTS.md`/`CLAUDE.md` অস্তিত্বহীন ফাইল দেখায় | P1 | DONE |
| [T09](tasks/T09-vendor-catalogue.md) | Vendor catalogue 74 → 2,000+ | P1 | TODO |
| [T10](tasks/T10-api-rate-limit.md) | Public API v1-এ rate limit নেই | P1 | TODO |
| [T11](tasks/T11-scan-baseline.md) | `ScanBaseline` approval workflow | P2 | TODO |
| [T12](tasks/T12-maintenance-window.md) | Maintenance window | P2 | TODO |
| [T13](tasks/T13-ai-features.md) | AI feature ৫–৮ | P2 | TODO |
| [T14](tasks/T14-issue-workflow.md) | Issue assignment, SLA, bulk op | P2 | TODO |
| [T15](tasks/T15-tracker-triage.md) | Unknown-tracker triage loop | P2 | TODO |
| [T16](tasks/T16-observability.md) | OpenTelemetry, soak test, runbook | P3 | TODO |
