import type { ConsentPhase, RecordedCookie } from "@pdm/scanner/types";
import {
  executed,
  fingerprint,
  isEssential,
  isMarketing,
  NO_EVIDENCE,
  phaseOf,
  vendorName,
  type Finding,
  type Rule,
  type RuleContext,
  type Severity,
} from "./types";

/**
 * CONSENT RULES — PDM-R001 … PDM-R012, PLAN.md §4.11.
 *
 * The product's core claim lives here: not "we found a banner", but "we can
 * tell whether the banner did anything". Every rule below is one row of the
 * §4.11 inventory, with its severity, its user message and its recommended
 * action taken from that table rather than invented.
 *
 * ⚠️ R010 AND R012 ARE WORDED AS OUR LIMITATION, NOT THE SITE'S. §4.11 marks
 * both high-false-positive on purpose: they fire when OUR SCANNER struggled.
 * Their copy leads with "We could not…", never "This site does not…".
 */

/** Shared shape for the four tracker rules, which differ only in phase and category. */
function trackerRule(options: {
  id: string;
  phase: ConsentPhase;
  marketing: boolean;
  precedence: number;
  title: (name: string) => string;
  message: string;
  action: string;
}): Rule {
  return {
    id: options.id,
    category: options.phase === "NO_CONSENT" ? "PRE_CONSENT_TRACKING" : "CONSENT_FAILURE",
    precedence: options.precedence,
    evaluate(context) {
      /*
       * ⚠️ THE LOAD-BEARING GUARD. Without it, an UNDETERMINED phase yields
       * zero detections and this rule reports nothing — which downstream reads
       * as "rejection is respected". It is not: we never rejected.
       */
      if (!executed(context, options.phase)) return [];

      return context.detections
        .filter(
          (detection) =>
            detection.consentPhase === options.phase && detection.vendorId !== null,
        )
        .filter((detection) => {
          const vendor = context.vendorsById.get(detection.vendorId as string);
          // A CMP or bot-challenge script loading pre-consent is expected —
          // that is how the banner gets on the page at all.
          if (isEssential(vendor)) return false;
          return isMarketing(vendor) === options.marketing;
        })
        .map((detection) => {
          const name = vendorName(context, detection);
          return {
            ruleId: options.id,
            category: this.category,
            /*
             * ⚠️ CRITICAL REQUIRES CORROBORATION (§4.8). A single-signal match
             * is one step down, because a wrong Critical is the failure mode
             * that costs an agency's trust in everything else we report.
             */
            severity: (options.marketing
              ? detection.corroborated
                ? "CRITICAL"
                : "HIGH"
              : detection.corroborated
                ? "HIGH"
                : "MEDIUM") as Severity,
            fingerprint: fingerprint([options.id, detection.vendorId, options.phase]),
            title: options.title(name),
            subject: name,
            consentPhase: options.phase,
            evidenceRefs: {
              requestUrls: detection.evidenceSummary.hosts,
              cookieNames: detection.evidenceSummary.cookies,
              storageKeys: detection.evidenceSummary.storageKeys,
            },
            rationale: detection.corroborated
              ? `${options.message} Matched on ${detection.evidenceSummary.signals.join(" and ")} — two independent signals.`
              : `${options.message} Matched on ${detection.matchedVia} only. Review recommended before acting.`,
            recommendedAction: options.action,
          } satisfies Finding;
        });
    },
  };
}

/** PDM-R001 — marketing tracker before consent. The product's headline finding. */
export const R001: Rule = trackerRule({
  id: "PDM-R001",
  phase: "NO_CONSENT",
  marketing: true,
  precedence: 100,
  title: (name) => `Marketing tracker detected before consent — ${name}`,
  message: "A marketing tracker was detected before consent was given.",
  action:
    "Move the tag behind consent in your consent platform or tag manager, then re-scan to verify.",
});

/** PDM-R002 — analytics tracker before consent. */
export const R002: Rule = trackerRule({
  id: "PDM-R002",
  phase: "NO_CONSENT",
  marketing: false,
  precedence: 95,
  title: (name) => `Analytics tracker detected before consent — ${name}`,
  message: "An analytics tracker was detected before consent was given.",
  action: "Gate analytics on consent, or configure your platform's consent mode.",
});

/** PDM-R003 — an unrecognised third party contacted before consent. */
export const R003: Rule = {
  id: "PDM-R003",
  category: "UNKNOWN_VENDOR",
  precedence: 70,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    return context.detections
      .filter(
        (detection) =>
          detection.consentPhase === "NO_CONSENT" &&
          detection.vendorId === null &&
          detection.unknownDomain !== null,
      )
      .map((detection) => {
        const domain = detection.unknownDomain as string;
        return {
          ruleId: this.id,
          category: this.category,
          severity: "MEDIUM" as Severity,
          fingerprint: fingerprint([this.id, domain, "NO_CONSENT"]),
          title: `Third-party service contacted before consent — ${domain}`,
          subject: domain,
          consentPhase: "NO_CONSENT" as ConsentPhase,
          evidenceRefs: {
            requestUrls: detection.evidenceSummary.hosts,
            cookieNames: detection.evidenceSummary.cookies,
            storageKeys: detection.evidenceSummary.storageKeys,
          },
          // ⚠️ Deliberately not called a tracker. We do not know what it is —
          // that is the whole finding, and overstating it would be inventing.
          rationale:
            "A third-party service we do not recognise was contacted before consent was given.",
          recommendedAction:
            "Identify the service and determine whether it needs consent. Tell us and we'll add it to our catalogue.",
        } satisfies Finding;
      });
  },
};

