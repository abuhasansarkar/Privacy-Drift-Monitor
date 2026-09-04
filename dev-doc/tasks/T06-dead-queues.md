# T06 — দুটো dead queue admin UI-তে দেখায়

**Priority:** P1 · **Status:** DONE

## সমস্যা

`QUEUE_NAMES`-এ 10টা queue। Worker registered **৮টার**।

| Queue | Producer | Consumer | বাস্তবে কাজটা কোথায় হয় |
|---|---|---|---|
| `pdm-analysis` | নেই | নেই | `worker/src/index.ts`-এ inline `analyseScan()` |
| `pdm-cleanup` | নেই | নেই | `startScheduler()` tick-এ `runRetention()` |

দুটোই [admin/queue.ts](../../src/server/admin/queue.ts)-এ তালিকাভুক্ত, তাই
`/admin/queue`-এ operator এমন দুটো queue দেখেন যা **চিরকাল শূন্য এবং কখনও নড়তে
পারে না**। Operator-এর কাছে "queue খালি" আর "queue নেই" আলাদা তথ্য — এটা
প্রথমটার ছদ্মবেশে দ্বিতীয়টা দেখাচ্ছে।

## সিদ্ধান্ত

কাজটা queue-এ সরানো **হয়নি** — inline analysis ইচ্ছাকৃত (scan-এর সাথে একই
transaction boundary), আর retention scheduler-এ থাকাই সঠিক। তাই **declaration
সরানো হয়েছে**, কাজ নয়।

## Acceptance

1. `QUEUE_NAMES`-এ শুধু সেই queue থাকবে যার worker আছে।
2. `/admin/queue` শুধু জীবন্ত queue দেখাবে।
3. `npm run build` pass।

## Evidence

কাজ করতে গিয়ে **উল্টো দিকের একটা defect-ও** ধরা পড়েছে: `ADMIN_QUEUES`-এ দুটো
dead queue ছিল, আর জীবন্ত `pdm-webhook` **ছিল না**। অর্থাৎ operator-কে দুটো
কখনও-না-নড়া queue দেখানো হচ্ছিল, আর যেটার backlog মানে customer webhook
delivery আটকে আছে — সেটাই দেখানো হচ্ছিল না।

| | আগে | পরে |
|---|---|---|
| `QUEUE_NAMES` | 10 | **8** |
| `ADMIN_QUEUES` | 9 (2 dead, webhook বাদ) | **8** |
| worker ছাড়া queue | 2 | **0** |
| admin-এ অনুপস্থিত জীবন্ত queue | 1 | **0** |

`pdm-analysis` / `pdm-cleanup`-এর কোনো অবশিষ্ট reference নেই (comment ছাড়া)।
`npm run verify` ✅
