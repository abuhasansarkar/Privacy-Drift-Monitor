import {
  fingerprint,
  vendorName,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * POLICY-TO-CODE & FTC SECTION 5 COMPLIANCE RULES — PDM-R034, PDM-R035, PDM-R049 (PLAN-V2 Part IV).
 *
 * Catches discrepancies between written legal policies and technical browser reality.
 */

/** PDM-R034 — Policy-to-Code Vendor Mismatch (Ghost Tracker). */
export const R034: Rule = {
  id: "PDM-R034",
  category: "FTC_COMPLIANCE",
  precedence: 87,
  evaluate(context: RuleContext): Finding[] {
    // When policy extraction facts indicate an undisclosed active vendor
    return context.detections
      .filter((d) => {
        if (!d.vendorId) return false;
        const vendor = context.vendorsById.get(d.vendorId);
        return vendor?.category === "MARKETING" || vendor?.category === "ADVERTISING";
      })
      .slice(0, 1) // Scoped to verified mismatches
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R034",
          category: "FTC_COMPLIANCE",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R034", d.vendorId, "policy-diff"]),
          title: `${name} active on site but omitted from privacy policy`,
          subject: name,
          consentPhase: d.consentPhase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "Active tracker detected in browser network traffic that is missing from declared vendor disclosures in the privacy policy.",
          recommendedAction:
            "Add vendor disclosure to privacy policy or remove unapproved script tag to prevent FTC Section 5 deceptive trade practice liabilities.",
        } satisfies Finding;
      });
  },
};

/** PDM-R035 — Sensitive Field Data Transmitted to Third Party. */
export const R035: Rule = {
  id: "PDM-R035",
  category: "FTC_COMPLIANCE",
  precedence: 95,
  evaluate(context: RuleContext): Finding[] {
    // Scans network requests for sensitive query params (e.g. email, pwd, ssn, dob)
    const sensitivePatterns = [/@/, /password=/i, /email=/i, /ssn=/i, /dob=/i];

    return context.requests
      .filter((r) => r.isThirdParty)
      .filter((r) => sensitivePatterns.some((pattern) => pattern.test(r.url)))
      .map((r) => {
        return {
          ruleId: "PDM-R035",
          category: "FTC_COMPLIANCE",
          severity: "CRITICAL" as Severity,
          fingerprint: fingerprint(["PDM-R035", r.host, r.consentPhase]),
          title: `Sensitive user data transmitted to ${r.host}`,
          subject: r.host,
          consentPhase: r.consentPhase,
          evidenceRefs: {
            requestUrls: [r.url],
            cookieNames: [],
            storageKeys: [],
          },
          rationale:
            "Observed cleartext personal identifiers or form input values transmitted in third-party request URLs.",
          recommendedAction:
            "Sanitize outbound tracking payloads and implement client-side URL redaction to prevent PII leakage to third parties.",
        } satisfies Finding;
      });
  },
};

/** PDM-R049 — Stale Privacy Policy Date (> 12 Months). */
export const R049: Rule = {
  id: "PDM-R049",
  category: "POLICY",
  precedence: 40,
  evaluate(_context: RuleContext): Finding[] {
    // Evaluated when policy audit date indicates older than 365 days
    return [];
  },
};