/** PDM-R004 — marketing tracker still firing after Reject All. */
export const R004: Rule = trackerRule({
  id: "PDM-R004",
  phase: "REJECT_ALL",
  marketing: true,
  precedence: 120,
  title: (name) => `Marketing tracker continued after Reject All — ${name}`,
  message: "A marketing tracker continued to load after Reject All was selected.",
  action:
    "Your consent signal is not reaching this tag. Check the wiring between your consent platform and your tag manager.",
});

/** PDM-R005 — analytics tracker still firing after Reject All. */
export const R005: Rule = trackerRule({
  id: "PDM-R005",
  phase: "REJECT_ALL",
  marketing: false,
  precedence: 115,
  title: (name) => `Analytics tracker continued after Reject All — ${name}`,
  message: "An analytics tracker continued to load after Reject All was selected.",
  action:
    "Your consent signal is not reaching this tag. Check the wiring between your consent platform and your tag manager.",
});

/**
 * Groups cookies by name.
 *
 * The same cookie seen at three snapshot points is one finding, not three.
 */
function byName(cookies: readonly RecordedCookie[]): RecordedCookie[] {
  const map = new Map<string, RecordedCookie>();
  for (const cookie of cookies) map.set(cookie.name, cookie);
  return [...map.values()];
}

/**
 * Cookies a consent decision should have prevented or removed.
 *
 * ⚠️ THE `NECESSARY` EXCLUSION IS NOT OPTIONAL. A session cookie surviving
 * rejection is correct behaviour, and reporting it is how a findings list
 * becomes noise.
 */
function nonNecessaryCookies(
  context: RuleContext,
  phase: ConsentPhase,
): RecordedCookie[] {
  return byName(
    context.cookies.filter(
      (cookie) =>
        cookie.consentPhase === phase &&
        // A first-party cookie with no third-party signal is far more likely to
        // be functional. Third-party ones are the ones worth reporting.
        (cookie.isThirdParty || cookie.durationDays !== null),
    ),
  );
}

function cookieRule(options: {
  id: string;
  phase: ConsentPhase;
  severity: Severity;
  precedence: number;
  title: (name: string) => string;
  message: string;
  action: string;
}): Rule {
  return {
    id: options.id,
    category: "COOKIE_BEHAVIOR",
    precedence: options.precedence,
    evaluate(context) {
      if (!executed(context, options.phase)) return [];

      return nonNecessaryCookies(context, options.phase).map((cookie) => ({
        ruleId: options.id,
        category: this.category,
        severity: options.severity,
        fingerprint: fingerprint([options.id, cookie.domain, cookie.name, options.phase]),
        title: options.title(cookie.name),
        subject: cookie.name,
        consentPhase: options.phase,
        evidenceRefs: { requestUrls: [], cookieNames: [cookie.name], storageKeys: [] },
        rationale: `${options.message} Set on ${cookie.domain}${
          cookie.isSession
            ? " for the session"
            : cookie.durationDays !== null
              ? ` for ${cookie.durationDays} days`
              : ""
        }.`,
        recommendedAction: options.action,
      }));
    },
  };
}

/** PDM-R006 — a non-essential cookie survived Reject All. */
export const R006: Rule = cookieRule({
  id: "PDM-R006",
  phase: "REJECT_ALL",
  severity: "HIGH",
  precedence: 90,
  title: (name) => `Cookie remained after Reject All — ${name}`,
  message: "A non-essential cookie remained after Reject All was selected.",
  action: "Ensure your consent platform clears non-essential cookies on rejection.",
});

/** PDM-R007 — tracking continued after consent was withdrawn. */
export const R007: Rule = trackerRule({
  id: "PDM-R007",
  phase: "WITHDRAW",
  marketing: true,
  precedence: 118,
  title: (name) => `Tracking continued after withdrawal — ${name}`,
  message: "Tracking continued after consent was withdrawn.",
  action:
    "Verify that your consent platform's withdrawal handler actually removes the tags, not just the banner state.",
});

/** PDM-R008 — a non-essential cookie survived withdrawal. */
export const R008: Rule = cookieRule({
  id: "PDM-R008",
  phase: "WITHDRAW",
  severity: "HIGH",
  precedence: 88,
  title: (name) => `Cookie remained after withdrawal — ${name}`,
  message: "A non-essential cookie remained after consent was withdrawn.",
  action: "Ensure cookies are deleted when a visitor withdraws consent.",
});

