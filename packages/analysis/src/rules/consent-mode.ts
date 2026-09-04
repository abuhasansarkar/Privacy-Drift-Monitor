import type { Finding, Rule, Severity } from "./types";
import { executed, fingerprint } from "./types";

/**
 * GOOGLE CONSENT MODE V2 RULES — PDM-R051 & PDM-R052, Phase 13.
 *
 * Inspects Google Consent Mode v2 signals (ad_storage, analytics_storage,
 * ad_user_data, ad_personalization) to ensure tags default to denied before
 * consent, and update properly upon Reject All.
 */

/** PDM-R051 — Google Consent Mode default set to granted before consent. */
export const R051: Rule = {
  id: "PDM-R051",
  category: "TAG_MANAGER",
  precedence: 98,
  evaluate(context): Finding[] {
    if (!executed(context, "NO_CONSENT")) return [];
    const cm = context.consentMode;
    if (!cm || !cm.isConsentModeDetected) return [];

    const isPreConsentGranted =
      cm.preConsentAdStorage === "granted" || cm.preConsentAnalytics === "granted";

    if (!isPreConsentGranted) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "CRITICAL" as Severity,
        fingerprint: fingerprint([this.id, "google-consent-mode", "NO_CONSENT"]),
        title: "Google Consent Mode default state set to granted before consent",
        subject: "Google Consent Mode",
        consentPhase: "NO_CONSENT",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          "Google tags were instructed to treat advertising or analytics storage as granted before the visitor made a consent choice.",
        recommendedAction:
          "Configure the Google Consent Mode default command to set ad_storage and analytics_storage to 'denied' prior to user consent.",
      },
    ];
  },
};

/** PDM-R052 — Google Consent Mode not updated to denied on Reject All. */
export const R052: Rule = {
  id: "PDM-R052",
  category: "CONSENT_FAILURE",
  precedence: 88,
  evaluate(context): Finding[] {
    if (!executed(context, "REJECT_ALL")) return [];
    const cm = context.consentMode;
    if (!cm || !cm.isConsentModeDetected) return [];

    const isRejectIncomplete =
      cm.issuesDetected.includes("PDM-R052") ||
      cm.postRejectAdStorage === "granted" ||
      cm.postRejectAnalytics === "granted" ||
      cm.postRejectUserData === "granted" ||
      cm.postRejectPersonalize === "granted" ||
      cm.postRejectAdStorage === null;

    if (!isRejectIncomplete) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "HIGH" as Severity,
        fingerprint: fingerprint([this.id, "google-consent-mode", "REJECT_ALL"]),
        title: "Google Consent Mode not updated to denied on Reject All",
        subject: "Google Consent Mode",
        consentPhase: "REJECT_ALL",
        evidenceRefs: {
          requestUrls: [],
          cookieNames: [],
          storageKeys: [],
        },
        rationale:
          "The visitor selected Reject All, but Google Consent Mode was not updated with 'denied' across all storage and personalization parameters.",
        recommendedAction:
          "Ensure the consent management platform dispatches a consent update call with ad_storage, analytics_storage, ad_user_data, and ad_personalization set to 'denied' when Reject All is selected.",
      },
    ];
  },
};

export const CONSENT_MODE_RULES: readonly Rule[] = [R051, R052];
