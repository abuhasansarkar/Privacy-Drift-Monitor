# T14 — Issue assignment, SLA, bulk operation

**Priority:** P2 · **Status:** TODO

## সমস্যা

`Issue` model-এ status, resolution, activity, feedback আছে — কিন্তু নেই:

- **Owner** — কে দেখছে, বোঝার উপায় নেই
- **Due date / SLA** — CRITICAL issue কতদিন খোলা, তার কোনো সীমা নেই
- **Escalation** — পুরোনো CRITICAL issue নিজে থেকে উপরে ওঠে না
- **Bulk operation** — 200-site portfolio-তে একটা একটা করে triage অসম্ভব

`/app/issues` cross-portfolio queue আছে, কিন্তু multi-select নেই।

## Acceptance

1. `Issue.assigneeId`, `Issue.dueAt` (migration)।
2. Issue list-এ multi-select → bulk acknowledge / ignore / assign।
3. Severity-ভিত্তিক default SLA (CRITICAL 3 দিন, HIGH 7, MEDIUM 30)।
4. SLA পেরোলে Attention Center-এ উঠে আসে।
5. RBAC: VIEWER assign করতে পারবে না।

## ফাঁদ

Bulk operation-ও `forAgency()` দিয়ে scoped হতে হবে। একটা `updateMany` যেখানে
`agencyId` filter নেই — সেটাই cross-tenant write। Tenant extension `updateMany`
guard করে, কিন্তু bulk path-এ সেটা **পরীক্ষা করে দেখতে হবে**, ধরে নেওয়া যাবে না।
