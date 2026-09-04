# T12 — Maintenance window

**Priority:** P2 · **Status:** TODO · **Depends on:** T11

## সমস্যা

একেবারেই নেই (codebase-এ ০টা hit)। Agency developer tag manager আপডেট করলে
বা deploy করলে প্রতিটা পরিবর্তন drift alert তোলে — একটা deploy = চল্লিশটা alert।

`DriftSuppression` model আছে, কিন্তু সেটা **fingerprint-ভিত্তিক স্থায়ী**
suppression, **সময়-বাঁধা window** নয়। দুটো আলাদা জিনিস।

## Acceptance

1. `MaintenanceWindow` model — `websiteId`, `startsAt`, `endsAt` (1–24h),
   `reason`, `createdBy`।
2. Window-এর ভিতরে তৈরি drift event `EXPECTED_CHANGE` হিসেবে চিহ্নিত হবে —
   **মুছে ফেলা হবে না**, শুধু alert দমন করা হবে। Audit trail অক্ষত থাকা P5-এর দাবি।
3. Window শেষ হলে স্বয়ংক্রিয় verification scan enqueue।
4. UI-তে window চলাকালীন website-এ স্পষ্ট badge।
5. Window-এর ভিতরের পরিবর্তন **নতুন baseline হিসেবে প্রস্তাব** করা হবে
   (T11-এর approval দিয়ে), স্বয়ংক্রিয়ভাবে নয়।

## ফাঁদ

Alert দমন আর evidence দমন এক নয়। Window শুধু **notification** থামায়;
finding, evidence আর drift event সব রেকর্ড হতেই থাকবে।
