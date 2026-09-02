import type { ConsentPhase } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  isEssential,
  isMarketing,
  NO_EVIDENCE,
  vendorName,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * US COMPLIANCE & GPC RULES — PDM-R031 … PDM-R033 (PLAN-V2 Part III).
 *
 * Enforces US State Law (CCPA / CPRA / Cal. Civ. Code § 1798.135) and Global
 * Privacy Control (Sec-GPC: 1) technical requirements.
 *
 * Pure evaluation over recorded evidence only.
 */

/** PDM-R031 — Ad/Marketing tracker active despite Global Privacy Control (GPC) signal. */
export const R031: Rule = {
  id: "PDM-R031",
  category: "US_CCPA",
  precedence: 90,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "GLOBAL_PRIVACY_CONTROL";
    if (!executed(context, phase)) return [];

    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        if (isEssential(vendor)) return false;
        return isMarketing(vendor);
      })
      .map((d) => {
        const name = vendorName(context, d);
        const vendor = context.vendorsById.get(d.vendorId as string);
        const isCritical = d.corroborated || vendor?.category === "ADVERTISING" || vendor?.category === "MARKETING";
        return {
          ruleId: "PDM-R031",
          category: "US_CCPA",
          severity: (isCritical ? "CRITICAL" : "HIGH") as Severity,
          fingerprint: fingerprint(["PDM-R031", d.vendorId, phase]),
          title: `${name} active despite Global Privacy Control (GPC) opt-out signal`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale: d.corroborated
            ? `Observed marketing tracker firing when browser transmitted 'Sec-GPC: 1' opt-out header. Matched on ${d.evidenceSummary.signals.join(" and ")}.`
            : `Observed marketing tracker firing when browser transmitted 'Sec-GPC: 1' opt-out header. Matched on ${d.matchedVia} only.`,
          recommendedAction:
            "Configure CMP and tag manager triggers to automatically suppress marketing tags when navigator.globalPrivacyControl is true or Sec-GPC header is enabled.",
        } satisfies Finding;
      });
  },
};

/** PDM-R032 — Missing 'Do Not Sell or Share My Personal Information' Link under CCPA. */
export const R032: Rule = {
  id: "PDM-R032",
  category: "US_CCPA",
  precedence: 50,
  evaluate(context: RuleContext): Finding[] {
    // Only fires if GPC or US journey indicated missing DNS link or no CCPA footer link was detected
    const gpcPhase = executed(context, "GLOBAL_PRIVACY_CONTROL");
    const hasMarketingPreConsent = context.detections.some(
      (d) => isMarketing(context.vendorsById.get(d.vendorId ?? "")) && (d.consentPhase === "NO_CONSENT" || d.consentPhase === "GLOBAL_PRIVACY_CONTROL"),
    );

    // If site has third-party ad tracking but no opt-out link recorded in scan facts or GPC phase failed
    if (gpcPhase && hasMarketingPreConsent && context.scan?.cmpId === null) {
      return [
        {
          ruleId: "PDM-R032",
          category: "US_CCPA",
          severity: "HIGH",
          fingerprint: fingerprint(["PDM-R032", context.scan?.url ?? "us-site"]),
          title: "Missing 'Do Not Sell or Share My Personal Information' link",
          subject: "CCPA Opt-Out Control",
          consentPhase: "NO_CONSENT",
          evidenceRefs: NO_EVIDENCE,
          rationale:
            "Third-party advertising trackers were detected on a page with no detected CCPA opt-out mechanism or 'Do Not Sell/Share' link.",
          recommendedAction:
            "Add a prominent 'Do Not Sell or Share My Personal Information' or 'Your Privacy Choices' link in the site footer as required by CCPA § 1798.135.",
        },
      ];
    }

    return [];
  },
};

/** PDM-R033 — Broken CCPA Opt-Out Preference Center. */
export const R033: Rule = {
  id: "PDM-R033",
  category: "US_CCPA",
  precedence: 85,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "GLOBAL_PRIVACY_CONTROL";
    if (!executed(context, phase)) return [];

    // Fired when ad network tags continue transmitting after preference center opt-out
    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        return vendor?.category === "ADVERTISING";
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R033",
          category: "US_CCPA",
          severity: "CRITICAL",
          fingerprint: fingerprint(["PDM-R033", d.vendorId, phase]),
          title: `${name} continues transmitting ad data after CCPA opt-out`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale: `Third-party ad network received tracking payloads after opt-out signal was transmitted.`,
          recommendedAction:
            "Verify that CCPA preference center signals update downstream ad tags and trigger complete tag suppression.",
        } satisfies Finding;
      });
  },
};
