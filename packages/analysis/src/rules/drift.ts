import type { ConsentPhase } from "@pdm/scanner/types";
import {
  fingerprint,
  NO_EVIDENCE,
  type Finding,
  type Rule,
  type Severity,
} from "./types";

/**
 * DRIFT RULES — PDM-R013 … PDM-R019, PLAN.md §4.11.
 *
 * ⚠️ THESE RUN IN A SECOND PASS, after the drift engine has computed its
 * events. They do not diff anything themselves: the drift feed and the findings
 * list must describe the same change, and two independent diffs would
 * eventually disagree about what happened.
 *
 * ⚠️ A CHANGE IS NOT AUTOMATICALLY A PROBLEM. §4.11 gives R016 Low severity
 * unless it happened pre-consent, and R019 Medium — a site legitimately adds a
 * tag or swaps consent platform. The finding says what changed; the severity
 * says how much it matters; neither says the agency did something wrong.
 */

function driftRule(options: {
  id: string;
  changeType: string;
  category: Finding["category"];
  precedence: number;
  severity: (event: { preConsent: boolean; severity: Severity }) => Severity;
  title: (subject: string) => string;
  action: string;
}): Rule {
  return {
    id: options.id,
    category: options.category,
    precedence: options.precedence,
    evaluate(context) {
      // No drift pass has run — correct output is nothing, not a guess.
      if (!context.drift) return [];

      return context.drift
        .filter((event) => event.changeType === options.changeType)
        .map((event) => ({
          ruleId: options.id,
          category: options.category,
          severity: options.severity(event),
          /*
           * ⚠️ THE SUBJECT IS IN THE FINGERPRINT, THE SCAN IS NOT. Otherwise
           * "a new tracker appeared" becomes a fresh issue on every subsequent
           * scan that still sees it, and the agency gets the same alert nightly.
           */
          fingerprint: fingerprint([options.id, event.subject]),
          title: options.title(event.subject),
          subject: event.subject,
          consentPhase: (event.preConsent ? "NO_CONSENT" : "ACCEPT_ALL") as ConsentPhase,
          evidenceRefs: NO_EVIDENCE,
          rationale: event.summary,
          recommendedAction: options.action,
        }));
    },
  };
}

/** PDM-R013 — a tracking service we recognise appeared since the last scan. */
export const R013: Rule = driftRule({
  id: "PDM-R013",
  changeType: "TRACKER_ADDED",
  category: "NEW_TRACKER",
  precedence: 85,
  // §4.11: "High (Critical if pre-consent marketing)". Pre-consent is the
  // difference between "you added a tag" and "you added an ungated tag".
  severity: (event) => (event.preConsent ? "CRITICAL" : "HIGH"),
  title: (subject) => `New tracking service detected — ${subject}`,
  action: "Confirm this was intended, and that it is gated behind consent.",
});

/** PDM-R014 — a third party we do not recognise appeared since the last scan. */
export const R014: Rule = driftRule({
  id: "PDM-R014",
  changeType: "UNKNOWN_VENDOR_ADDED",
  category: "UNKNOWN_VENDOR",
  precedence: 82,
  severity: () => "HIGH",
  title: (subject) => `Unrecognised third-party service detected — ${subject}`,
  action:
    "Identify the service. Tell us what it is and we'll add it to our catalogue.",
});

/** PDM-R015 — a new non-essential cookie since the last scan. */
export const R015: Rule = driftRule({
  id: "PDM-R015",
  changeType: "COOKIE_ADDED",
  category: "DRIFT",
  precedence: 60,
  severity: () => "MEDIUM",
  title: (subject) => `New cookie detected — ${subject}`,
  action: "Confirm this was intended and update your cookie declaration.",
});

/** PDM-R016 — the site started contacting a domain it did not before. */
export const R016: Rule = driftRule({
  id: "PDM-R016",
  changeType: "THIRD_PARTY_DOMAIN_ADDED",
  category: "DRIFT",
  precedence: 55,
  // §4.11: "Low (Medium if pre-consent)".
  severity: (event) => (event.preConsent ? "MEDIUM" : "LOW"),
  title: (subject) => `New third-party domain contacted — ${subject}`,
  action: "Identify what on the page is making this request.",
});

/**
 * PDM-R017 — consent regression. The highest-value finding in the product.
 *
 * ⚠️ §4.11 REQUIRES BOTH SCANS TO BE COMPLETED, and the drift engine already
 * guarantees it: `pickBaseline` only ever returns a COMPLETED scan, because
 * diffing against a PARTIAL one reports everything the incomplete scan missed
 * as a change (§4.10). This rule inherits that guarantee rather than
 * re-checking it, which is why the guarantee has to stay where it is.
 */
export const R017: Rule = driftRule({
  id: "PDM-R017",
  changeType: "CONSENT_REGRESSION",
  category: "CONSENT_FAILURE",
  precedence: 140,
  severity: () => "CRITICAL",
  title: (subject) => `Reject All no longer blocks ${subject}`,
  action:
    "Something changed in the consent platform or tag configuration since the last scan. Compare the two scans.",
});

/** PDM-R018 — the consent banner we used to see has stopped appearing. */
export const R018: Rule = driftRule({
  id: "PDM-R018",
  changeType: "CMP_REMOVED",
  category: "CONSENT_MISSING",
  precedence: 135,
  severity: () => "CRITICAL",
  title: () => "The consent banner we previously detected is no longer appearing",
  action:
    "Check whether the consent platform's plugin or script was removed, or is failing to load.",
});

/** PDM-R019 — the site swapped consent platform. */
export const R019: Rule = driftRule({
  id: "PDM-R019",
  changeType: "CMP_CHANGED",
  category: "DRIFT",
  precedence: 65,
  severity: () => "MEDIUM",
  title: (subject) => `Consent platform appears to have changed — ${subject}`,
  action: "Verify the new platform is configured correctly, then re-scan.",
});

export const DRIFT_RULES: readonly Rule[] = [R013, R014, R015, R016, R017, R018, R019];
