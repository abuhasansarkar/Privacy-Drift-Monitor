import { describe, expect, it } from "vitest";
import {
  POLICY_EXTRACT_V1,
  PolicyExtractOutputSchema,
  filterGroundedVendors,
  extractEffectiveDate,
  extractPolicyVendorsHeuristic,
} from "../prompts/policy-extract";

describe("Policy Extraction Schema & Prompt Contract", () => {
  it("conforms to versioned prompt contract POLICY_EXTRACT_V1", () => {
    expect(POLICY_EXTRACT_V1.version).toBe("POLICY_EXTRACT_V1");
    expect(POLICY_EXTRACT_V1.systemPrompt).toContain("strict technical document auditor");
    expect(POLICY_EXTRACT_V1.outputSchema).toBe(PolicyExtractOutputSchema);
  });

  it("validates a compliant structured output payload", () => {
    const valid = {
      effectiveDate: "2024-05-12T00:00:00.000Z",
      declaredVendors: ["Google Analytics", "Meta Pixel"],
      declaredCategories: ["Analytics", "Marketing"],
      optOutInstructionsFound: true,
    };

    const parsed = PolicyExtractOutputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed payloads missing required fields", () => {
    const invalid = {
      declaredVendors: ["Google Analytics"],
      // missing declaredCategories, optOutInstructionsFound
    };

    const parsed = PolicyExtractOutputSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

describe("LLM Grounding & Hallucination Filter", () => {
  const policyDocument = `
    Acme Corp Privacy Notice
    Effective Date: March 20, 2024
    
    We collect usage metrics to improve our service. We use Google Analytics 4
    to evaluate page traffic and Hotjar to record user sessions.
    You can opt-out by contacting support.
  `;

  it("retains vendors that are strictly present in the source text", () => {
    const candidates = ["Google Analytics", "Hotjar"];
    const grounded = filterGroundedVendors(candidates, policyDocument);
    expect(grounded).toEqual(["Google Analytics", "Hotjar"]);
  });

  it("filters out hallucinated vendors that do not appear in the text", () => {
    // TikTok and Meta Pixel are NOT in policyDocument
    const candidates = ["Google Analytics", "Meta Pixel", "TikTok", "Hotjar"];
    const grounded = filterGroundedVendors(candidates, policyDocument);
    expect(grounded).toEqual(["Google Analytics", "Hotjar"]);
    expect(grounded).not.toContain("Meta Pixel");
    expect(grounded).not.toContain("TikTok");
  });
});

describe("Deterministic Heuristic Fallback", () => {
  it("extracts effective date from multiple formats", () => {
    expect(extractEffectiveDate("Effective Date: January 15, 2025")).toContain("2025-01-15");
    expect(extractEffectiveDate("Last revised: 2023-11-04")).toContain("2023-11-04");
    expect(extractEffectiveDate("No date mentioned in this document")).toBeNull();
  });

  it("extracts known third-party tracking vendors and date from document", () => {
    const sample = `
      Privacy Policy
      Last Updated: October 10, 2024
      
      We partner with Google Analytics, Meta Pixel, and Cookiebot to provide 
      seamless user preferences and advertising attribution.
    `;

    const result = extractPolicyVendorsHeuristic(sample);
    expect(result.declaredVendors).toContain("Google Analytics");
    expect(result.declaredVendors).toContain("Meta Pixel");
    expect(result.declaredVendors).toContain("Cookiebot");
    expect(result.declaredVendors).not.toContain("TikTok Pixel");
    expect(result.effectiveDate).toContain("2024-10-10");
  });
});
