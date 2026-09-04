import { z } from "zod";

/**
 * POLICY EXTRACTION PROMPT & SCHEMA — Module 23 (Phase 14).
 *
 * Grounded extraction of declared third-party vendors, categories, and effective dates
 * from published privacy policy documents.
 */

export const PolicyExtractOutputSchema = z.object({
  effectiveDate: z
    .string()
    .nullable()
    .describe("ISO date or declared effective date string if found"),
  declaredVendors: z
    .array(z.string())
    .describe(
      "Normalized names of advertising, analytics, or tracking vendors explicitly named",
    ),
  declaredCategories: z
    .array(z.string())
    .describe(
      "Categories of data collected (e.g. Analytics, Marketing, Functional)",
    ),
  optOutInstructionsFound: z
    .boolean()
    .describe("Whether the policy provides instructions on how to opt out"),
});

export type PolicyExtractOutput = z.infer<typeof PolicyExtractOutputSchema>;

export const POLICY_EXTRACT_V1 = {
  version: "POLICY_EXTRACT_V1",
  systemPrompt: `You are a strict technical document auditor. Your task is to extract third-party vendors, analytics networks, and effective dates from legal Privacy Policy text.
Do NOT invent vendors that are not explicitly stated in the document.
Normalize vendor names to their canonical company or product names (e.g. "Google Analytics", "Meta Pixel", "Hotjar", "TikTok").
Output strictly structured JSON matching the provided schema.`,
  outputSchema: PolicyExtractOutputSchema,
};

/**
 * Verifies that extracted vendors are strictly grounded in the policy text.
 * Any vendor not appearing as a case-insensitive substring is rejected as a hallucination.
 */
export function filterGroundedVendors(
  declaredVendors: readonly string[],
  policyText: string,
): string[] {
  const lowerText = policyText.toLowerCase();
  return declaredVendors.filter((vendor) => {
    const trimmed = vendor.trim().toLowerCase();
    if (!trimmed) return false;
    return lowerText.includes(trimmed);
  });
}

/**
 * Known vendor keywords for deterministic/offline fallback extraction.
 */
const KNOWN_POLICY_VENDORS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: "Google Analytics", patterns: [/\bgoogle\s+analytics\b/i, /\bga4\b/i] },
  { name: "Google Tag Manager", patterns: [/\bgoogle\s+tag\s+manager\b/i, /\bgtm\b/i] },
  { name: "Meta Pixel", patterns: [/\bmeta\s+pixel\b/i, /\bfacebook\s+pixel\b/i] },
  { name: "Hotjar", patterns: [/\bhotjar\b/i] },
  { name: "TikTok Pixel", patterns: [/\btiktok\b/i] },
  { name: "LinkedIn Insight Tag", patterns: [/\blinkedin\b/i] },
  { name: "Microsoft Clarity", patterns: [/\bclarity\b/i, /\bmicrosoft\s+clarity\b/i] },
  { name: "HubSpot", patterns: [/\bhubspot\b/i] },
  { name: "Intercom", patterns: [/\bintercom\b/i] },
  { name: "Stripe", patterns: [/\bstripe\b/i] },
  { name: "Cookiebot", patterns: [/\bcookiebot\b/i] },
  { name: "Usercentrics", patterns: [/\busercentrics\b/i] },
  { name: "OneTrust", patterns: [/\bonetrust\b/i] },
];

/**
 * Parses effective date from policy text using standard regex patterns.
 */
export function extractEffectiveDate(text: string): string | null {
  const patterns = [
    /(?:effective\s+date|last\s+updated|last\s+revised|dated)[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
    /(?:effective\s+date|last\s+updated|last\s+revised|dated)[:\s]+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i,
    /(?:effective\s+date|last\s+updated|last\s+revised|dated)[:\s]+(\d{4}-\d{2}-\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const rawStr = match[1].trim();
      // Append UTC if no timezone is present
      const utcParseable = rawStr.includes("Z") || rawStr.includes("+") ? rawStr : `${rawStr} UTC`;
      const parsed = Date.parse(utcParseable);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
      const fallbackParsed = Date.parse(rawStr);
      if (!Number.isNaN(fallbackParsed)) {
        return new Date(fallbackParsed).toISOString();
      }
      return rawStr;
    }
  }

  return null;
}

/**
 * Deterministic offline extractor for offline tests and resilience fallback.
 */
export function extractPolicyVendorsHeuristic(policyText: string): PolicyExtractOutput {
  const declaredVendors: string[] = [];

  for (const item of KNOWN_POLICY_VENDORS) {
    if (item.patterns.some((p) => p.test(policyText))) {
      declaredVendors.push(item.name);
    }
  }

  const effectiveDate = extractEffectiveDate(policyText);
  const optOut = /opt[-\s]?out|unsubscribe|do not track/i.test(policyText);

  return {
    effectiveDate,
    declaredVendors: filterGroundedVendors(declaredVendors, policyText),
    declaredCategories: ["Analytics", "Marketing"],
    optOutInstructionsFound: optOut,
  };
}
