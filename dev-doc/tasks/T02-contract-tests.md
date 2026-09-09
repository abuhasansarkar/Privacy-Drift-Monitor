# T02 — চারটা contract test

**Priority:** P0 · **Status:** DONE · **Depends on:** T01

## কেন এগুলোই আগে

এই চারটা contract ঐতিহাসিকভাবে ভেঙেছে, আর **প্রতিবারই নীরবে** — code চলত,
test সবুজ থাকত, আর সবুজের কোনো মানে ছিল না। Feature test-এর আগে এগুলো।

## চারটা

### ১. Rule id
`RULES` ∪ `DORMANT_RULE_IDS` ∪ `RESERVED_RULE_IDS` = `PDM-R001…R052` + `PDM-X…`,
এবং তিনটা তালিকা **disjoint**। `Issue.ruleId` এই id সংরক্ষণ করে — rename করলে
প্রতিটা পুরোনো issue অনাথ।

### ২. Prompt version
Prompt আছে এমন প্রতিটা `AIFeature`-এর `version` field তার নিজের constant-এর
নামের সাথে মিলবে (`EXPLAIN_ISSUE_V1` ↔ `"EXPLAIN_ISSUE_V1"`)।
Version `inputHash`-এর অংশ — না বাড়িয়ে prompt বদলালে **চিরকাল পুরোনো output
serve হবে**, আর কেউ বুঝবে না কেন।

### ৩. Fixture id
`F01`–`F30` উপস্থিত, unique, কোনো ফাঁক নেই।

### ৪. Queue ও job id
`QUEUE_NAMES`-এর কোনো value-তে `:` নেই, আর `toJobId()` `:` কে rewrite করে।
BullMQ runtime-এ reject করে — production-এ।

## অতিরিক্ত দুটো (একই শ্রেণির)

### ৫. Tenant isolation
`TENANT_MODELS`-এর প্রতিটা model-এ agency A-র client দিয়ে agency B-র row পড়লে
`count === 0`।

### ৬. Marketing route
`content/marketing/nav.ts`-এর প্রতিটা navigable path `PUBLIC_ROUTE_PATTERNS`-এ
match করে। ছয়টা marketing page একবার login wall-এর পেছনে ship হয়েছিল।

## Acceptance

প্রতিটা test **ইচ্ছে করে ভাঙলে fail করে** — এটাই আসল পরীক্ষা। একটা rule id
rename করে `npm test` চালান; fail না করলে test-টা অকেজো।

## Evidence — 2026-09-09

ছয়টা contract test-ই restore (git `2a192cf^`) বা verify করা হয়েছে:

| Contract | Test file | ফলাফল |
|---|---|---|
| ১. Rule id | `packages/analysis/src/__tests__/rules.test.ts` | 55/55 ✅ (R001–R050 coverage, disjoint, reserved/dormant accounting) |
| ২. Prompt version | `packages/ai/src/__tests__/prompts.test.ts` | 16/16 ✅ (version pattern, schema/grounding pairing, placeholder/$& injection) |
| ৩. Fixture id | `packages/scanner/src/testing/__tests__/fixture-matrix.test.ts` | 12/12 ✅ (F01–F30, X-fixtures আলাদা, distinct descriptions) |
| ৪. Queue/job id | `packages/scanner/src/queue/__tests__/queue-contract.test.ts` | 25/25 ✅ (`:` নিষিদ্ধ, toJobId rewrite, idempotency keys, retry budgets) |
| ৫. Tenant isolation | `packages/database/src/__tests__/tenancy.test.ts` | 19/19 ✅ (আসল Postgres `drift_monitor_test`-এ; registry completeness DMMF-driven) |
| ৬. Marketing route | `src/__tests__/marketing-routes.test.ts` | 53/53 ✅ (nav.ts ↔ PUBLIC_ROUTE_PATTERNS প্রতিটা path) |

**মোট: 6 files / 180 tests passed, 0 failed.**

**Negative test (acceptance-এর আসল শর্ত) — RUN করা হয়েছে:** `PDM-R001`-কে
`PDM-R999` rename করে `rules.test.ts` চালানো হয়েছে → **5 failed | 50 passed** —
অর্থাৎ rename করলে build fail করে। পরে ফাইল restore করে suite আবার 55/55 green।

**নোট:** G-07 fix হিসেবে `PDM-R051/R052` এখন `PDM-X03/X04` (নিচের T09/G-07
নোট দেখুন); rule-coverage test এখনও পাস করে কারণ সেটা R001–R050 coverage
assert করে এবং X-prefix rules-কে আলাদা চিনে।
