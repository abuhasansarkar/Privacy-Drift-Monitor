# Module 23 — AI Policy-to-Code Reconciliation Engine

> **Tier:** V2 · **Package:** `@pdm/analysis`, `@pdm/ai`  
> **Status:** ✅ Core Models Defined

---

## 1. Objective & Business Pain
The Federal Trade Commission (FTC Act § 5) actively penalizes companies (e.g., BetterHelp, GoodRx) whose published privacy policies claim *"We never sell or share your data for advertising"*, while technical site audits reveal active Meta, TikTok, or Google remarketing pixels.

## 2. Architecture & Pipeline
1. **Policy Extraction:** Crawls `/privacy-policy` and extracts declared third parties and data-sharing claims.
2. **Technical Cross-Reference:** Compares extracted claims against real network requests recorded by the Playwright scanner.
3. **Contradiction Detection:** Evaluates discrepancies using the reasoning LLM tier (`gpt-5-nano` / O-series).
4. **Rule Trigger:** Discrepancies generate `PDM-R041: POLICY_CONTRADICTION_DISCLOSED`.

## 3. Database Schema
```prisma
model PolicyAudit {
  id              String   @id @default(uuid())
  websiteId       String
  policyUrl       String
  extractedClaims Json
  observedVendors Json
  discrepancies   Json
  createdAt       DateTime @default(now())
}
```

## 4. Key Files
* `packages/analysis/src/rules/policy-compliance.ts`: Reconciliation engine.
* `packages/ai/src/prompts/policy-audit.ts`: Policy analysis prompt template.

## 5. Acceptance Criteria
* **Given** a privacy policy explicitly declaring *"No third-party ad networks are used"*,
* **When** the scanner observes active Meta Pixel and TikTok requests,
* **Then** finding `PDM-R041` is generated, linking the conflicting text and request evidence.
