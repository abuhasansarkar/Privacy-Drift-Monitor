# Feature 16 — AI Layer

> **Phase:** 5 · **Priority:** P0 (explanation) / P1 (rest) · **Effort:** M×5 + L + M · **Value:** 5
> **Status:** 🟢 Built — 97 tests in `packages/ai`, plus an end-to-end run of the
> worker job against Postgres + Redis with `AI_PROVIDER=mock`. The real provider
> has never been called. See `dev-doc/phases/phase-5-ai.md` for the full
> ✅/🟡 breakdown and the two gaps this phase had to close.
> **Plan refs:** Part VIII (all), Part 0 §0.2 P1–P2, Part I §1.12 (terminology)

## What it is

A provider-agnostic AI layer that **explains verified evidence**. Four MVP features: issue
explanation, fix recommendation, drift summary, client message. Plus caching, metering and
hard budget enforcement.

## Why it exists

JTBD J4 (*"explain this in language I can forward to a client"*) and J5 (*"tell me exactly
how to fix it"*). Persona B currently spends 30 minutes translating a finding and risks saying
something wrong.

**The moat is the grounding, not the model.** Anyone can call an LLM; nobody else has our
evidence.

## Dependencies

Features 07 (evidence), 09 (issues), 10 (drift). Nothing depends on this — by design.

## Public interface

```ts
AIProvider                                        // provider.ts
validateAIOutput(feature, raw, ctx)               // validate.ts
```

## The two governing principles

**P1 — AI is never the detector.** It may not be the authority on whether a request happened,
a cookie exists, a consent button was clicked, a tracker fired, a scan succeeded, or a site
was reachable.

**P2 — AI explains evidence; AI does not invent evidence.** Every output carries
`evidence_refs` that must resolve to real `IssueEvidence` primary keys.

## Build steps

- [x] `AIProvider` interface + `OpenAIProvider` + **`MockProvider`**
- [x] Model IDs in **configuration**, not code — a provider swap is config plus one adapter
- [x] Context builders for all four features (token-budgeted)
- [x] Versioned prompts + strict JSON output schemas
- [x] **Validation pipeline — build this before the real provider:**
  - [x] Schema validation
  - [x] **Grounding check** — every `evidence_ref` resolves, or the response is rejected
  - [x] **Terminology check** — the Part I §1.12 forbidden list, also embedded in the system prompt
  - [x] **Claim check** + `is_hypothesis` handling
  - [x] Repair path for recoverable failures
- [x] Caching on `inputHash` + deduplication lock for concurrent identical requests
- [x] Usage metering; **per-agency credit caps and a platform daily budget, enforced before
      the provider call**
- [x] AI job (`ai` BullMQ queue, §7.2 concurrency 5) + four Server Actions.
      🟡 `POST /api/ai/*` does not exist — nothing consumes it, and a second
      entry point to a billable operation is not worth adding before it does
- [x] `AiOutputCard` — persistent "AI-generated from the evidence above" label, confidence
      pill, inline evidence links, thumbs up/down feedback
- [x] Issue detail sections 7 (explanation) and 8 (recommended action)
- [x] Drift summary; client message dialog (**editable draft — never auto-sent**)
- [x] `/app/ai` task panel (not a chat) with a credit meter — flagged
      `AI_ASSISTANT_PAGE`, which defaults **off**, so it has not been rendered
      with the flag on. Flag resolution added in `src/server/flags.ts`
- [x] AI settings page + credit meter + usage chart.
      🟡 `/admin/ai-usage` deferred to Phase 6 — `/admin` does not exist, and an
      admin page with no `SUPER_ADMIN` gate and no audit logging is a
      cross-tenant read with none of its controls

## Acceptance criteria

- [x] An explanation references only real evidence IDs
- [x] A response with a fabricated ref is rejected and **the deterministic content shows instead**
- [x] A response asserting a legal conclusion is rejected (the fixture takes its
      banned phrase from `FORBIDDEN_TERMS[0]`, so it cannot drift from the list)
- [x] An identical second request is served from cache at zero cost
- [x] Exceeding the credit cap blocks the call **before** the provider is contacted
- [x] With the provider unreachable, every other part of the product works and AI sections show
      the unavailable state: *"AI explanations are temporarily unavailable. The technical
      details above are complete."*
- [x] Every AI surface carries the persistent AI label and evidence links
- [x] Client messages are drafts requiring human edit — there is deliberately no
      code path from the dialog to `@pdm/email`

## Tests required

| Level | What |
|---|---|
| Unit (`MockProvider`) | Schema validation · **grounding rejection on an unresolvable ref** · terminology rejection · claim rejection · repair path · cache hit/miss · budget enforcement · context token budget |
| Integration | Circuit breaker opening; graceful degradation of every AI surface |
| Manual | Review outputs for tone and accuracy on **20 real issues** before launch — ⬜ **NOT DONE.** It cannot be: `AI_API_KEY` is unset and no request has ever reached a provider. This is the gate before launch, not before merge. |

Make `MockProvider` emit deliberately bad output — fabricated refs, banned terms, unsupported
claims — and prove each validator rejects it. A validation pipeline written after the happy
path has holes.

## Risk controls

| Risk | Control |
|---|---|
| Hallucination reaches a client (Low/**High**) | Grounding, terminology and claim validators; `is_hypothesis`; drafts always human-edited. **Kill switch via feature flag** |
| Cost runaway (Medium/Medium) | Per-agency caps, platform daily budget kill switch, caching, model tiering, on-demand default |

`AI_AUTO_EXPLAIN` off stops all automatic AI spend instantly.

## Traps

- Auto-explaining every Critical issue is an opt-in agency setting, not a default-on behaviour
  — it is the main uncontrolled cost vector.
- The AI must never restate a fact it wasn't given. Context builders decide what it can see;
  keep them tight and token-budgeted.
- Section 2 of the issue page ("Why this matters technically") is **static rule-authored copy,
  not AI** — it must read identically every time.
- Out of MVP scope: root-cause analysis (V1.5), unknown-tracker classification (V1.5),
  Privacy Copilot and NL search (V2).
