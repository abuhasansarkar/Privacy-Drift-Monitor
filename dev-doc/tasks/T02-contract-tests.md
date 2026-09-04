# T02 — চারটা contract test

**Priority:** P0 · **Status:** TODO · **Depends on:** T01

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
