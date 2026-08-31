import type { NotificationType, Severity } from "@pdm/schemas";

/**
 * NOTIFICATION COPY — PLAN.md Part I §1.12, Part XI §11.11.
 *
 * ⚠️ BOUND BY THE APPROVED TERMINOLOGY, and checked by
 * `scripts/check-terminology.ts`. This is a technical monitoring product: it
 * reports what was DETECTED and never asserts a legal conclusion. "A tracker
 * was detected before consent" is a fact we recorded; anything stronger is a
 * claim we cannot support from a browser recording.
 *
 * ⚠️ DETERMINISTIC AND RULE-AUTHORED. Nothing here is AI-generated — an alert
 * must read identically every time it fires (P1, P2).
 */

export interface NotificationCopy {
  /** In-app row title and email subject stem. */
  title: string;
  /** One sentence of context under the title. */
  body: string;
}

/**
 * `{site}` is substituted with the website label. Kept as a token rather than
 * concatenated at the call site so a locale file can reorder the sentence.
 */
export const NOTIFICATION_COPY: Record<NotificationType, NotificationCopy> = {
  CRITICAL_ISSUE: {
    title: "Critical potential issue on {site}",
    body: "A finding at critical severity was detected on the latest scan. Review recommended.",
  },
  NEW_TRACKER: {
    title: "New tracker detected on {site}",
    body: "A tracking service we had not seen on this site before was observed in the latest scan.",
  },
  CONSENT_REGRESSION: {
    title: "Consent behaviour changed on {site}",
    body: "Rejecting consent no longer produces the behaviour recorded on the previous scan.",
  },
  PRIVACY_DRIFT: {
    title: "Privacy drift detected on {site}",
    body: "The latest scan differs from the baseline. See what changed.",
  },
  SCAN_FAILED: {
    title: "Scan failed for {site}",
    body: "We could not complete a scan. No findings were produced for this run.",
  },
  SCAN_PARTIAL: {
    title: "Scan partially completed for {site}",
    body: "Some consent journeys could not be tested, so parts of this scan could not be determined.",
  },
  WEBSITE_UNREACHABLE: {
    title: "{site} could not be reached",
    body: "Three consecutive scans failed to load the site. Monitoring continues but produces no findings.",
  },
  REPORT_READY: {
    title: "Your report is ready",
    body: "The report you generated has finished and is available to download.",
  },
  REPORT_FAILED: {
    title: "We couldn't generate this report",
    body: "Nothing was charged against your report allowance. You can try generating it again.",
  },
  MEMBER_JOINED: {
    title: "A new member joined your agency",
    body: "They now have access according to the role you assigned.",
  },
  TRIAL_ENDING: {
    title: "Your trial is ending soon",
    body: "Add a payment method to keep monitoring running without interruption.",
  },
  PAYMENT_FAILED: {
    title: "A payment didn't go through",
    body: "Update your payment method to keep your account active.",
  },
  PLAN_CHANGED: {
    title: "Your plan has changed",
    body: "Your limits have been updated to match the new plan.",
  },
  AI_QUOTA_WARNING: {
    title: "You've used most of this period's AI credits",
    body: "Explanations stay available; findings, drift and reports are unaffected.",
  },
  USAGE_LIMIT_WARNING: {
    title: "You're approaching a plan limit",
    body: "Review your usage before it affects new scans.",
  },
};

/** The severity an alert of this type carries when the event has none of its own. */
export const DEFAULT_SEVERITY: Record<NotificationType, Severity> = {
  CRITICAL_ISSUE: "CRITICAL",
  CONSENT_REGRESSION: "CRITICAL",
  NEW_TRACKER: "MEDIUM",
  PRIVACY_DRIFT: "MEDIUM",
  SCAN_FAILED: "HIGH",
  SCAN_PARTIAL: "MEDIUM",
  WEBSITE_UNREACHABLE: "HIGH",
  REPORT_READY: "INFO",
  REPORT_FAILED: "LOW",
  MEMBER_JOINED: "INFO",
  TRIAL_ENDING: "MEDIUM",
  PAYMENT_FAILED: "HIGH",
  PLAN_CHANGED: "INFO",
  AI_QUOTA_WARNING: "LOW",
  USAGE_LIMIT_WARNING: "MEDIUM",
};

/**
 * Types an agency is alerted about by DEFAULT when they have written no rules.
 *
 * Deliberately narrow. A default that alerts on everything trains people to
 * mute us in week one, which is the failure mode feature doc 13 names as
 * fatal — and the ones left out are all visible in the notification centre.
 */
export const DEFAULT_TRIGGER_TYPES: readonly NotificationType[] = [
  "CRITICAL_ISSUE",
  "CONSENT_REGRESSION",
  "NEW_TRACKER",
  "PRIVACY_DRIFT",
  "WEBSITE_UNREACHABLE",
  "REPORT_READY",
];

export function renderCopy(
  type: NotificationType,
  site: string | null,
): NotificationCopy {
  // `noUncheckedIndexedAccess` widens a Record lookup to `| undefined` even
  // when the key type is exhaustive. INFO copy is the safe stand-in — an
  // unknown type must still produce a readable row, never a blank one.
  const copy = NOTIFICATION_COPY[type] ?? NOTIFICATION_COPY.PRIVACY_DRIFT;
  // "your website" rather than an empty gap: an agency-level alert (billing,
  // reports) has no site, and "Critical potential issue on " reads as a bug.
  const label = site ?? "your portfolio";
  return {
    title: copy.title.replace("{site}", label),
    body: copy.body.replace("{site}", label),
  };
}
