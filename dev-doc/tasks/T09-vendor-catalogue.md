# T09 — Vendor catalogue 74 → 2,000+

**Priority:** P1 · **Status:** TODO

## সমস্যা — এটাই সবচেয়ে বড় product gap

`packages/database/prisma/seed/trackers.json`-এ vendor **৭৪টা**:

| Category | সংখ্যা |
|---|---|
| FUNCTIONAL | 18 |
| ANALYTICS | 16 |
| NECESSARY | 15 |
| MARKETING | 13 |
| **ADVERTISING** | **7** |
| SOCIAL | 5 |

মূল rule `PDM-R001` fire করে **"known** advertising/tracking vendor-এ
pre-consent request"-এর উপর। ৭টা advertising vendor দিয়ে সেই rule বেশিরভাগ
বাস্তব site-এ **নীরবে under-report** করে।

সবচেয়ে খারাপ দিক: product তখন একটা পরিষ্কার ফলাফল দেখায় — অথচ সে site-টাকে
**classify-ই করতে পারেনি**। এটা "কিছু পাইনি" নয়, "দেখতেই পাইনি"। ব্যবহারকারীর
কাছে দুটো একরকম দেখায়, আর সেটাই বিপজ্জনক।

## Acceptance

1. Catalogue-এ ≥ 2,000 vendor, category-balanced (ADVERTISING ≥ 600)।
2. প্রতিটা entry-তে **provenance** — কোথা থেকে এলো, কোন তারিখে।
3. একটা বাস্তব commercial site scan করলে তার third-party request-এর
   **≥ 90%** নাম ধরে চেনা যায় (unknown domain report দিয়ে মাপা)।
4. `classify.ts`-এর `baseConfidence` প্রতিটা নতুন entry-তে যুক্তিসঙ্গত।

## ধাপ

1. Public tracker list (DuckDuckGo Tracker Radar, EasyList/EasyPrivacy,
   Disconnect) থেকে import script — license যাচাই করে।
2. Domain pattern normalize, duplicate merge।
3. `TrackerVendor.provenance` field যোগ (migration লাগবে)।
4. Unknown-domain report: scan-এর পর কত % request unmatched, সেটা মাপা।

## ফাঁদ

Catalogue বড় করলে **false positive**-ও বাড়ে। T15-এর precision telemetry
(`IssueFeedback`) এর সাথেই দরকার, নইলে quality মাপার উপায় থাকে না।
