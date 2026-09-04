# T15 — Unknown-tracker triage loop

**Priority:** P2 · **Status:** TODO · **Related:** T09

## সমস্যা

অর্ধেক তৈরি:

- ✅ `getUnknownDomains()` — `/admin/trackers`-এ unmatched domain দেখায়
- ✅ `createTrackerVendorAction()` — admin হাতে vendor বানাতে পারে
- ❌ AI category suggestion step
- ❌ Review queue UI (শুধু তালিকা, workflow নেই)
- ❌ Precision telemetry

`IssueFeedback` model **আছে কিন্তু signal হিসেবে ব্যবহৃত হয় না**। অর্থাৎ
কোনো rule কত ভুল বলছে, সেটা কেউ জানে না।

## Acceptance

1. Unknown domain → AI suggestion (`CLASSIFY_TRACKER`, T13-এর উপর নির্ভর) →
   admin review → published vendor। প্রতি ধাপে audit row।
2. AI **কখনও** সরাসরি vendor তৈরি করবে না — সে শুধু প্রস্তাব করে। P1: fact
   scanner-এর, AI-এর নয়।
3. Rule-প্রতি precision dashboard: `IssueFeedback` থেকে false-positive হার।
4. একটা rule-এর precision থ্রেশহোল্ডের নিচে নামলে admin-এ alert।

## কেন এটা T09-এর সাথে জোড়া

Catalogue বড় করলে false positive বাড়বে। Precision মাপার যন্ত্র ছাড়া
catalogue বাড়ানো মানে অন্ধভাবে noise বাড়ানো।
