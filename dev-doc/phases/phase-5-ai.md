# Phase 5 — AI

> **Goal:** grounded explanation and recommendation.
> **Dependencies:** Phase 4 · **Status:** 🟢 Built and **exercised against the real
> provider**. `npm run verify` passes (lint, typecheck, terminology on 358 files,
> 618 tests, `next build`). Both model tiers have produced validated, grounded
> output from live OpenAI calls — see "What is and is not verified" below.
> **Plan ref:** Part XII §12.3 (Phase 5), Part VIII (all), Part 0 §0.2 P1–P2

AI is deliberately **last of the product phases**. Everything before it works without AI, and
must continue to. The moat is the grounding, not the model.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 5.1 | `AIProvider` interface + `OpenAIProvider` + `MockProvider` | M | [16-ai-layer](../features/16-ai-layer.md) | ✅ |
| 5.2 | Context builders for all four MVP features | M | [16-ai-layer](../features/16-ai-layer.md) | ✅ |
| 5.3 | Prompts (versioned) + JSON output schemas | M | [16-ai-layer](../features/16-ai-layer.md) | ✅ |
| 5.4 | Validation pipeline: schema, grounding, terminology, claim checks | M | [16-ai-layer](../features/16-ai-layer.md) | ✅ |
| 5.5 | Caching (`inputHash`), deduplication lock, usage metering, budget enforcement | M | [16-ai-layer](../features/16-ai-layer.md) | ✅ |
| 5.6 | AI job + API routes | S | [16-ai-layer](../features/16-ai-layer.md) | 🟡 |
| 5.7 | UI: `AiOutputCard`, issue detail sections 7–8, drift summary, client message dialog, `/app/ai` | L | [16-ai-layer](../features/16-ai-layer.md) | 🟡 |
| 5.8 | AI settings page + usage chart + admin AI usage page | M | [16-ai-layer](../features/16-ai-layer.md) | 🟡 |

**Where the 🟡 marks are, and why:**

- **5.6** — the `ai` BullMQ queue, the worker job and four Server Actions exist and
  the job has been run end-to-end. The `POST /api/ai/*` REST routes of §3.9's page
  inventory do **not** exist: every AI surface in the app calls a Server Action, and
  a second unauthenticated-by-default entry point to a billable operation is not
  worth adding before something consumes it. Add them with the public API.
- **5.7** — `AiOutputCard`, issue sections 7–8, the drift summary, the client message
  dialog and `/app/ai` are all built. `/app/ai` is behind `AI_ASSISTANT_PAGE`, which
  defaults **off**, so nothing has rendered it with the flag on.
- **5.8** — the agency AI settings page, credit meter and usage chart are built.
  `/admin/ai-usage` is **not**: `/admin` does not exist at all (Phase 6, feature 19),
  and an admin page with no admin shell, no `SUPER_ADMIN` gate and no audit logging
  around it would be a cross-tenant read with none of its controls. `AIRequest`
  already stores everything that page needs (`promptVersion`, `creditsCharged`,
  `validationErrors`, `feedbackScore`) and carries a `(feature, promptVersion)`
  index for it.

## What is and is not verified

Following the Phase 4 model: ✅ only where a test or an observed run backs it.

| | |
|---|---|
| Built and exercised | `packages/ai` (97 tests), the validation pipeline against every `MockProvider` misbehaviour, the cache/budget/dedupe orchestrator, `IssueEvidence` persistence against real Postgres, the `ai` job end-to-end against Postgres + Redis with `AI_PROVIDER=mock` |
| Exercised against the real dependency | **OpenAI.** Both tiers produce validated, grounded output: `gpt-4o-mini-2024-07-18` (standard, ~$0.00029/call) and `gpt-5-nano-2025-08-07` (advanced, ~$0.00015/call). Every validator passed on real model output — the citations resolved, the terminology was clean, no completion claims. `worker/src/ai.smoke.ts` runs the whole path. |
| Does **not** exist | `POST /api/ai/*`, `/admin/ai-usage`, the V1.5 features (`CLASSIFY_TRACKER`, `ROOT_CAUSE`, `DEVELOPER_TASK`), the V2 Copilot and NL search |

### A Phase 3 gap this phase had to close

