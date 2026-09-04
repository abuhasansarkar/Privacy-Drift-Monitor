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

/**
 * PDM-R034 — Policy-to-Code Vendor Mismatch (Ghost Tracker).
 *
 * ⚠️ IT NEEDS A POLICY, AND IT WILL NOT PRETEND OTHERWISE. This rule previously
 * raised a HIGH-severity finding reading "<vendor> active on site but omitted
 * from privacy policy" by filtering detections down to advertising vendors,
 * taking the first one, and asserting the omission. No privacy policy was ever
 * fetched, parsed or compared; `RuleContext` did not even carry a field for
 * one. Every finding it produced was an invented fact, sent to an agency, and
 * from there to that agency's client.
 *
 * That is the exact failure P1 and P6 exist to prevent — an interpretation
 * layer manufacturing an observation the scanner never made. A rule may only
 * describe what was recorded.
 *
 * So it now reads `context.policy.undisclosedVendors`, which is produced by
 * policy extraction (Module 23). Until that ships, `context.policy` is
 * undefined and this rule emits NOTHING — which is the correct output for a
 * comparison whose second input does not exist. The rule id is kept so no
 * historical `Issue` row is orphaned (§4.11).
 */
export const R034: Rule = {
  id: "PDM-R034",
  category: "FTC_COMPLIANCE",
  precedence: 87,
  evaluate(context: RuleContext): Finding[] {
    const policy = context.policy;
    if (!policy || policy.undisclosedVendors.length === 0) return [];

    const undisclosed = new Set(
      policy.undisclosedVendors.map((slug) => slug.toLowerCase()),
    );

    /*
     * Only vendors we ACTUALLY DETECTED and the policy does not name. The
     * detection is what makes this an observation rather than a policy review;
     * an undisclosed vendor that never fired is not something we saw.
     */
    const seen = new Set<string>();
    return context.detections.flatMap((detection) => {
      if (!detection.vendorId) return [];
      const vendor = context.vendorsById.get(detection.vendorId);
      if (
        !vendor ||
        (!undisclosed.has(vendor.slug.toLowerCase()) &&
          !undisclosed.has(vendor.name.toLowerCase()))
      ) {
        return [];
      }
      if (seen.has(vendor.slug)) return [];
      seen.add(vendor.slug);

      const name = vendorName(context, detection);
      return [
        {
          ruleId: "PDM-R034",
          category: "FTC_COMPLIANCE",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R034", vendor.slug, "policy-diff"]),
          title: `${name} was detected but is not named in the published privacy policy`,
          subject: `${name} (Policy Disclosure)`,
          consentPhase: detection.consentPhase,
          evidenceRefs: {
            requestUrls: detection.evidenceSummary.hosts,
            cookieNames: detection.evidenceSummary.cookies,
            storageKeys: detection.evidenceSummary.storageKeys,
          },
          rationale:
            `${name} was observed loading on the website. The privacy policy at ` +
            `${policy.policyUrl} does not name it among the third parties it discloses.`,
          recommendedAction:
            "Review the published privacy policy against the vendors currently in use, " +
            "and update whichever is out of date.",
        } satisfies Finding,
      ];
    });
  },
};

/**
 * PDM-R035 — Sensitive identifiers in third-party request URLs.
 *
 * ⚠️ IT MATCHES PARAMETER NAMES, NOT THE WHOLE URL. The first version tested
 * the raw URL against `/@/` among others, so ANY third-party URL containing an
 * "@" — a path segment, a scoped npm package on a CDN, a base64 fragment —
 * produced a CRITICAL "Sensitive user data transmitted" finding. A CRITICAL
 * that fires on `cdn.example.com/@scope/pkg.js` is worse than no rule: it
 * teaches the reader to skim past the severity that matters most.
 *
 * ⚠️ AND IT LOOKS AT THE QUERY STRING KNOWING ONE IS RARELY THERE. §10.6 has
 * `sanitizeUrl()` strip query strings before storage, so in practice this fires
 * on the path and on the few recorders that keep a fragment. That is a
 * deliberate trade: under-reporting a leak we cannot see beats inventing one.
 */
export const R035: Rule = {
  id: "PDM-R035",
  category: "FTC_COMPLIANCE",
  precedence: 95,
  evaluate(context: RuleContext): Finding[] {
    /*
     * Anchored to a parameter BOUNDARY (`?`, `&`, `#` or `/`) followed by a
     * key that names a personal identifier, then `=`. A bare "@" is not
     * evidence of anything.
     */
    const SENSITIVE_PARAM =
      /[?&#/](?:e?mail|user(?:name)?|pass(?:word|wd)?|pwd|ssn|dob|birth(?:date|day)|phone|tel|first_?name|last_?name|full_?name|address|postcode|zip)=[^&#\s]+/i;

    /** An email address as a VALUE, not an "@" anywhere in the string. */
    const EMAIL_VALUE = /=[^&#\s]*[A-Z0-9._%+-]+%40[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const EMAIL_VALUE_PLAIN = /=[^&#\s]*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

    const sensitivePatterns = [SENSITIVE_PARAM, EMAIL_VALUE, EMAIL_VALUE_PLAIN];

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

/**
 * PDM-R049 — Stale Privacy Policy Date (> 12 Months).
 *
 * ⚠️ THIS WAS A REGISTERED NO-OP. It returned `[]` unconditionally, under a
 * comment describing behaviour it did not have ("Evaluated when policy audit
 * date indicates older than 365 days"), while being counted among the product's
 * rules. A registered rule that cannot fire makes the rule count a claim
 * nobody can check.
 *
 * It now does the comparison it always described. Like PDM-R034 it depends on
 * policy extraction (Module 23), so it emits nothing until `context.policy` is
 * populated — the difference is that the reason is now the absence of an input,
 * stated in one line, rather than an empty function body.
 */
const STALE_POLICY_DAYS = 365;

export const R049: Rule = {
  id: "PDM-R049",
  category: "POLICY",
  precedence: 40,
  evaluate(context: RuleContext): Finding[] {
    const effectiveDate = context.policy?.effectiveDate;
    if (!context.policy || !effectiveDate) return [];

    const ageDays = Math.floor(
      (Date.now() - effectiveDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (ageDays <= STALE_POLICY_DAYS) return [];

    return [
      {
        ruleId: "PDM-R049",
        category: "POLICY",
        severity: "INFO" as Severity,
        fingerprint: fingerprint(["PDM-R049", context.policy.policyUrl]),
        title: `Privacy policy states an effective date ${ageDays} days ago`,
        subject: context.policy.policyUrl,
        consentPhase: "NO_CONSENT",
        evidenceRefs: { requestUrls: [], cookieNames: [], storageKeys: [] },
        rationale:
          `The policy at ${context.policy.policyUrl} declares an effective date of ` +
          `${effectiveDate.toISOString().slice(0, 10)}. Tracking setups change more often ` +
          "than that, so the document may no longer describe what the website does.",
        recommendedAction:
          "Review the policy against the vendors currently detected and refresh its effective date.",
      } satisfies Finding,
    ];
  },
};
