# T13 — AI feature ৫–৮

**Priority:** P2 · **Status:** TODO

## সমস্যা

`AIFeature` DB enum-এ ৮টা value। Prompt আর dispatch আছে **৪টার**:

| Feature | Prompt | Grounding field | অবস্থা |
|---|---|---|---|
| `EXPLAIN_ISSUE` | ✅ | `evidence_refs` | কাজ করে |
| `RECOMMEND_FIX` | ✅ | `evidence_refs` | কাজ করে |
| `SUMMARIZE_DRIFT` | ✅ | `events_referenced` | কাজ করে |
| `CLIENT_MESSAGE` | ✅ | `null` (by construction) | কাজ করে |
| `CLASSIFY_TRACKER` | ❌ | `null` | prompt নেই |
| `ROOT_CAUSE` | ❌ | ❌ | শুধু enum |
| `DEVELOPER_TASK` | ❌ | ❌ | শুধু enum |
| `WEBSITE_SUMMARY` | ❌ | ❌ | শুধু enum |

শেষ তিনটা dispatch করলে `checkGrounding()` **fail closed** করে
(`GROUNDING_FAILED`, `repairable: false`) — আচরণটা **সঠিক**। কিন্তু এগুলো
feature নয়, **reserved id**।

## Acceptance

1. স্বল্পমেয়াদে: `RESERVED_AI_FEATURES` তালিকা যোগ, `RULES`/`RESERVED_RULE_IDS`
   যেভাবে আলাদা, ঠিক সেভাবে — প্রতিটার পাশে কী evidence লাগবে লেখা।
2. দীর্ঘমেয়াদে প্রতিটার জন্য: prompt + `_V1` version + `GROUNDING_FIELD` entry
   + output schema + grounding test।
3. `ROOT_CAUSE` আর `DEVELOPER_TASK`-এর grounding `evidence_refs` **হতেই হবে** —
   এ দুটো technical দাবি করে, তাই ungrounded হতে পারে না।
4. `WEBSITE_SUMMARY` একাধিক scan জুড়ে — grounding field নতুন (`scans_referenced`)।

## নিয়ম

Prompt লিখলে version **অবশ্যই** `_V1` দিয়ে শুরু, আর `PROMPTS` map-এর `version`
field-এ হুবহু সেই নাম। Version `inputHash`-এ যায় — না মিললে cache চিরকাল ভুল
output দেবে।