`IssueEvidence` **had no writer**. §5.6 lists "insert `IssueEvidence`" in the
scan-completion transaction and §0.2 P2 makes those rows the anchor every AI
citation must resolve to — but Phase 3 built the rule engine's
`Finding.evidenceRefs` and never persisted them. The table was empty (0 rows
against a populated `network_requests`), so the grounding check would have
rejected every AI output for the right reason and the wrong cause, and the
symptom would have read as "AI never works".

Closed here: `resolveEvidence()` in `worker/src/analysis.ts` resolves a rule's
refs against the rows already in memory, and `upsertFromScan` writes them inside
the same transaction as the issue. Delete-then-insert per `(issue, scan)` keeps
it idempotent under replay (P6). Four integration tests against real Postgres.

### Model configuration — three live-verified traps

`AI_MODEL_STANDARD=gpt-4o-mini`, `AI_MODEL_ADVANCED=gpt-5-nano`. All three of
the following were measured against the API, not assumed:

1. **Model ids are matched exactly.** `GPT-4o-mini` (wrong case) and
   `gpt-4o-mini ` (trailing space) both return `400 model_not_found`. That
   status is permanent and never retried, so a typo presents as "AI is broken".
   `loadAIConfig` now trims; case is deliberately left alone, because silently
   lower-casing would hide a real typo.
2. **Reasoning tokens are spent from the answer's budget.** `gpt-5-nano` at our
   400-token `EXPLAIN_ISSUE` cap, with default effort, spent **all 384 output
   tokens on reasoning and returned nothing** (`status: incomplete`,
   `reason: max_output_tokens`) — billed, with no answer. `AI_REASONING_EFFORT=minimal`
   brings reasoning to 0 and the answer lands in ~222 tokens. The parameter is
   sent **only** to reasoning models: passing it to `gpt-4o-mini` is a permanent
   `400 unsupported_parameter`.
3. **An `incomplete` response is a 200 that must not be retried.** Before this,
   the empty output fell through to "no output text", which was classified
   **retryable** — so BullMQ would have retried an identical call for an
   identical bill. Now permanent, with the reasoning-token count in the message.

### ⚠️ The tier ratio is inverted, and it is a decision, not a bug to fix here

`gpt-5-nano` costs **less** than `gpt-4o-mini` — measured live at $0.00015 vs
$0.00029 per call — yet §8.9 charges 3 credits for an advanced call and 1 for a
standard one. A customer would pay 3× for a call that costs us about half.

**No MVP feature reaches the advanced tier** (`FEATURE_TIER` maps only
`CLASSIFY_TRACKER` and `ROOT_CAUSE` to it, both V1.5), so this has no effect
today. It must be resolved before either ships: either point `AI_MODEL_ADVANCED`
at a genuinely larger model — which is what §8.3's "multi-step reasoning over
more context" describes — or revisit §8.9's credit ratio. Changing the plan's
accounting is not a decision the code should make on its own, so the inversion
is asserted in `budget.test.ts` to keep it visible.

### A 100× money bug that a green test suite could not see

`usdToMicroCents` and `microCentsToUsd` were **both** wrong by the same factor —
a micro-*dollar* scale against `DEFAULT_PRICING`'s micro-*cent* one. Being wrong
in both directions made them exact inverses, so every round-trip assertion
passed.

The effect: `AI_DAILY_BUDGET_USD=50` produced a cap that a real call would have
exhausted after ~1,889 requests and about **fifty cents** of spend — §8.9's
"backstop against a runaway loop" firing platform-wide, on itself, at 1/100th of
its configured value.

Invisible until a real provider call put a real cost beside a real budget.
`budget.test.ts` now anchors to **absolute** dollar values (a real recorded
call's token counts against OpenAI's published rate) rather than round-tripping,
because a round trip cannot see a consistently wrong pair.

### A defect found only by running it

`resolveProvider("mock")` built a `MockProvider` with no evidence refs, so every
local generation cited nothing, failed `evidence_refs.min(1)`, and reported
`VALIDATION_FAILED`. The whole suite was green through it, because the tests
always pass `groundedRefs` explicitly. The mock now reads the refs out of the
request it was handed, exactly as a real model does. `worker/src/ai.smoke.ts` is
the script that found it.

## The four MVP AI features

