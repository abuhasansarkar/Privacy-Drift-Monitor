# T08 — `AGENTS.md`/`CLAUDE.md` অস্তিত্বহীন ফাইলের দিকে পাঠায়

**Priority:** P1 · **Status:** DONE

## সমস্যা

দুটো ফাইলই এখনও নির্দেশ দেয়:

- `PLAN.md` পড়ো, "~402 KB, ~7,800 line", 256 KB chunk-এ পড়ো — **ফাইল নেই**
- `dev-doc/`, `dev-doc3/` দেখো — **ছিল না** (এই commit-এ `dev-doc/` নতুন করে তৈরি)
- `UI_DESIGN_PROMPTS.md`, `pnpm-workspace.yaml` — **নেই**
- "`npm run verify` runs … `test:coverage`" — **চালায় না**
- "52 model, 47 rule, 7 queue" — বাসি (58, 52, 8)

প্রতিটা agent এখন অস্তিত্বহীন ফাইল খুঁজে সময় নষ্ট করে, আর ভুল সংখ্যার উপর
ভিত্তি করে সিদ্ধান্ত নেয়।

## Acceptance

1. `AGENTS.md`/`CLAUDE.md`-এ উল্লেখিত প্রতিটা path সত্যিই আছে।
2. `verify` chain-এর বর্ণনা `package.json`-এর সাথে মেলে।
3. Scale সংখ্যা মাপা মানের সাথে মেলে।

## Evidence

**`CLAUDE.md`** — "Reading PLAN.md" section সরিয়ে "Where the plan lives" বসানো
হয়েছে, যা `NEW-PLAN.md` / `dev-doc/` / `OVERVIEW.md`-এ পাঠায়, আর স্পষ্ট করে
বলে যে ~1,700টা `§` citation **resolve করা যায় না**। `dataviz` row-এর
`Part XI §11.3` → `globals.css`। Scope section `dev-doc/tasks/`-এ পাঠায়।

**`AGENTS.md`** — "PLAN.md is the source of truth" section পুরো বদলানো হয়েছে।
Current-state paragraph এখন সত্য বলে: `verify` test চালায় **না**, কারণ test
নেই। মাপা সংখ্যা যোগ (58 model · 52 rule · 8 queue · 89 page · 0 test)।
`pnpm-workspace.yaml`-এর "tombstone awaiting deletion" → "deleted"।
"Definition of done"-এ `BUILT` বনাম `DONE` পার্থক্য যোগ।

যে ফাইল-নামগুলো এখনও দুই ডকুমেন্টে আছে, সেগুলো **"এগুলো মুছে গেছে"**
ব্যাখ্যার অংশ — পড়ার নির্দেশ নয়।

`npm run verify` ✅
