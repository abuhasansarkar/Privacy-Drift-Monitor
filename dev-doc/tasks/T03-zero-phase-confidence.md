# T03 — Phase-শূন্য scan `FULL` confidence দেখায়

**Priority:** P0 · **Status:** DONE

## সমস্যা

[score.ts](../../packages/analysis/src/score.ts)-এ:

```ts
const incomplete = input.phases.filter((phase) => phase.status !== "EXECUTED");
const confidence: ScoreConfidence = incomplete.length > 0 ? "PARTIAL" : "FULL";
```

`phases` **খালি** হলে `incomplete`-ও খালি → `confidence = "FULL"`, আর
`PARTIAL_CEILING` কখনও প্রয়োগ হয় না। অর্থাৎ **একটাও journey না চালানো scan
পূর্ণ আত্মবিশ্বাসে 100 score দেখাতে পারে।**

এটা P4-এর সরাসরি লঙ্ঘন — "অসম্পূর্ণ scan কখনও পরিষ্কার verdict দেয় না"।

## প্রমাণ (fix-এর আগে)

Local DB-তে:

```
COMPLETED  score=77  conf=FULL  phases=0  reqs=0  issues=2
```

শূন্য phase, শূন্য request — অথচ `FULL`।

## কেন এটা নীরব

`filter().length > 0` pattern-টা পড়তে সঠিক লাগে। খালি array-র ক্ষেত্রটা
আলাদা করে না ভাবলে চোখে পড়ে না, আর test suite মুছে যাওয়ায় কিছু ধরেনি।

## Acceptance

1. `computeScore({ findings: [], phases: [] })` → `confidence === "PARTIAL"`
   এবং `score <= PARTIAL_CEILING`।
2. Breakdown-এ একটা component থাকবে যার `reason` বলে দেয় **কেন** — journey-র
   নাম নয় (নাম নেই), বরং "কোনো journey record হয়নি"।
3. অন্তত একটা phase `EXECUTED` থাকলে আচরণ **আগের মতোই** থাকবে।

## যা করা হয়েছে

`computeScore`-এ খালি-phase কে আলাদা করে ধরা হয়েছে, `incomplete-scan`-এর
পাশে নতুন `no-phases` component সহ। `PARTIAL_CEILING` দুই ক্ষেত্রেই প্রয়োগ হয়।

## Evidence

`computeScore` সরাসরি ডেকে যাচাই (২০২৬-০৯-০৪):

| ইনপুট | confidence | score | component |
|---|---|---|---|
| phase ০, finding ০ | **PARTIAL** | 75 | `no-phases` |
| phase ০, ১ critical | **PARTIAL** | 75 | `severity:CRITICAL` |
| ৪ EXECUTED, finding ০ | FULL | 100 | — |
| ৪ EXECUTED, ১ critical | FULL | 75 | `severity:CRITICAL` |
| ১ FAILED phase | PARTIAL | 75 | `incomplete-scan` |

উপরের প্রথম দুই সারি আগে `FULL` ছিল। শেষ তিন সারি **অপরিবর্তিত** — regression নেই।

`npm run verify` ✅ (lint · typecheck · terminology · env · build)।

DB-তেও যাচাই: phase-শূন্য COMPLETED scan এখন **০টা** (আগে ৫৯টা, সবগুলো `FULL`)।
