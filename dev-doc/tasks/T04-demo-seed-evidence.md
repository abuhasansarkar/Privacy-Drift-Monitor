# T04 — Demo seed evidence row লেখে না, তাই UI খালি দেখায়

**Priority:** P0 · **Status:** DONE

## সমস্যা

`seed-demo.ts` প্রতিটা `Scan` row-এ **counter** বসায়:

```ts
requestCount: 40 + Math.round(random() * 60),
cookieCount:  8  + Math.round(random() * 10),
trackerCount: 2  + Math.round(random() * 3),
```

কিন্তু সেই counter-এর পেছনের **row গুলো তৈরি করে না**। Local DB-তে মাপা:

| Table | Row |
|---|---|
| `Scan` | 127 |
| `TrackerDetection` | 336 |
| `ScanPhase` | **5** (127 scan-এর জন্য) |
| `NetworkRequest` | **0** |
| `CookieRecord` | **0** |
| `StorageEntry` | **0** |

`evidencePrunedAt` সব scan-এ `null` — অর্থাৎ retention মোছেনি, **কখনও লেখাই
হয়নি**।

## এর ফল — এটাই "UI perfectly show hoitese na"

- Scan detail "52 requests" বলে, নিচের evidence table **খালি**
- Cookies tab খালি
- Consent tab খালি (phase নেই, তাই কোন journey চলল বোঝার উপায় নেই)
- Evidence vault খালি
- Website hub-এর ট্যাবগুলো empty state দেখায়, অথচ scan "COMPLETED"

Schema-র নিজের comment এটাকেই সতর্ক করে:

> *"a scan with a score and an empty request list is indistinguishable from a
> broken one"*

Counter আর evidence একে অপরকে মিথ্যা প্রমাণ করছে।

## Acceptance

1. `npm run db:seed:demo` চালানোর পর প্রতিটা COMPLETED scan-এর জন্য:
   - `ScanPhase` row থাকবে (প্রতি journey একটা)
   - `NetworkRequest` row-এর সংখ্যা `scan.requestCount`-এর **সমান**
   - `CookieRecord` row-এর সংখ্যা `scan.cookieCount`-এর **সমান**
2. PARTIAL scan-এ অন্তত একটা phase `EXECUTED` ছাড়া অন্য status-এ থাকবে,
   যাতে PARTIAL UI path সত্যিই দেখা যায়।
3. Counter আর row count কোথাও অমিল থাকবে না।

## যা করা হয়েছে

`seed-demo.ts`-এ evidence writer যোগ করা হয়েছে: phase (journey-প্রতি),
network request (tracker + first-party মিশিয়ে, consent phase ট্যাগসহ),
cookie record (attribute সহ), storage entry। Counter গুলো এখন **derived** —
হাতে বসানো random সংখ্যা নয়, বরং যা সত্যিই লেখা হলো তার count।

## Evidence

দুটো agency-তে re-seed করে DB গুনে দেখা (২০২৬-০৯-০৪):

| Table | আগে | পরে |
|---|---|---|
| `ScanPhase` | 5 | **480** |
| `NetworkRequest` | 0 | **2,846** |
| `CookieRecord` | 0 | **934** |
| `StorageEntry` | 0 | **456** |

Consent phase অনুযায়ী request বণ্টন (একটা agency):
`ACCEPT_ALL` 468 · `NO_CONSENT` 360 · `WITHDRAW` 300 · `REJECT_ALL` 295 —
অর্থাৎ journey গুলো সত্যিই আলাদা আচরণ দেখায়, সব এক phase-এ ঢালা হয়নি।

Phase status: 239 `EXECUTED`, 1 `FAILED` (PARTIAL scan-টা)।

**Consistency:**
- counter ≠ row অমিল: **০** (60টা scan যাচাই)
- phase-শূন্য COMPLETED scan: **০**

**UI tab গুলো একটা scan-এ এখন যা পায়:**
Consent 4 · Evidence 24 · Cookies 8 · Storage 4 · Trackers 3 — সবই আগে ০ ছিল।
Pre-consent third-party request (product-এর মূল finding) এখন query-তে ধরা পড়ে:
`POST 204 connect.facebook.net` under `NO_CONSENT`।
