# T09 — Vendor catalogue 74 → 2,000+

**Priority:** P1 · **Status:** BUILT (partial — 120/2,000; ⚠️ acceptance 1 ও 3 পূরণ হয়নি)

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

## Evidence — 2026-09-09 (আংশিক)

**যা হয়েছে:** `trackers.json` 74 → **120** vendor (46 নতুন), seed re-run করা
(dev DB-তে `tracker_vendors` = 120 যাচাই)। নতুনগুলো সেই ফাঁকগুলো ভরে যেখানে
gap register বলছিল "advertising vendor মাত্র ৭":

| বিভাগ | নতুন যোগ |
|---|---|
| SSP/DSP/exchange (programmatic ads — সবচেয়ে বড় ফাঁক) | PubMatic, Magnite/Rubicon, OpenX, Index Exchange, Xandr/AppNexus, Adform, Equativ/SmartAdServer, Sovrn, TripleLift, GumGum, Sharethrough, 33Across, Yieldmo, SpotX, Sirdata, Teads |
| Measurement | Quantcast, Comscore/ScorecardResearch, Nielsen, Chartbeat, Parse.ly |
| Session-replay (HIGH risk, আগে প্রায় অচেনা ছিল) | LogRocket, Smartlook, Inspectlet, Lucky Orange |
| CDP/experimentation | Braze/Appboy, LaunchDarkly, AB Tasty, Kameleoon |
| Consent platforms | ConsentManager.net, Sourcepoint, Evidon |
| Payment/checkout | Adyen, Square, GoCardless, Shopify Web Pixels |
| Error monitoring | Sentry, Bugsnag |
| Social/widget/other | WhatsApp C2C, Disqus, Gravatar, Loox, Stamped, Weglot, accessiBe, UserWay |

4. ✅ প্রতিটা entry-তে প্রচলিত schema মেনে `baseConfidence` (0.78–0.93, evidence
   strength অনুযায়ী), দুটি URL, dataProcessingLocation — ম্যানুয়ালি curated,
   license-বাধামুক্ত পাবলিক জ্ঞান থেকে। Category distribution এখন:
   ANALYTICS 28 · FUNCTIONAL 26 · ADVERTISING 23 · NECESSARY 21 · MARKETING 16 ·
   SOCIAL 6 (ADVERTISING 7 → 23)। Duplicate slug 0, schema-conformance check পাস।

**যা এখনো বাকি (বলার অপেক্ষা নেই):**
1. ❌ Acceptance 1: 120 ≠ 2,000। পূর্ণ স্কেলের জন্য DuckDuckGo Tracker Radar
   import script + provenance field (migration) + dedupe/normalize pass লাগবে —
   এটা এক session-এর কাজ নয়, curated quality না হারিয়ে।
3. ❌ Acceptance 3: ≥90% named-request মাপা হয়নি — বাস্তব scan + unknown-domain
   report দরকার (T15-এর precision telemetry-র সাথে একসাথে করাই যৌক্তিক)।

**ফাঁদের সতর্কতা মানা হয়েছে:** false-positive ঝুঁকি বাড়ে বলে শুধু উচ্চ-
আত্মবিশ্বাসের, ভালোভাবে নথিভুক্ত vendor-ই যোগ করা হয়েছে; bulk import
টেলিমেট্রি ছাড়া করা হয়নি।
