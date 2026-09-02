import type { ConsentPhase } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  vendorName,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * CIPA WIRETAP & SESSION REPLAY RULES — PDM-R036 … PDM-R037 (PLAN-V2 Part V).
 *
 * Evaluates session recording and live chat interception risks under
 * California Invasion of Privacy Act (CIPA § 631) and state wiretap laws.
 */

const REPLAY_VENDORS = new Set([
  "hotjar",
  "fullstory",
  "microsoft-clarity",
  "clarity",
  "logrocket",
  "smartlook",
  "lucky-orange",
  "datadog-rum",
]);

const CHAT_VENDORS = new Set([
  "intercom",
  "drift",
  "zendesk-chat",
  "crisp",
  "tidio",
  "livechat",
  "hubspot-chat",
]);

/** PDM-R036 — Session Replay Unmasked Input Recording. */
export const R036: Rule = {
  id: "PDM-R036",
  category: "CIPA_WIRETAP",
  precedence: 92,
  evaluate(context: RuleContext): Finding[] {
    const executedPhases = context.phases.filter((p) => p.status === "EXECUTED").map((p) => p.phase);
    if (executedPhases.length === 0) return [];

    return context.detections
      .filter((d) => d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        const slug = vendor?.slug?.toLowerCase() ?? "";
        return REPLAY_VENDORS.has(slug) || slug.includes("replay") || slug.includes("clarity") || slug.includes("hotjar") || slug.includes("fullstory");
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R036",
          category: "CIPA_WIRETAP",
          severity: "CRITICAL" as Severity,
          fingerprint: fingerprint(["PDM-R036", d.vendorId, d.consentPhase]),
          title: `${name} active on form pages without verified input masking`,
          subject: name,
          consentPhase: d.consentPhase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "Observed active session replay script recording user interactions on a form page without verified DOM input masking attributes.",
          recommendedAction:
            "Enable element masking in the session replay console and add 'data-hj-suppress', 'fs-mask', or 'clarity-mask' attributes to all form inputs.",
        } satisfies Finding;
      });
  },
};

/** PDM-R037 — Chat Widget Pre-Consent Interception. */
export const R037: Rule = {
  id: "PDM-R037",
  category: "CIPA_WIRETAP",
  precedence: 60,
  evaluate(context: RuleContext): Finding[] {
    const phase: ConsentPhase = "NO_CONSENT";
    if (!executed(context, phase)) return [];

    return context.detections
      .filter((d) => d.consentPhase === phase && d.vendorId !== null)
      .filter((d) => {
        const vendor = context.vendorsById.get(d.vendorId as string);
        const slug = vendor?.slug?.toLowerCase() ?? "";
        return CHAT_VENDORS.has(slug) || slug.includes("chat") || slug.includes("intercom");
      })
      .map((d) => {
        const name = vendorName(context, d);
        return {
          ruleId: "PDM-R037",
          category: "CIPA_WIRETAP",
          severity: "MEDIUM" as Severity,
          fingerprint: fingerprint(["PDM-R037", d.vendorId, phase]),
          title: `${name} chat widget initialized pre-consent`,
          subject: name,
          consentPhase: phase,
          evidenceRefs: {
            requestUrls: d.evidenceSummary.hosts,
            cookieNames: d.evidenceSummary.cookies,
            storageKeys: d.evidenceSummary.storageKeys,
          },
          rationale:
            "Third-party chat widget initialized and established network connections before user consent was granted.",
          recommendedAction:
            "Delay chat widget script initialization until user grants consent or explicitly opens the chat widget.",
        } satisfies Finding;
      });
  },
};
