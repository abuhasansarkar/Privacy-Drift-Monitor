import type { ConsentPhase } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  isEssential,
  vendorName,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * JURISDICTION-SPECIFIC EU & UK RULES — PDM-R026 … PDM-R030 (PLAN-V2 Part III).
 *
 * Specific technical benchmarks for:
 * - Germany (TDDDG § 25 / DSK)
 * - France (CNIL 13-Month Rule)
 * - Italy (Garante Cookie Guidelines 2021)
 * - UK (ICO / PECR GTM Consent Mode defaults)
 * - EDPB (Cookie Wall prohibition)
 */

/** PDM-R026 — Unconsented Analytics under Germany TDDDG §25. */
export const R026: Rule = {
  id: "PDM-R026",
  category: "EU_GERMANY",
  precedence: 88,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "NO_CONSENT";
    if (!executed(context, phase)) return [];

    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        if (isEssential(vendor)) return false;
        return vendor?.category === "ANALYTICS" || vendor?.category === "FUNCTIONAL";
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R026",
          category: "EU_GERMANY",
          severity: "HIGH" as Severity,
          fingerprint: fingerprint(["PDM-R026", d.vendorId, phase]),
          title: `${name} analytics active pre-consent under Germany TDDDG §25`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "Under German TDDDG § 25 and DSK guidelines, all non-essential analytics cookies and telemetry require prior opt-in consent.",
          recommendedAction:
            "Block analytics tracking tags until the visitor gives explicit affirmative consent.",
        } satisfies Finding;
      });
  },
};

/** PDM-R027 — Cookie Retention Exceeds CNIL 13-Month Rule. */
export const R027: Rule = {
  id: "PDM-R027",
  category: "EU_FRANCE",
  precedence: 65,
  evaluate(context: RuleContext): Finding[] {
    const MAX_CNIL_DAYS = 395; // 13 months

    return context.cookies
      .filter((c) => !c.isSession && c.durationDays !== null && c.durationDays > MAX_CNIL_DAYS)
      .map((c) => {
        return {
          ruleId: "PDM-R027",
          category: "EU_FRANCE",
          severity: "MEDIUM" as Severity,
          fingerprint: fingerprint(["PDM-R027", c.name, c.consentPhase]),
          title: `Cookie '${c.name}' lifespan (${c.durationDays} days) exceeds French CNIL 13-month limit`,
          subject: `CNIL Cookie: ${c.name}`,
          consentPhase: c.consentPhase,
          evidenceRefs: {
            requestUrls: [],
            cookieNames: [c.name],
            storageKeys: [],
          },
          rationale: `French CNIL guidelines mandate a maximum lifespan of 13 months (395 days) for non-essential cookies.`,
          recommendedAction:
            "Adjust cookie expiration parameters (Max-Age/Expires) in your CMP and script configurations to not exceed 395 days.",
        } satisfies Finding;
      });
  },
};

/** PDM-R028 — Banner Close ('X') Does Not Block Tracking (Italy Garante). */
export const R028: Rule = {
  id: "PDM-R028",
  category: "EU_ITALY",
  precedence: 94,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "REJECT_ALL";
    if (!executed(context, phase)) return [];

    // If close action was used and trackers still fire
    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        return !isEssential(vendor);
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R028",
          category: "EU_ITALY",
          severity: "CRITICAL" as Severity,
          fingerprint: fingerprint(["PDM-R028", d.vendorId, phase]),
          title: `Closing banner ('X') allows ${name} to continue tracking`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "Italy Garante Cookie Guidelines mandate that closing a banner without accepting must maintain default blocking of all non-essential trackers.",
          recommendedAction:
            "Configure the banner close button ('X') to trigger full tracker rejection and maintain blocked state.",
        } satisfies Finding;
      });
  },
};

/** PDM-R030 — Unconsented Marketing Tag via GTM Consent Mode Default (UK ICO). */
export const R030: Rule = {
  id: "PDM-R030",
  category: "UK_PECR",
  precedence: 91,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "NO_CONSENT";
    if (!executed(context, phase)) return [];

    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        return vendor?.category === "MARKETING" || vendor?.category === "ADVERTISING";
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R030",
          category: "UK_PECR",
          severity: "CRITICAL" as Severity,
          fingerprint: fingerprint(["PDM-R030", d.vendorId, phase]),
          title: `GTM Consent Mode default allows ${name} before user selection`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "UK ICO guidance requires 'ad_storage' and marketing triggers to default to 'denied' prior to explicit positive consent.",
          recommendedAction:
            "Set gtag('consent', 'default', { 'ad_storage': 'denied', 'analytics_storage': 'denied' }) before loading GTM container.",
        } satisfies Finding;
      });
  },
};
