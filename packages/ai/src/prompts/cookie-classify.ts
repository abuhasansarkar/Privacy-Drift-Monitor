import { z } from "zod";

/**
 * COOKIE CLASSIFICATION PROMPT — Phase 17 task 17.4.
 *
 * Classifies unknown browser cookies and storage entries into standard regulatory
 * categories (NECESSARY, ANALYTICS, ADVERTISING, FUNCTIONAL) based on technical
 * attributes: name, domain, lifetime, path, initiating script, and call stack trace.
 */

export const CookieClassifyOutputSchema = z.object({
  category: z.enum(["NECESSARY", "ANALYTICS", "ADVERTISING", "FUNCTIONAL"]),
  vendorName: z.string().describe('Identified provider or vendor, or "First Party"'),
  purpose: z.string().describe(
    "Short 1-sentence technical explanation of what this cookie or storage key does",
  ),
  confidence: z.number().min(0).max(1),
});

export type CookieClassifyOutput = z.infer<typeof CookieClassifyOutputSchema>;

export const COOKIE_CLASSIFY_USER_V1 = `Classify this detected browser cookie or storage entry:

COOKIE CONTEXT:
{{contextJson}}

Produce:
- category: NECESSARY | ANALYTICS | ADVERTISING | FUNCTIONAL
- vendorName: Identified provider or vendor name (or "First Party")
- purpose: 1-sentence technical explanation of what this cookie or storage key does
- confidence: between 0.0 and 1.0`;

export const COOKIE_CLASSIFY_V1 = {
  version: "COOKIE_CLASSIFY_V1",
  systemPrompt: `You are a technical web privacy assistant and cookie taxonomist inside a monitoring platform.
Given the technical attributes of a browser cookie or storage item (name, domain, duration/expiry, initiating script URL, and call stack trace), identify its primary category and vendor.
Adhere to strict technical privacy standards. If the cookie is used for cross-site targeting, behavioral remarketing, or ad conversion, classify as ADVERTISING. If used for traffic metrics, classify as ANALYTICS. If essential for site security, session maintenance, or CSRF protection, classify as NECESSARY. Otherwise, classify as FUNCTIONAL.
Do NOT state or imply legal conclusions. Never use banned compliance terms.`,
  userPrompt: COOKIE_CLASSIFY_USER_V1,
  outputSchema: CookieClassifyOutputSchema,
};
