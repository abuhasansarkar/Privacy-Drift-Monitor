# T11 — `ScanBaseline` approval workflow

**Priority:** P2 · **Status:** TODO

## সমস্যা

Drift detection-এর জন্য reference point লাগে। এখন সেটা **implicit**:
[drift.ts](../../packages/analysis/src/drift.ts)-এর `pickBaseline()` শুধু
"সর্বশেষ completed scan" বেছে নেয়। কোনো `ScanBaseline` model **নেই**।

ফল: একটা agency বলতেই পারে না *"এই configuration-টা approved"*। গত সপ্তাহে
একটা rogue pixel বসলে সেটাই এই সপ্তাহের baseline হয়ে যায়, আর drift **থেমে
যায়** — ঠিক যখন থামা উচিত নয়।

এটা product-এর কেন্দ্রীয় প্রতিশ্রুতির ফাঁক, cosmetic নয়।

## Acceptance

1. `ScanBaseline` model — `websiteId`, `scanId`, `version`, `approvedBy`,
   `approvedAt`, `notes`।
2. Scan detail থেকে "Approve as baseline" action (RBAC: DEVELOPER+)।
3. `pickBaseline()` approved baseline থাকলে **সেটাই** নেয়, নইলে বর্তমান
   fallback।
4. Baseline promote করলে drift feed-এ একটা event — নীরবে বদলাবে না।
5. Website-এ baseline না থাকলে UI স্পষ্ট বলবে "no approved baseline", আর
   drift-কে "unverified" হিসেবে চিহ্নিত করবে।

## ফাঁদ

Baseline **version** রাখতে হবে, শুধু pointer নয়। "কোন baseline-এর বিপরীতে এই
drift" — এই প্রশ্নের উত্তর ছয় মাস পরেও দিতে হবে।
