# T16 — OpenTelemetry, soak test, runbook

**Priority:** P3 · **Status:** TODO

## যা নেই

| বিষয় | অবস্থা |
|---|---|
| Sentry (client/server/edge) | ✅ আছে |
| pino structured log | ✅ আছে |
| `/api/health`, `/api/health/ready` | ✅ আছে |
| **OpenTelemetry distributed trace** | ❌ web → queue → worker জোড়া লাগে না |
| **Soak test** | ❌ `load/` আছে, কেউ চালায়নি |
| **Backup/restore rehearsal** | ❌ RPO/RTO কাগজে, বাস্তবে অপরীক্ষিত |
| **Runbook** | ❌ `dev-doc/ops/`-এর সাথে মুছে গেছে |

## সবচেয়ে জরুরি: BrowserPool leak

Codebase-এর নিজের documentation বলে leaked Playwright context-ই worker মারার
সবচেয়ে সম্ভাব্য উপায়। `phase-runner.ts`-এর `finally` block `unrouteAll()` +
`close()` করে, আর সেটা একবার আসল leak ধরেছিল।

**কিন্তু ২৪ ঘণ্টার soak কখনও চালানো হয়নি।** যে failure mode-কে সবচেয়ে
ভয় পাওয়া হচ্ছে, সেটাই সবচেয়ে কম পরীক্ষিত।

## Acceptance

1. ২৪ ঘণ্টা soak, ব্যর্থ scan মিশিয়ে — শেষে `activeContexts === 0`,
   RSS সমতল।
2. একটা trace id web request থেকে worker job পর্যন্ত অনুসরণ করা যায়।
3. একটা restore সত্যিই করা হয়েছে, আর বাস্তব RPO/RTO লেখা আছে।
4. Runbook: worker আটকে গেলে, queue জমে গেলে, DB fail করলে কী করতে হবে।
