/**
 * EMAIL COPY — PLAN.md Part IX §9.5, Part XI §11.11.
 *
 * ⚠️ SEPARATED FROM LAYOUT ON PURPOSE (§9.5): "adding a locale is a copy file,
 * not a template rewrite."
 *
 * ⚠️ BOUND BY THE APPROVED TERMINOLOGY (Part I §1.12) and scanned by
 * `scripts/check-terminology.ts`. Feature doc 13 names email as the place the
 * banned language leaks in, because template copy gets written quickly and
 * outside the app. Nothing here asserts a legal conclusion.
 */

export const emailCopy = {
  common: {
    fallbackCompany: "Privacy Drift Monitor",
    viewInApp: "Open in Privacy Drift Monitor",
    unsubscribe: "Change which summaries you receive",
    /** Never shown on security or billing mail — §9.5. */
    unsubscribeNote:
      "You are receiving this because you subscribed to summary emails. Alerts about your account and billing are always sent.",
    sentBy: "Sent by",
    monitoringNote:
      "Technical monitoring only. This describes behaviour observed by an automated browser scan.",
  },

  welcome: {
    subject: "Welcome to Privacy Drift Monitor",
    heading: "Let's get your first website monitored",
    intro:
      "Your agency workspace is ready. Add a client website and we'll scan it in a real browser across four consent journeys.",
    cta: "Add your first website",
    steps: [
      "Add a client website",
      "We scan it and record what happens before and after consent",
      "We compare every scan against the last and tell you what changed",
    ],
  },

  invitation: {
    subject: "You've been invited to join {agency} on Privacy Drift Monitor",
    heading: "{inviter} invited you to {agency}",
    intro:
      "You'll be able to see monitoring results for the websites this agency looks after.",
    cta: "Accept invitation",
    expiry: "This invitation expires in 7 days.",
  },

  portalInvitation: {
    subject: "{company} has set up privacy monitoring for your website",
    heading: "Your website is being monitored",
    intro:
      "{company} monitors {site} for privacy and consent behaviour. You can see the current status at any time — no password needed.",
    cta: "Open your dashboard",
    expiry: "This link expires in 15 minutes. You can request a new one at any time.",
  },

  portalMagicLink: {
    subject: "Your sign-in link",
    heading: "Here's your sign-in link",
    intro: "Use the button below to open your monitoring dashboard.",
    cta: "Sign in",
    expiry: "This link expires in 15 minutes and can only be used once.",
    ignore: "If you didn't ask for this, you can ignore this email.",
  },

  scanCompleted: {
    subject: "First scan finished for {site}",
    heading: "We've finished the first scan of {site}",
    intro:
      "Here's what we detected on the first run. From now on we'll only email you when something changes.",
    cta: "See the results",
  },

  criticalIssue: {
    subject: "Critical: potential issue detected on {site}",
    heading: "A critical potential issue was detected on {site}",
    intro:
      "The latest scan produced a finding at critical severity. Review recommended.",
    cta: "Open the finding",
    evidenceNote:
      "Every finding links to the recorded request, cookie or storage write it came from.",
  },

  consentRegression: {
    subject: "Consent behaviour changed on {site}",
    heading: "Rejecting consent no longer behaves as it did",
    intro:
      "On the previous scan, choosing Reject All stopped the trackers below. On this scan it did not. This is the highest-priority change we report.",
    cta: "See what changed",
  },

  dailyDigest: {
    subject: "Your daily monitoring summary",
    heading: "What we detected yesterday",
    intro: "Grouped by website, most serious first.",
    cta: "Open your dashboard",
    nothing: "Nothing new was detected across your portfolio.",
    andMore: "and {count} more",
  },

  weeklySummary: {
    subject: "Your weekly monitoring summary",
    heading: "Your portfolio this week",
    intro: "Health across your websites, and everything that changed.",
    cta: "Open your dashboard",
  },

  websiteUnreachable: {
    subject: "We couldn't reach {site}",
    heading: "{site} could not be reached",
    intro:
      "Three consecutive scans failed to load the site. Monitoring continues, but we cannot produce findings until it responds again.",
    cta: "Check the website",
  },

  reportReady: {
    subject: "Your report is ready",
    heading: "{name} is ready",
    intro: "Your report has finished generating and is available to download.",
    cta: "Download the report",
    expiry: "This download link expires in 24 hours. You can always download it from the app.",
  },

  clientReportDelivery: {
    subject: "Your monitoring report from {company}",
    heading: "Your monitoring report for {period}",
    intro:
      "{company} monitors your website for privacy and consent behaviour. Your report for {period} is attached.",
    cta: "Open your dashboard",
  },

  reportFailed: {
    subject: "We couldn't generate your report",
    heading: "We couldn't generate this report",
    /** §12.3 requires this sentence, in these terms. */
    intro:
      "Something went wrong while generating {name}. Nothing was charged against your report allowance.",
    cta: "Try again",
  },

  trialEnding: {
    subject: "Your trial ends in {days} days",
    heading: "Your trial ends in {days} days",
    intro:
      "Add a payment method to keep monitoring running without interruption. Nothing is charged until your trial ends.",
    cta: "Add a payment method",
  },

  paymentFailed: {
    subject: "A payment didn't go through",
    heading: "We couldn't take your payment",
    intro:
      "Your last payment was declined. Monitoring continues for now — update your payment method to avoid interruption.",
    cta: "Update payment method",
  },

  subscriptionChanged: {
    subject: "Your plan has changed",
    heading: "Your plan is now {plan}",
    intro: "Your limits have been updated to match the new plan.",
    cta: "See your plan",
  },

  usageWarning: {
    subject: "You've used {percent}% of your {metric}",
    heading: "You're approaching a plan limit",
    intro:
      "You've used {used} of {limit} {metric} this period. Nothing stops working yet.",
    cta: "See your usage",
  },

  /**
   * §9.2's grace emails. TWO of them, because the two moments need opposite
   * things from the reader: the first asks for action while action still
   * changes the outcome, the second reports what happened and how to undo it.
   *
   * ⚠️ NEITHER MAY MENTION DELETION, because nothing is deleted. §9.2:
   * "auto-paused (never deleted)". An email that says "sites will be removed"
   * is factually wrong AND is the sentence that makes somebody cancel.
   */
  graceStarted: {
    subject: "You're over your plan's website limit",
    heading: "{excess} more websites than your plan includes",
    intro:
      "Nothing has changed and nothing has been removed — every site is still being monitored. You have {days} days to archive the sites you no longer need, or move up a plan. After that, the oldest extra sites are paused until you make room; pausing keeps all their history and is undone in one click.",
    cta: "See your plan",
  },

  gracePaused: {
    subject: "{count} websites have been paused",
    heading: "We paused your oldest extra websites",
    intro:
      "Your plan includes {limit} websites and you had {count} more than that, so the oldest ones are now paused. Nothing has been deleted — every scan, finding and piece of evidence is intact. Archive a site you no longer need, or move up a plan, then set any of these back to active.",
    cta: "Manage your websites",
  },

  aiQuotaWarning: {
    subject: "You've used most of this period's AI credits",
    heading: "AI credits are running low",
    intro:
      "Explanations may pause until the period resets. Scanning, findings, drift and reports are unaffected.",
    cta: "See AI usage",
  },

  supportReceived: {
    subject: "We've got your message",
    heading: "Thanks — we've got your message",
    intro: "We'll reply to this address. Here's a copy of what you sent.",
    cta: "Open Privacy Drift Monitor",
  },
} as const;

export type EmailCopy = typeof emailCopy;

/** Substitutes `{token}` placeholders. Missing tokens are left visible, not blanked. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