/**
 * PDM-R009 — no consent mechanism at all, yet trackers fire.
 *
 * ⚠️ THE TRACKER CONDITION IS PART OF THE RULE. A site with no banner and no
 * third-party tracking has nothing to consent to; reporting it would be the
 * legal-conclusion posture §1.11 forbids.
 */
export const R009: Rule = {
  id: "PDM-R009",
  category: "CONSENT_MISSING",
  precedence: 130,
  evaluate(context) {
    if (!executed(context, "NO_CONSENT")) return [];

    const noConsentPhase = phaseOf(context, "NO_CONSENT");
    const bannerFound = noConsentPhase?.errorCode !== "CONSENT_NO_BANNER_FOUND";
    if (bannerFound && context.scan?.cmpId) return [];

    const trackers = context.detections.filter((detection) => {
      if (detection.consentPhase !== "NO_CONSENT") return false;
      const vendor = detection.vendorId
        ? context.vendorsById.get(detection.vendorId)
        : undefined;
      return !isEssential(vendor);
    });
    if (trackers.length === 0) return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "CRITICAL" as Severity,
        fingerprint: fingerprint([this.id]),
        title: "No consent mechanism detected, and tracking services were observed",
        subject: "consent",
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: {
          requestUrls: trackers.flatMap((d) => d.evidenceSummary.hosts).slice(0, 20),
          cookieNames: [],
          storageKeys: [],
        },
        rationale: `No consent banner was found on this page, and ${trackers.length} tracking service${
          trackers.length === 1 ? " was" : "s were"
        } observed loading.`,
        recommendedAction:
          "Install and configure a consent management platform, then re-scan to verify.",
      },
    ];
  },
};

/**
 * PDM-R010 — a consent platform was detected, but its banner never appeared.
 *
 * ⚠️ HIGH FALSE-POSITIVE BY DESIGN (§4.11). Geo-targeting is the usual cause:
 * we scan from the EU, and a banner configured for one region legitimately does
 * not render for us. The copy says what WE could not do.
 */
export const R010: Rule = {
  id: "PDM-R010",
  category: "SCAN_HEALTH",
  precedence: 40,
  evaluate(context) {
    if (!context.scan?.cmpId) return [];

    const phase = phaseOf(context, "NO_CONSENT");
    if (phase?.errorCode !== "CONSENT_BANNER_TIMEOUT") return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint([this.id, context.scan.cmpId]),
        title: "We found a consent tool but its banner did not appear",
        subject: context.scan.cmpName ?? context.scan.cmpId,
        consentPhase: "NO_CONSENT" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale: `We detected ${
          context.scan.cmpName ?? context.scan.cmpId
        } on the page, but no banner appeared within the time we waited. Consent choices could not be tested on this scan.`,
        recommendedAction:
          "Check the platform's script loading and its geo-targeting rules. Our scanner runs from the EU.",
      },
    ];
  },
};

/** PDM-R011 — rejecting required opening a preferences panel. */
export const R011: Rule = {
  id: "PDM-R011",
  category: "CONSENT_FAILURE",
  precedence: 50,
  evaluate(context) {
    const phase = phaseOf(context, "REJECT_ALL");
    if (phase?.status !== "EXECUTED") return [];
    // The generic adapter reports which strategy reached the control.
    if (phase.actionMethod !== "preferences_fallback") return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint([this.id]),
        title: "No direct reject control was found at the top level",
        subject: "consent",
        consentPhase: "REJECT_ALL" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale:
          "Rejecting required opening a preferences panel; no direct reject control was available alongside Accept.",
        recommendedAction:
          "Consider offering a reject control as prominent as the accept control.",
      },
    ];
  },
};

/**
 * PDM-R012 — we could not find any way to reject.
 *
 * ⚠️ ALSO HIGH FALSE-POSITIVE (§4.11), and worded as our limitation. A bespoke
 * banner we cannot drive is our gap, not proof the site offers no rejection.
 */
export const R012: Rule = {
  id: "PDM-R012",
  category: "SCAN_HEALTH",
  precedence: 45,
  evaluate(context) {
    const phase = phaseOf(context, "REJECT_ALL");
    if (phase?.errorCode !== "CONSENT_BUTTON_NOT_FOUND") return [];

    return [
      {
        ruleId: this.id,
        category: this.category,
        severity: "MEDIUM" as Severity,
        fingerprint: fingerprint([this.id]),
        title: "We could not find a way to reject non-essential cookies",
        subject: "consent",
        consentPhase: "REJECT_ALL" as ConsentPhase,
        evidenceRefs: NO_EVIDENCE,
        rationale:
          "Our scanner could not locate a reject control on this banner. This may mean the control is not there, or that we could not recognise it.",
        recommendedAction:
          "Review the banner's controls. If a reject control exists and we missed it, add a selector override for this website.",
      },
    ];
  },
};

export const CONSENT_RULES: readonly Rule[] = [
  R001,
  R002,
  R003,
  R004,
  R005,
  R006,
  R007,
  R008,
  R009,
  R010,
  R011,
  R012,
];
