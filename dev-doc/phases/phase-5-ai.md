# Phase 5 — AI

> **Goal:** grounded explanation and recommendation.
> **Dependencies:** Phase 4 · **Status:** ⬜ Not started
> **Plan ref:** Part XII §12.3 (Phase 5), Part VIII (all), Part 0 §0.2 P1–P2

AI is deliberately **last of the product phases**. Everything before it works without AI, and
must continue to. The moat is the grounding, not the model.

## Tasks

| # | Task | Effort | Feature doc | Status |
|---|---|---|---|---|
| 5.1 | `AIProvider` interface + `OpenAIProvider` + `MockProvider` | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.2 | Context builders for all four MVP features | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.3 | Prompts (versioned) + JSON output schemas | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.4 | Validation pipeline: schema, grounding, terminology, claim checks | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.5 | Caching (`inputHash`), deduplication lock, usage metering, budget enforcement | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.6 | AI job + API routes | S | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.7 | UI: `AiOutputCard`, issue detail sections 7–8, drift summary, client message dialog, `/app/ai` | L | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |
| 5.8 | AI settings page + usage chart + admin AI usage page | M | [16-ai-layer](../features/16-ai-layer.md) | ⬜ |

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

- [ ] An explanation references only real evidence IDs
- [ ] A response with a fabricated ref is rejected and the deterministic content shows instead
- [ ] A response containing "GDPR violation" is rejected
- [ ] An identical second request is served from cache at zero cost
- [ ] Exceeding the credit cap blocks the call **before** the provider is contacted
- [ ] With the AI provider unreachable, every other part of the product works and the AI
      sections show the unavailable state
- [ ] Claim checks and `is_hypothesis` handling reject unsupported assertions

## Risk controls owned by this phase

| Risk | Control |
|---|---|
| AI hallucination reaches a client (Low/**High**) | Grounding check on every ref, terminology validator, claim validator, `is_hypothesis`, drafts always human-edited. **Fallback: kill switch via feature flag** — deterministic content is always sufficient |
| AI cost runaway (Medium/Medium) | Per-agency caps, platform daily budget kill switch, caching, model tiering, on-demand default |

`AI_AUTO_EXPLAIN` off stops all automatic AI spend instantly. Treat both AI flags as
operational kill switches, not just rollout tools.