| Feature | Persona | Job |
|---|---|---|
| Issue explanation | B (account manager) | Turn a technical finding into something forwardable |
| Fix recommendation | C (developer) | The shortest path to a fix, with verification steps |
| Drift summary | A, B | "What changed this week?" in one paragraph |
| Client message | B | Turns a 30-minute writing task into 2 minutes |

## Order of attack

Build **5.4 the validation pipeline before 5.1's real provider**. Wire `MockProvider` first
and make it emit deliberately bad output — fabricated evidence refs, banned terminology,
unsupported claims — then prove each validator rejects it. A validation pipeline written
after the happy path is a validation pipeline with holes.

```
5.1 (interface + MockProvider)  →  5.3 schemas  →  5.4 validators  →  5.2 context builders
   →  5.1 (OpenAIProvider)  →  5.5 caching/budget  →  5.6 job+routes  →  5.7/5.8 UI
```

## Critical implementation rules

**Grounding is mandatory and enforced at the validation boundary.** Every output carries
`evidence_refs` that must resolve to real `IssueEvidence` primary keys. An unresolvable ref
means the whole response is rejected — the user sees the deterministic content instead, which
was always sufficient on its own.

**Terminology validation runs on AI output, not just on our own copy.** The forbidden list
from Part I §1.12 is included explicitly in the system prompt (Part VIII §8.7) *and* checked
on the way out. A response containing "GDPR violation" is rejected.

**Budgets enforce before the provider is contacted**, never after. Exceeding a per-agency
credit cap blocks the call; the platform daily budget is a hard kill switch.

**Cache on `inputHash`.** An identical second request is served from cache at zero cost. Add a
deduplication lock so two concurrent identical requests make one provider call.

**Every AI surface degrades gracefully.** With the provider unreachable, scanning, detection,
drift, scoring, alerts and reports all continue unaffected; AI sections show "temporarily
unavailable" and the technical details above them are complete.

**Drafts are always human-edited before sending.** The client message generator produces a
draft in an editable field — it never sends anything itself.

**Every AI output carries a persistent visible label** — "AI-generated from the evidence
above" — plus links to the evidence it used, plus thumbs up/down feedback.

## Acceptance criteria

From §12.3 and M9 (§12.4).

- [x] ✅ An explanation references only real evidence IDs — `validate.test.ts`, and
      confirmed end-to-end in `ai.smoke.ts`: both cited refs resolved to real
      `IssueEvidence` primary keys
- [x] ✅ A response with a fabricated ref is rejected and the deterministic content
      shows instead — `validate.test.ts`; the whole response dies on ONE bad ref,
      and a real id that was never in the context is rejected too
- [x] ✅ A response asserting a legal conclusion is rejected — `validate.test.ts`.
      The fixture takes its banned phrase from `FORBIDDEN_TERMS[0]` rather than
      typing one, so it can never drift from the list the validator enforces
- [x] ✅ An identical second request is served from cache at zero cost —
      `run.test.ts` asserts it by COUNTING PROVIDER CALLS, and `ai.smoke.ts`
      confirmed it against Postgres: `SUCCESS`/1 credit then `CACHED`/0 credits
      on the same `inputHash`
- [x] ✅ Exceeding the credit cap blocks the call **before** the provider is
      contacted — `run.test.ts`, asserted as `provider.calls).toHaveLength(0)`.
      The same holds for the platform daily cap and the agency off switch
- [x] ✅ With the AI provider unreachable, every other part of the product works and
      the AI sections show the unavailable state — `run.test.ts` proves the
      orchestrator returns a renderable outcome rather than throwing; `AiUnavailable`
      renders §12.3's exact wording. **Not** verified by taking a live provider down
- [x] ✅ Claim checks and `is_hypothesis` handling reject unsupported assertions —
      `validate.test.ts`, including a negative case proving "this can be fixed by…"
      does NOT trip the claim validator

## Risk controls owned by this phase

| Risk | Control |
|---|---|
| AI hallucination reaches a client (Low/**High**) | Grounding check on every ref, terminology validator, claim validator, `is_hypothesis`, drafts always human-edited. **Fallback: kill switch via feature flag** — deterministic content is always sufficient |
| AI cost runaway (Medium/Medium) | Per-agency caps, platform daily budget kill switch, caching, model tiering, on-demand default |

`AI_AUTO_EXPLAIN` off stops all automatic AI spend instantly. Treat both AI flags as
operational kill switches, not just rollout tools.
