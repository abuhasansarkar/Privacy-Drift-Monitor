# Module 15 — Grounded AI Architecture & Safety Controls

> **Tier:** V1 · **Package:** `@pdm/ai`  
> **Status:** ✅ Complete & Live-Verified (OpenAI standard & advanced tiers tested)

---

## 1. Objective & Business Pain
Translating raw network logs into client-ready explanations takes account managers 30+ minutes per issue. However, ungoverned AI risks hallucinating regulatory violations or giving unauthorized legal advice.

## 2. Architecture & Safety Invariants
* **Grounding Invariant:** Every AI output must include `evidence_refs` matching verified `IssueEvidence` primary keys.
* **Terminology Enforcement:** Prompts include the forbidden terminology list; outputs with banned words fail validation.
* **Cost Controls:**
  * Context hashing (`inputHash`) serves cached explanations instantly with 0 tokens consumed.
  * Pre-call budget checker stops execution if agency credits are depleted.
* **3-Tier Model Routing:**
  * `FAST_MODEL` (`gpt-4o-mini`): Explanations and client messages.
  * `REASONING_MODEL` (`gpt-5-nano` / O-series): Root cause and policy reconciliation.
  * `CLASSIFICATION_MODEL`: Unknown vendor identification.

## 3. Implementation Code
```typescript
// packages/ai/src/validate.ts
export function validateAIOutput(rawOutput: unknown, validEvidenceIds: Set<string>): ValidationResult;
```

## 4. Key Files
* `packages/ai/src/prompts/`: Versioned prompt templates (`*_V<n>`).
* `packages/ai/src/validate.ts`: Output schema and evidence grounding validation.
* `packages/ai/src/budget.ts`: Pre-call credit and token budget enforcement.

## 5. Acceptance Criteria
* **Given** an LLM completion referencing an imaginary evidence ID `evi_fake_123`,
* **When** running `validateAIOutput()`,
* **Then** validation fails with `UNRESOLVABLE_EVIDENCE_REF`,
* **And** the output is discarded.
