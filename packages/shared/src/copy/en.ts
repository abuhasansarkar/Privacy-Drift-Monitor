/**
 * USER-FACING COPY — PLAN.md Part XI §11.11.
 *
 * Every string a user reads lives here, not in JSX. English only at launch, but
 * the shape is what makes a future `[locale]` segment cheap: add `de.ts` with
 * the same keys and swap the dictionary passed to `t()`. No component changes.
 *
 * ⚠️ Bound by the approved terminology in `./terminology.ts` and enforced by
 * `scripts/check-terminology.ts`, which scans this file. This is a technical
 * monitoring product: it reports what was detected, and never asserts a legal
 * conclusion.
 *
 * Keep keys grouped by surface and alphabetical within a group, so two people
 * adding copy to the same screen collide in git rather than duplicating.
 */
export const en = {
  app: {
    name: "Privacy Drift Monitor",
    tagline:
      "Automated privacy and consent monitoring for web agencies.",
  },

  nav: {
    dashboard: "Dashboard",
    features: "Features",
    howItWorks: "How it works",
    pricing: "Pricing",
    resources: "Resources",
    freeScanner: "Free scanner",
    /** The header's ONE primary action — see marketing-auth-links.tsx. */
    runFreeScan: "Run free scan",
    skipToContent: "Skip to main content",
  },

  auth: {
    signIn: "Sign in",
    signOut: "Sign out",
    startTrial: "Start free trial",
    accountMenu: "Account menu",
  },

  /** §3.2 — the four legal documents and their shared template. */
  legal: {
    contents: "Contents",
    lastUpdated: "Last updated",
    otherDocuments: "Other documents",
    footerTitle: "Legal",
  },

  /** §3.2 — the public homepage. The full page is Phase 1 task 1.13. */
  marketing: {
    heroEyebrow: "Continuous privacy & consent drift monitoring",
    heroTitle:
      "Detect privacy and consent changes across every client website — automatically.",
    heroSubtitle:
      "Privacy Drift Monitor watches your clients' sites in a real browser, tests what happens before consent, after Reject All, and after withdrawal — and tells you the moment something changes.",
    primaryCta: "Start free trial",
    secondaryCta: "Scan a website free",
    heroCtaTrial: "Start 14-day free trial",
    heroCtaScan: "Scan website",
    badgeTrial: "14-day free trial",
    badgeCancel: "Cancel any time",
    badgeMonitoring: "Automated drift detection",
    badgeNoCard: "No credit card required",
    trustedCmpTitle: "Compatible with modern consent platforms & tag managers",
    step1: "Add your client sites",
    step2: "We scan them in a real browser",
    step3: "We compare against last time",
    step4: "You get told what changed",
    stepsTitle: "How it works",

    /** §4.2 — the differentiator. A snapshot vs. what changed. */
    driftEyebrow: "Privacy drift",
    driftTitle: "A snapshot tells you today. Drift tells you what changed.",
    driftBody:
      "One scan is a photograph. Monitoring is knowing that on Tuesday a new tag appeared, and that rejection stopped being respected.",
    driftLastWeek: "Last week",
    driftToday: "Today",

    problemTitle: "What goes wrong between check-ins",
    problem1Title: "A tag manager change nobody told you about",
    problem1Body:
      "A marketer adds a pixel through GTM. Nothing in your process sees it until someone complains.",
    problem2Title: "A consent banner that stops working",
    problem2Body:
      "A plugin update changes the reject button. It still looks fine, and it no longer blocks anything.",
    problem3Title: "A site you last checked in March",
    problem3Body:
      "You cannot manually re-check forty client sites every month, so you check the loud ones.",

    benefitsTitle: "What you get",
    benefit1Title: "Evidence, not opinions",
    benefit1Body:
      "Every finding points at the request, cookie or storage write it came from. You can show a client the recording.",
    benefit2Title: "The four consent journeys",
    benefit2Body:
      "No consent, Reject All, Accept All and withdraw — tested in a real browser, in isolated sessions.",
    benefit3Title: "Told what changed",
    benefit3Body:
      "Not a dashboard you have to remember to open. A change on a client site becomes a notification.",

    honestyTitle: "What we can and can't see",
    honestyCan:
      "We record what a real browser does: requests, cookies, storage, and whether a consent control worked.",
    /** §1.11 — the boundary, stated on the marketing site, not buried. */
    honestyCannot:
      "We are a technical monitoring service. We don't determine compliance and we don't give legal advice — findings are evidence for whoever does.",

    ctaTitle: "Start monitoring your client sites",
    ctaBody: "Add a website and see what a real browser records.",

    featuresTitle: "Features",
    howItWorksTitle: "How it works",
  },

  /** §4.4 — what the product RECORDS, never what it concludes (§1.11). */
  features: {
    browserTitle: "Real browser, real behaviour",
    browserBody:
      "Every check loads the site in Chromium and records what actually happens — requests, cookies, storage writes — rather than reading the HTML and guessing.",
    consentTitle: "All four consent journeys",
    consentBody:
      "No consent, Reject All, Accept All and withdraw, each in an isolated session so one journey's cookies can never contaminate another's recording.",
    trackerTitle: "Tracker identification with corroboration",
    trackerBody:
      "A vendor matched by two independent signals is a confident identification; one matched by a single signal says so. You see which.",
    driftTitle: "Change detection between scans",
    driftBody:
      "Each scan is compared with the last complete one. A new tag, a new cookie, or a rejection that stopped being respected becomes a dated event.",
  },

  /** §4.5 — the order IS the explanation. */
  howItWorks: {
    stage1: "You add a client website.",
    stage2: "We load it in a real browser and record every request, cookie and storage write.",
    stage3:
      "We find the consent banner and test all four journeys — including whether Reject All is respected.",
    stage4:
      "Recorded requests are matched against a vendor catalogue to identify who was contacted.",
    stage5:
      "The scan is compared with the last complete one, and anything that changed becomes an event.",
    stage6: "You get told what changed, with the evidence it came from.",
  },

  common: {
    cancel: "Cancel",
    clearFilters: "Clear filters",
    close: "Close",
    copy: "Copy",
    copied: "Copied",
    delete: "Delete",
    edit: "Edit",
    retry: "Try again",
    save: "Save",
    viewDetails: "View details",
  },

  /**
   * Outcome vocabulary. These three are the ONLY words the product uses to
   * report a result — never pass/fail, never a compliance judgement (§1.12).
   */
  outcome: {
    detected: "Detected",
    notDetected: "Not detected",
    undetermined: "Could not be determined",
  },

  /** §11.8 — every empty state names the concept, the value, and the action. */
  empty: {
    noClients:
      "Clients group websites together for reporting and portal access.",
    /*
     * ⚠️ "IN THIS PERIOD", NOT "SINCE MONITORING BEGAN". Both call sites are
     * WINDOWED — the dashboard card looks back 7 days and `/app/drift` 30 — so
     * the old wording told an agency that nothing had ever changed on a site
     * whose Changes tab was listing changes from last month. In a product whose
     * entire claim is that it reports only what it observed, an empty state
     * that overstates its own coverage is the same defect class as a rule that
     * invents a fact: it asserts something the evidence does not support.
     */
    noDrift:
      "No changes recorded in this period. We'll tell you the moment something changes.",
    noIssuesFiltered: "No issues match these filters.",
    /** Generic filtered-empty. Distinct from the never-had-any states above. */
    noMatches: "Nothing matches these filters. Try clearing them.",
    noNotifications: "You're all caught up.",
    noReports: "Generate your first monitoring report after a completed scan.",
    noScans: "The first scan is queued and usually takes about two minutes.",
    noTeamMembers:
      "Invite your team so they can review and resolve issues.",
    noWebsites:
      "Add your first client website to start monitoring privacy behavior.",
    noIssues:
      "No potential issues detected across your websites.",
    noAuditEntries:
      "Nothing recorded yet. Every change to a website, client or issue is logged here.",
    noIgnored:
      "Nothing is being suppressed. Findings you ignore will be listed here so they can be brought back.",
    noTrackers: "No third-party trackers were detected in this scan.",
    noCookiesInPhase: "No cookies were recorded in this consent state.",
    /** Distinct from noDrift: drift needs two completed scans to exist at all. */
    noDriftYet:
      "No changes recorded yet. Drift is detected by comparing two completed scans.",
    noWebsitesForClient:
      "No websites are assigned to this client yet.",
    /** Never "no issues found" — a site with no scan has no result, not a clean one. */
    noScansYet:
      "This website hasn't been scanned yet. The first scan runs on its next scheduled check.",
    /** A FAILED scan has no evidence because nothing was recorded — say that. */
    noEvidenceFailedScan:
      "This scan didn't complete, so no requests were recorded.",
    noRequestsRecorded: "No requests were recorded during this scan.",
    scanHistoryPending:
      "Scan history arrives with the scanner. This website has been checked, but per-scan detail isn't available yet.",
  },

  /** §11.8 — user language, and every one offers a next action. */
  error: {
    generic: "Something went wrong on our side.",
    partialScan:
      "Some consent tests couldn't be completed on this scan. Results below cover only the tests that ran.",
    referenceLabel: "Reference",
    validation: "Check the highlighted fields and try again.",
    notFound: "We couldn't find that.",
    unreachable:
      "We couldn't reach this website. It may be offline, or it may be blocking automated visits.",
    urlNotAllowed: "We can't monitor this address.",
  },

  /** §3.3 — the authenticated app shell. */
  shell: {
    closeMenu: "Close menu",
    openMenu: "Open menu",
    notifications: "Notifications",
    search: "Search websites, clients and issues",
    searchShort: "Search",
    searchHint: "Search websites, clients and issues by name.",
    typeWebsite: "Website",
    typeClient: "Client",
    typeIssue: "Issue",
    websitesUsed: "websites used",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
  },

  navApp: {
    clients: "Clients",
    dashboard: "Dashboard",
    drift: "Privacy Drift",
    issues: "Issues",
    trackers: "Trackers",
    reports: "Reports",
    settings: "Settings",
    team: "Team",
    websites: "Websites",
  },

  /** §3.4 — the portfolio overview. */
  dashboard: {
    addWebsite: "Add website",
    averageHealth: "Average health score",
    needsAttention: "Needs attention",
    needsAttentionEmpty: "No open potential issues across your websites.",
    openIssues: "Open potential issues",
    title: "Dashboard",
    viewAllWebsites: "View all websites",
    websitesMonitored: "Websites monitored",
    healthy: "Healthy",
    warnings: "Warnings",
    critical: "Needs review",
    scansToday: "Scans today",
    newIssues: "New issues (24h)",
    driftEvents: "Changes (7 days)",
    healthTrend: "Privacy health trend",
    trendDay: "Day",
    /** A line needs two points; one is a number, and it is already a tile. */
    trendNeedsMore:
      "A trend line appears once two days of scans have been recorded.",
    recentDrift: "Recent changes",
    viewDriftFeed: "View all changes",
    /** Health-score band labels — §11.3, feature 11. */
    bandExcellent: "Excellent",
    bandGood: "Good",
    bandFair: "Fair",
    bandPoor: "Poor",
    bandCritical: "Needs review",
    attentionCenter: "Attention Center",
    attentionItems: "items",
    attentionEmpty: "Nothing needs your attention.",
    attentionEmptyDetail: "{count} websites monitored.",
    attentionAlso: "and {count} more on this website",
    recentActivity: "Recent activity",
    recentActivityEmpty: "Nothing has happened yet.",
    actionView: "View",
    actionAcknowledge: "Acknowledge",
    actionRescan: "Re-scan",
    kindConsentRegression: "Consent changed",
    kindCriticalIssue: "Critical finding",
    kindScanFailing: "Scans failing",
    kindNewTracker: "New tracker",
    kindStale: "Not scanned recently",
    activityScanCompleted: "Scan completed",
    activityScanPartial: "Scan partially completed",
    activityScanFailed: "Scan failed",
    activityIssueResolved: "Finding updated",
    activityIssueIgnored: "Finding ignored",
    activityWebsiteAdded: "Website added",
    activityReportGenerated: "Report generated",
    activityMemberJoined: "Member invited",
    activityOther: "Change recorded",
  },

  /** §3.9 — scan detail and progress. */
  scans: {
    title: "Scans",
    scanNow: "Scan now",
    scanning: "Starting scan",
    alreadyRunning: "A scan is already running for this website.",
    running: "Running",
    queued: "Queued",
    /*
     * ⚠️ IT REPORTS ELAPSED TIME, IT DOES NOT DIAGNOSE. The page knows how long
     * the scan has been going and nothing else; claiming it is stuck would be
     * asserting a fact about the worker that the browser cannot observe.
     */
    takingLonger:
      "This scan is taking longer than most. It will keep going, and this page updates on its own.",
    statusCompleted: "Completed",
    statusPartial: "Partial",
    statusFailed: "Failed",
    statusCancelled: "Cancelled",
    /** §11.8 — PARTIAL is explained, never left as a bare label. */
    partialBanner:
      "Some consent journeys couldn't be completed on this scan. Results below cover only the journeys that ran.",
    phaseNoConsent: "No consent",
    phaseRejectAll: "Reject All",
    phaseAcceptAll: "Accept All",
    phaseWithdraw: "Withdraw",
    phaseGpc: "Global Privacy Control",
    phaseInteractive: "Interactive simulation",
    columnStarted: "Started",
    columnDuration: "Duration",
    columnRequests: "Requests",
    columnStatus: "Outcome",
    requestsTitle: "Recorded requests",
    columnTime: "Time",
    columnRequest: "Request",
    columnType: "Type",
    columnConsentState: "Consent state",
    beforeConsent: "Before consent",
    firstParty: "First-party",
    viewScan: "View scan",
  },

  /** PhaseStatus → the outcome vocabulary. Never pass/fail (§1.12). */
  phaseStatus: {
    EXECUTED: "Completed",
    UNDETERMINED: "Could not be determined",
    SKIPPED: "Not run",
    FAILED: "Failed",
  },

  /** §3.8, §3.10 — the issue queue and issue detail. */
  issues: {
    title: "Issues",
    unresolved: "unresolved",
    columnSeverity: "Severity",
    columnIssue: "Issue",
    columnWebsite: "Website",
    columnStatus: "Status",
    columnFirstDetected: "First detected",
    columnLastSeen: "Last seen",
    columnOccurrences: "Times seen",
    filterSeverity: "Severity",
    filterStatus: "Status",
    searchPlaceholder: "Search issues",
    acknowledge: "Acknowledge",
    resolve: "Resolve",
    ignore: "Ignore",
    ignoring: "Ignoring",
    saving: "Saving",
    /** Ignoring outlives the person who did it — the reason is mandatory. */
    ignoreTitle: "Ignore this potential issue?",
    ignoreBody:
      "It won't be raised again on future scans. Say why, so whoever reviews this later understands the decision.",
    reasonLabel: "Reason",
    reasonPlaceholder: "Loaded by our own consent banner, reviewed with the client.",
    reasonRequired: "Give a reason of at least 10 characters.",
    whatHappened: "What happened",
    whyTechnical: "Why this matters technically",
    whenDetected: "When detected",
    recommendedAction: "Recommended action",
    evidence: "Evidence",
    /** A recorded row whose payload carries no identifying string. Never a guess. */
    evidenceSubjectUnknown: "No identifier recorded",
    viewScan: "View the scan that recorded this",
    ruleLabel: "Rule",
  },

  /**
   * §8.5, §8.8, §11.8 — the AI layer.
   *
   * ⚠️ EVERY UNAVAILABLE STATE SAYS WHAT IS STILL TRUE. §12.3 fixes the
   * wording: "AI explanations are temporarily unavailable. The technical
   * details above are complete." The second sentence is the load-bearing one —
   * it tells the reader the page is not missing anything they need, which is
   * what makes AI additive (P3) rather than a feature whose absence is a gap.
   *
   * ⚠️ THE LABEL IS PERSISTENT, NOT A TOOLTIP. §8.8 lists opacity as a named
   * risk and requires "a persistent 'Generated by AI from the evidence below'
   * label and a link to the raw evidence" on every output.
   */
  ai: {
    label: "AI-generated from the evidence above",
    labelShort: "AI-generated",
    explanation: "Explanation",
    recommendedFix: "Recommended fix",
    driftSummary: "Summary of changes",
    clientMessage: "Message to client",
    generate: "Explain with AI",
    generateFix: "Suggest a fix",
    generateSummary: "Summarise the changes",
    generating: "Generating",
    regenerate: "Regenerate",
    confidence: "Confidence",
    confidenceHigh: "High confidence",
    confidenceMedium: "Medium confidence",
    confidenceLow: "Low confidence",
    /** §8.8: a low-confidence output points the reader back at the evidence. */
    lowConfidenceHint:
      "The evidence only partly supports this. Review the recorded evidence directly.",
    /** §8.8: a hypothesis renders in a visually distinct, labeled block. */
    hypothesis: "Hypothesis",
    hypothesisHint:
      "This is an inference, not something the scanner observed directly.",
    evidenceUsed: "Evidence used",
    viewEvidence: "View this evidence",
    helpful: "This was helpful",
    notHelpful: "This was not helpful",
    feedbackThanks: "Thanks — that helps us improve the prompts.",
    fromCache: "Shown from an earlier generation",
    steps: "Steps",
    verificationSteps: "How to verify",
    affectedSystem: "Where the change belongs",
    fixRisk: "Risk of applying this fix",
    tone: "Tone",
    toneReassuring: "Reassuring",
    toneFactual: "Factual",
    toneUrgent: "Urgent",
    fixInProgress: "A fix is already underway",
    draftNotice:
      "This is a draft. Read it, edit it, and send it yourself — nothing is sent from here.",
    copyDraft: "Copy draft",
    copied: "Copied",
    openInEmail: "Open in email client",
    subject: "Subject",
    body: "Message",
    /* ── The unavailable states ────────────────────────────────────────── */
    unavailable:
      "AI explanations are temporarily unavailable. The technical details above are complete.",
    disabled:
      "AI features are turned off for this agency. The technical details above are complete.",
    quotaExceeded:
      "This month's AI credits are used up. The technical details above are complete.",
    /**
     * ⚠️ THE VALIDATOR FIRING IS THE PRODUCT WORKING. §8.8's design is that a
     * rejected response is a SAFE outcome, so this copy does not apologise for
     * the control that protected the reader — it says what happened and what
     * is still true.
     */
    rejected:
      "An AI response was generated but did not meet our accuracy checks, so it was discarded. The technical details above are complete.",
    noDriftToSummarise: "There are no recorded changes in this period to summarise.",
    /**
     * §11.8 — AI is additive and absent here; say so rather than leaving a gap.
     *
     * ⚠️ ONE STRING PER FEATURE. A single generic message was reused for both
     * cards on the issue page, so the "Recommended fix" card read "No AI
     * explanation has been generated for this yet." — telling the reader about
     * a different card than the one they were looking at.
     */
    notGeneratedYet: "No AI explanation has been generated for this yet.",
    noFixYet: "No suggested fix has been generated for this yet.",
    noDriftSummaryYet: "No AI summary has been generated for this period yet.",
  },

  /** §3.9 — `/app/ai`, the task panel. Flagged `AI_ASSISTANT_PAGE`. */
  aiAssistant: {
    title: "AI assistant",
    subtitle: "Explain findings the scanner has already recorded.",
    actionsTitle: "What you can ask for",
    explainBody:
      "Turn a technical finding into something an account manager can forward.",
    fixBody: "The shortest path to a fix, with steps to verify it.",
    driftBody: "What changed on a website this week, in one paragraph.",
    messageBody: "A draft email to a client about one or more findings.",
    pickIssue: "Pick a finding",
    pickWebsite: "Pick a website",
    /**
     * ⚠️ THE BOUNDARY STATEMENT FOR THE AI LAYER. §0.2 P1–P2 in the words a
     * user reads: the scanner decides what happened, AI only describes it, and
     * anything it says traces to recorded evidence.
     */
    boundary:
      "AI is used only to describe findings the scanner recorded. It never decides whether a request happened, whether a tracker fired, or whether a scan succeeded — those come from the browser recording alone. Every AI output links to the evidence it used, and one that references anything else is discarded before you see it.",
  },

  /**
   * §9.2, §9.3 — plans, limits and the 402 surface.
   *
   * ⚠️ A PLAN CEILING IS A SALES SURFACE, NOT AN ERROR. §9.2 asks for "402 +
   * upgrade prompt naming the limit", so this copy says what was reached and
   * what to do — never "something went wrong". The number itself is appended by
   * `entitlement-guard.ts`, because it is data, not copy.
   */
  billing: {
    title: "Billing",
    limitReached: "You have reached your plan limit:",
    featureNotOnPlan: "That feature is not included in your current plan.",
    optionNotOnPlan: "That option is not available on your current plan.",
    upgradePrompt: "Upgrade your plan to continue.",
    viewPlans: "View plans",
    /** §9.2's read-only state — rule 3: stop spending, never hide data. */
    readOnlyTitle: "New scans are paused",
    readOnlyBody:
      "Your subscription needs attention, so new scans and AI generation are paused. Everything you have already recorded stays available.",
    trialEndsIn: "days left in your trial",
    trialEnded: "Your trial has ended.",
    pastDue: "A payment did not go through.",
    updatePayment: "Update payment method",
    /** §9.2 grace on downgrade — never delete, pause the oldest. */
    graceTitle: "You are over your new plan limit",
    graceBody:
      "Nothing has been removed. Archive the sites you no longer monitor, or move back up a plan, and monitoring continues as it is.",
    graceDaysLeft:
      "days before the oldest extra sites are paused — paused, not deleted, and reversible in one click.",
    unavailable:
      "Billing is temporarily unavailable. Your subscription and everything it includes are unaffected.",
    noSubscription: "There is no subscription to manage yet.",
    confirming: "Confirming your subscription…",
    confirmingBody:
      "Payment went through. We are waiting for confirmation from our payment provider — this usually takes a few seconds.",
    confirmingSlow:
      "Your payment went through. Confirmation is taking longer than usual — this page will update on its own, and nothing further is needed from you.",
    checkoutCancelled: "Checkout was cancelled. Nothing has been charged.",
    usageTitle: "Usage this period",
    unlimited: "Unlimited",
    ofLimit: "of",

    /* §3.11 — the /app/billing page itself (task 6.3). */
    subtitle: "Your plan, what you have used this period, and your invoices.",
    currentPlan: "Current plan",
    noPlanTitle: "No subscription yet",
    noPlanBody:
      "Pick a plan to start monitoring. You are on a small starting allowance until you do.",
    perMonth: "per month",
    perYear: "per year",
    renewsOn: "Renews",
    endsOn: "Access ends",
    cancelScheduled: "Cancelling at the end of this period",
    changePlan: "Change plan",
    choosePlan: "Choose a plan",
    manageBilling: "Manage billing",
    manageBillingHelp:
      "Payment method, invoices, tax details, downgrades and cancellation are handled by our payment provider.",
    periodLabel: "Period",
    invoicesTitle: "Invoices",
    invoiceNumber: "Invoice",
    invoiceDate: "Date",
    invoiceAmount: "Amount",
    invoiceStatus: "Status",
    invoiceView: "View",
    invoicesEmpty: "No invoices yet. The first one arrives after your trial ends.",
    invoicesUnavailable:
      "Invoices could not be loaded from our payment provider just now. Your subscription is unaffected.",
    paymentMethodTitle: "Payment method",
    cardEnding: "ending",
    cardExpires: "Expires",
    noPaymentMethod: "No card on file. One is added at checkout.",
    billingEmail: "Billing email",
    billingEmailNone: "Not set",
    taxIdTitle: "VAT / Tax ID",
    taxIdNone: "None recorded. Add one during checkout or in the billing portal.",
    interval: "Billing interval",
    monthly: "Monthly",
    annual: "Annual",
    annualSaving: "2 months free",
    startPlan: "Start this plan",
    switchToPlan: "Switch to this plan",
    currentPlanBadge: "Your plan",
    trialBadge: "14-day trial, no card",
    downgradeViaPortal:
      "Moving to a smaller plan is done in the billing portal so any refund is calculated correctly.",
    checkoutFailed: "Checkout could not be opened. Try again in a moment.",
    portalFailed: "The billing portal could not be opened. Try again in a moment.",
    trialBannerTitle: "Trial",
    metricWebsites: "Websites",
    metricSeats: "Team members",
    metricScans: "Scans this period",
    metricAiCredits: "AI credits",
    metricReports: "Reports this period",
    metricStorage: "Evidence storage",
    metricNotMetered: "Metered, not capped",
    remaining: "remaining",
  },

  /**
   * §9.1's `SubscriptionStatus` enum, in the customer's words.
   *
   * ⚠️ NOT THE STRIPE WORDS. "incomplete_expired" is accurate and means nothing
   * to the person reading it; what they need to know is whether service is on.
   */
  subscriptionStatus: {
    trialing: "Trial",
    active: "Active",
    pastDue: "Payment failed",
    canceled: "Cancelled",
    unpaid: "Unpaid",
    incomplete: "Awaiting payment",
    incompleteExpired: "Checkout expired",
    paused: "Paused",
  },

  /**
   * §3.2's remaining public pages — resources, blog, about, contact.
   *
   * ⚠️ THE CMP TABLE COPY SAYS WHAT WE CANNOT DO. §3.2 asks for the table to
   * double as "honest limitation disclosure", and a support matrix that lists
   * only the green rows is marketing rather than disclosure.
   */
  marketingPages: {
    resourcesTitle: "Resources",
    resourcesSubtitle:
      "How the scanner works, what it can and cannot see, and how agencies use it.",
    cmpTableTitle: "Consent platform support",
    cmpTableSubtitle:
      "Five platforms have a dedicated adapter. Everything else falls back to generic strategies, which usually work — and when they do not, the journey is reported as undetermined rather than as a pass.",
    cmpPlatform: "Platform",
    cmpDetection: "Detection",
    cmpNotes: "Notes",
    blogTitle: "Writing",
    blogSubtitle:
      "Notes on consent configuration, how monitoring differs from an audit, and the arithmetic agencies use.",

    aboutTitle: "About",
    aboutLead:
      "We build one thing: a service that loads your clients' websites in a real browser and tells you when what they load changes.",
    aboutWhyTitle: "Why we built it",
    aboutWhyBody:
      "Agencies inherit responsibility for websites they did not build and cannot watch every day. A consent setup that was correct at launch decays quietly — a pixel added from a marketing dashboard, a plugin update, a consent platform that ships a new category mapping. Nobody is told, because nothing looks different.",
    aboutHowTitle: "How we think about it",
    aboutHowBody:
      "The scanner is the only thing allowed to decide what happened. Rules interpret the recording; AI explains it; neither can add a fact. That constraint is why a finding can always be traced back to a request with a timestamp and a consent state, and it is the reason the product is worth trusting at all.",
    aboutBoundaryTitle: "What we are not",
    aboutBoundaryBody:
      "We are a technical monitoring service. We do not give legal advice, we do not assess anyone against a regulation, and we do not certify anything. Findings are described as potential issues and are a starting point for review — by you, and where it matters, by a qualified advisor.",
    aboutContactTitle: "Talk to us",
    aboutContactBody: "Questions about how it works, or whether it fits what you do.",

    contactTitle: "Contact",
    contactSubtitle:
      "Tell us what you are trying to do and we will tell you honestly whether this helps.",
    contactName: "Your name",
    contactEmail: "Email",
    contactAgency: "Agency",
    contactSiteCount: "Roughly how many client sites?",
    contactTopic: "What is this about?",
    contactTopicSales: "Whether it fits what we do",
    contactTopicSupport: "Help with an existing account",
    contactTopicSecurity: "Security or privacy question",
    contactTopicOther: "Something else",
    contactMessage: "Message",
    contactSubmit: "Send",
    contactSending: "Sending…",
    contactSuccess:
      "Thanks — we have your message and will reply to the address you gave.",
    contactError: "That did not send. Try again, or email us directly.",
    changelogTitle: "Changelog",
    changelogSubtitle:
      "New features, improvements, and updates to the Privacy Drift Monitor platform.",
  },

  /**
   * §3.2 & §3.11 — product changelog (Phase 7 task 7.10).
   */
  changelog: {
    title: "Changelog",
    subtitle: "Product updates, new features, and technical improvements.",
    latestRelease: "Latest release",
    allReleases: "All releases",
    categoryFeature: "Feature",
    categoryImprovement: "Improvement",
    categoryFix: "Fix",
    categorySecurity: "Security",
    subscribeTitle: "Stay updated",
    subscribeSubtitle: "Major updates are also summarised in our agency digest emails.",
  },


  /**
   * §3.11 `/app/help` — in-app help (Phase 6).
   *
   * ⚠️ THE ARTICLES ANSWER THE QUESTIONS SUPPORT ACTUALLY GETS, not the ones a
   * feature list suggests. "Why does my scan say partial" and "why did a
   * tracker I removed still show up" are the two that arrive most, and both are
   * cases where the product is behaving correctly and looks like it is not.
   */
  help: {
    title: "Help",
    subtitle: "How the product behaves, and what to do when it surprises you.",
    searchLabel: "Search help",
    searchPlaceholder: "Search…",
    noResults: "Nothing matched that. Try a different word, or contact us.",
    contactTitle: "Still stuck?",
    contactBody:
      "Tell us what you were doing and what you expected. We will reply to your account email.",
    contactCta: "Contact support",
    shortcutsTitle: "Keyboard shortcuts",
    statusTitle: "System status",
    statusBody: "Queue depth, scan failures and dependency health.",
    articles: "articles",
  },

  /**
   * §3.12 — the platform admin surface (task 6.6).
   *
   * ⚠️ THIS COPY IS FOR US, NOT FOR CUSTOMERS, and it is the one surface where
   * internal identifiers are appropriate: an operator debugging a queue needs
   * the job id and the rule id, not a friendly paraphrase. §1.12's approved
   * terminology still applies — a phrase we use internally is the phrase that
   * ends up in a support reply, and the check scans this file either way. (It
   * scans comments too, which is how this note came to be phrased around the
   * word rather than quoting it.)
   */
  admin: {
    title: "Admin",
    chip: "ADMIN",
    signedInAs: "Signed in as",
    backToApp: "Back to the app",
    navOverview: "Overview",
    navAgencies: "Agencies",
    navUsers: "Users",
    navWebsites: "Websites",
    navScans: "Scans",
    navQueue: "Queue",
    navIssues: "Rule analytics",
    navTrackers: "Trackers",
    navAiUsage: "AI usage",
    navBilling: "Billing",
    navSystemHealth: "System health",
    navLogs: "Logs",
    navFlags: "Feature flags",
    navSettings: "Platform settings",
    forbiddenTitle: "Not available",
    forbiddenBody: "This page is for platform operators.",
    empty: "Nothing to show.",
    searchPlaceholder: "Search…",
    viewDetail: "Open",
    refresh: "Refresh",

    /* §3.12 `/admin` — the operator dashboard. */
    overviewTitle: "Platform overview",
    statAgencies: "Agencies",
    statWebsites: "Active websites",
    statScansToday: "Scans today",
    statFailureRate: "Failed-scan rate",
    statCriticalToday: "Critical issues today",
    statAiSpendToday: "AI spend today",
    statAiSpendMtd: "AI spend this month",
    statMrr: "MRR",
    statQueueDepth: "Queued jobs",
    byPlan: "By plan",
    succeeded: "succeeded",
    partial: "partial",
    failed: "failed",

    /* Queue board. */
    queueTitle: "Queues",
    queueName: "Queue",
    queueWaiting: "Waiting",
    queueActive: "Active",
    queueCompleted: "Completed",
    queueFailed: "Failed",
    queueDelayed: "Delayed",
    queuePaused: "Paused",
    queueRetryAll: "Retry all failed",
    queueRetryJob: "Retry",
    queueRemoveJob: "Remove",
    queuePause: "Pause",
    queueResume: "Resume",
    queueDrain: "Drain",
    queueDrainWarning:
      "Draining discards every waiting job in this queue. Scans, emails and reports that have not started yet are lost and will not be retried.",
    queueRetryAllWarning:
      "This re-queues every failed job at once. On a large backlog that is a load spike, not a repair.",
    queueJobInspector: "Job",
    queueAttempts: "Attempts",
    queueStack: "Stack trace",
    queueNoJobs: "No jobs in this state.",

    /* Rule analytics. */
    rulesTitle: "Rule analytics",
    rulesSubtitle:
      "How often each rule fires and how often people say it was wrong. A rising false-positive rate is the signal to revise a rule before customers stop trusting the findings.",
    ruleId: "Rule",
    ruleFirings: "Issues raised",
    ruleFeedback: "Feedback",
    ruleFalsePositive: "Marked not an issue",
    ruleFpRate: "False-positive rate",
    ruleSeverity: "Severity",

    /* Trackers. */
    trackersTitle: "Tracker vendors",
    trackersUnknownTitle: "Unidentified domains",
    trackersUnknownSubtitle:
      "Third-party domains observed across every tenant that match no vendor, most frequent first. Each one is a finding we could name and currently cannot.",
    trackerName: "Vendor",
    trackerCategory: "Category",
    trackerRisk: "Risk",
    trackerPatterns: "Domain patterns",
    trackerSeenOn: "Seen on",
    trackerOccurrences: "Occurrences",
    trackerCreateFromDomain: "Create vendor",
    trackerSave: "Save vendor",
    trackerCreated: "Vendor saved. It takes effect on the next scan — no deploy needed.",

    /* Agencies. */
    agenciesTitle: "Agencies",
    agencyPlan: "Plan",
    agencyStatus: "Status",
    agencyWebsites: "Websites",
    agencyMembers: "Members",
    agencySignedUp: "Signed up",
    agencyUsage: "Usage against plan",
    agencyActions: "Actions",
    agencySuspend: "Suspend",
    agencyReactivate: "Reactivate",
    agencyExtendTrial: "Extend trial 14 days",
    agencyGrantCredits: "Grant AI credits",
    agencyImpersonate: "Impersonate",
    agencyImpersonateReason: "Reason (required, recorded)",
    agencyImpersonateWarning:
      "Impersonation is time-limited, recorded against your name, and visible in the agency's own audit log. Use it only with a support reason you would be comfortable showing the customer.",

    /* Websites and scans. */
    websitesTitle: "Websites",
    websitesProblem: "Problem sites",
    websitesProblemSubtitle:
      "Sites failing repeatedly. These are the ones a customer is about to complain about.",
    websiteFailures: "Consecutive failures",
    websiteLastScan: "Last scan",
    websiteForceScan: "Force re-scan",
    scansTitle: "Scans",
    scanWorker: "Worker",
    scanDuration: "Duration",
    scanError: "Error",

    /* Billing. */
    billingTitle: "Billing",
    billingMrr: "MRR",
    billingArr: "ARR",
    billingActive: "Active subscriptions",
    billingTrials: "Trials ending in 7 days",
    billingFailed: "Failed payments",
    billingWebhooks: "Stripe webhook events",
    billingReplay: "Replay",
    billingReplayed: "Event re-queued for processing.",

    /* System health. */
    healthTitle: "System health",
    healthDatabase: "Database",
    healthRedis: "Redis",
    healthStorage: "Object storage",
    healthWorkers: "Workers",
    healthExternal: "External services",
    healthOk: "Reachable",
    healthDown: "Not reachable",
    healthUnconfigured: "Not configured",
    healthLatency: "Latency",

    /* Logs. */
    logsTitle: "Logs",
    logsAudit: "Audit log",
    logsSystem: "System log",
    logsActor: "Actor",
    logsAction: "Action",
    logsEntity: "Entity",
    logsWhen: "When",
    logsLevel: "Level",
    logsService: "Service",
    logsMessage: "Message",

    /* Feature flags. */
    flagsTitle: "Feature flags",
    flagsSubtitle:
      "Resolution order: agency override, then plan targeting, then percentage rollout, then the global default. A kill switch turned off stops the behaviour everywhere within the cache window.",
    flagKey: "Flag",
    flagGlobal: "Global default",
    flagRollout: "Rollout %",
    flagOverrides: "Agency overrides",
    flagKillSwitch: "Kill switch",
    flagOn: "On",
    flagOff: "Off",
    flagSaved: "Flag updated.",

    /* Platform settings. */
    settingsTitle: "Platform settings",
    settingsPlans: "Plans",
    settingsScanner: "Scanner defaults",
    settingsAi: "AI models",
    settingsMaintenance: "Maintenance mode",
    settingsAnnouncement: "Announcement banner",
    settingsReadOnlyNote:
      "These values come from the deployed configuration and the plan catalogue. Changing them is a deploy, not a form — shown here so an operator can see what is live without reading the environment.",
  },

  /**
   * §3.2 `/free-scanner` — the anonymous lead-generation scanner (task 6.5).
   *
   * ⚠️ EVERY ERROR HERE IS SPECIFIC AND HELPFUL EXCEPT ONE. Feature doc 18:
   * "The SSRF block message must stay vague." A precise answer to "why can't
   * you scan 10.0.0.5" is a network-probing oracle that anyone can query.
   */
  freeScanner: {
    title: "Free privacy scan",
    headline: "See what a website loads before anyone consents",
    subheadline:
      "Paste a URL. We load it in a real browser with no consent given, and show you what fired anyway. No account, no card, about a minute.",
    urlLabel: "Website address",
    urlPlaceholder: "example.com",
    /** Shown when submit is pressed with nothing usable in the field. */
    errorUrlRequired: "Enter the website address you want to scan.",
    submit: "Scan this website",
    submitting: "Starting…",
    disclaimer:
      "Only scan websites you own or have permission to scan. One scan per website per day.",

    /* Running state — professional animated scan screen. */
    runningTitle: "Privacy scan in progress",
    runningBody:
      "Our automated Chromium browser is loading the website and recording all pre-consent network requests and cookies.",
    stageQueued: "Waiting for an available browser worker",
    stageRunning: "Loading the site with no consent given",
    stageAnalysing: "Analyzing network traffic and storage",
    stageDone: "Scan complete",
    stageBrowser: "Starting isolated Chromium browser session",
    stageNavigate: "Navigating to target URL with zero consent",
    stageNetwork: "Capturing network requests, beacons & tracking scripts",
    stageStorage: "Inspecting cookies, localStorage & storage writes",
    stageRules: "Evaluating technical evidence & computing risk posture",

    /* Email Report Modal */
    emailReportTitle: "Receive this scan report in your email",
    emailReportSubtitle:
      "Get a breakdown of all detected trackers, pre-consent cookies, and a direct link to this report sent to your inbox.",
    emailPlaceholder: "you@company.com",
    emailButton: "Send my report",
    emailSending: "Sending…",
    emailSentSuccess: "Report sent! Check your inbox for the summary.",
    emailReportAction: "Email report",
    emailInvalid: "Please enter a valid email address.",
    emailGenericError: "Could not send report. Please try again.",

    /* Result page — Image 1 reference layout. */
    resultTitle: "What we detected",
    resultFor: "Results for",
    scanResultsBanner: "Privacy and drift scan results for",
    postureTitle: "Your website privacy posture",
    postureSubtitle:
      "Based on observed requests and cookies before consent, here is what our automated browser detected on initial load.",
    showScanResults: "Show scan findings",
    statusLowRisk: "Low risk",
    statusMediumRisk: "Action recommended",
    statusHighRisk: "Elevated risk",
    statusUnknown: "Could not be determined",
    kpiStatus: "Risk posture",
    kpiScanDate: "Scan date",
    kpiRegulations: "Monitored scope",
    kpiRegulationsValue: "ePrivacy · GDPR · CCPA",
    kpiTrackers: "Total number of trackers",
    copyLink: "Copy link",
    linkCopied: "Link copied to clipboard",
    trackersDetectedTitle: "Trackers detected",
    trackerDetailsTitle: "Tracker details",
    catNecessary: "Necessary",
    catPreferences: "Preferences",
    catStatistics: "Statistics",
    catMarketing: "Marketing",
    catUnclassified: "Unclassified",
    colName: "Name",
    colProvider: "Provider",
    colCategory: "Category",
    colDataSentTo: "Data is sent to",
    colStatus: "Observed state",
    noTrackersDetected: "No trackers detected before consent.",
    fullScanCtaTitle: "Get the full overview of all trackers on your website",
    fullScanCtaBody:
      "We will scan your whole website across all consent journeys (No Consent, Reject All, Accept All, and Withdrawal) after you have created your account.",
    fullScanCtaButton: "Start free trial",
    scoreLabel: "Health score",
    partialNotice:
      "This scan did not complete every step, so the picture below is incomplete. Nothing here is a clean verdict.",
    bannerDetected: "Consent banner detected",
    bannerNotDetected: "No consent banner detected",
    bannerUnknown: "Consent platform not identified",
    trackersBefore: "Trackers detected before consent",
    cookiesBefore: "Cookies set before consent",
    thirdPartyDomains: "Third-party domains contacted",
    findingsFound: "Potential issues detected",
    findingsShownNote: "Showing the three most severe. The rest come with monitoring.",
    lockedTitle: "What monitoring adds",
    lockedReject: "Reject All testing — does rejection actually stop the trackers?",
    lockedWithdraw: "Withdrawal testing — what happens after someone changes their mind",
    lockedDrift: "Privacy drift — an alert the day something changes",
    lockedAlerts: "Alerts to your inbox when a critical issue appears",
    lockedReports: "White-label reports you can send straight to the client",
    lockedEvidence: "Full evidence — every request, cookie and storage write, timestamped",
    cta: "Monitor this website — start free trial",
    ctaNote: "14 days, no card. We will pre-fill this address for you.",
    expiresNote: "This result is kept for 7 days and then deleted.",

    /* Errors — five specific, one deliberately vague. */
    errorUnreachable:
      "We could not reach this website. Check the address and try again.",
    errorTimeout:
      "The scan took too long and was stopped. The site may be slow right now.",
    errorBotChallenge:
      "This site is protected by a bot challenge we cannot pass. Monitoring a site you control works around this.",
    errorBlockedAddress: "We can't scan this address.",
    errorDomainBlocked:
      "This website is not available for free scanning. Get in touch if you own it.",
    errorRateLimitedIp:
      "Too many scans from your network. Try again a little later.",
    errorRateLimitedDomain:
      "This website was scanned recently. Free scans are limited to one per website per day.",
    errorCapacity: "We're at capacity right now. Try again in a few minutes.",
    errorChallenge: "The security check did not pass. Reload the page and try again.",
    errorInvalidUrl: "That does not look like a website address.",
    errorGeneric: "Something went wrong running this scan.",
    errorNotFound: "This result has expired or never existed.",
    tryAgain: "Try another website",
  },

  /**
   * §3.2 `/pricing` — the public plan page (task 6.4).
   *
   * ⚠️ DISPLAY CURRENCY ONLY. §9.3 bills in USD and offers GBP/EUR as localized
   * Stripe Prices where they exist; the toggle here changes what a visitor
   * reads, and the checkout resolves the real Price server-side.
   */
  pricing: {
    title: "Pricing",
    headline: "Monitoring you can resell",
    subheadline:
      "Every plan includes the full scanner, all four consent journeys, drift detection and evidence. Plans differ by how many sites you monitor and how often.",
    intervalMonthly: "Monthly",
    intervalAnnual: "Annual",
    annualNote: "2 months free",
    currencyLabel: "Currency",
    currencyNote: "Prices are shown in your chosen currency. Billing is in USD.",
    mostPopular: "Most popular",
    startTrial: "Start free trial",
    talkToUs: "Talk to us",
    perMonth: "/month",
    perMonthAnnual: "/month, billed annually",
    saveAmount: "Save",
    compareTitle: "Compare plans",
    compareNote: "Scroll sideways to see every plan.",
    usageTitle: "What counts as a scan?",
    usageBody:
      "One scan is one run of a website through all four consent journeys, however many pages that plan allows. A re-scan you trigger by hand counts the same as a scheduled one. A scan that could not complete is not counted.",
    whiteLabelTitle: "White-label from Growth up",
    whiteLabelBody:
      "Your logo, your colours and your company name on every client report and in the client portal. Nothing in a client-facing document mentions us.",
    faqTitle: "Questions",
    ctaTitle: "Start monitoring this week",
    ctaBody: "14 days, no card. Add a site and the first scan runs immediately.",

    /* Comparison-table row labels — one per entitlement dimension of §9.2. */
    rowWebsites: "Websites",
    rowFrequency: "Scan frequency",
    rowScans: "Scans per month",
    rowPages: "Pages per scan",
    rowConcurrent: "Concurrent scans",
    rowTeam: "Team members",
    rowClients: "Clients",
    rowAiCredits: "AI credits per month",
    rowAiAdvanced: "Advanced AI tier",
    rowWhiteLabel: "White-label reports",
    rowPortal: "Client portal",
    rowReportTypes: "Report types",
    rowReports: "Reports per month",
    rowEvidence: "Evidence retention",
    rowHistory: "Scan history",
    rowIntegrations: "Slack and webhooks",
    rowApi: "API",
    rowSupport: "Support",
    supportEmail: "Email",
    supportPriority: "Priority",
    reportTypesTwo: "Scan, Website health",
    reportTypesAll: "All five",
    included: "Included",
    notIncluded: "Not included",
    /** Specified, not yet delivered. See the integrations row in pricing-table.tsx. */
    planned: "Planned",
    portalUsers: "users",
    compareFeature: "Feature",
    cardWebsites: "websites",
    cardScans: "scans per month",
    cardCredits: "AI credits per month",
    days: "days",
    months: "months",

    /*
     * §3.2 asks for ten FAQ items. Several of them exist to set the product
     * boundary §1.11 draws — this is technical monitoring, and a pricing page
     * is exactly where a buyer forms the opposite impression if nobody says so.
     */
    faq1Q: "What counts as one scan?",
    faq1A:
      "One run of one website through all four consent journeys — no consent, Reject All, Accept All, and withdraw — across as many pages as your plan allows. A scan that could not complete is not counted against you.",
    faq2Q: "Is this a legal assessment of my client's site?",
    faq2A:
      "No. We are a technical monitoring service. We record what a browser observed on a site and show you the evidence; deciding what that means for a particular business is work for that business and its privacy advisor.",
    faq3Q: "Can I put my own branding on the reports?",
    faq3A:
      "Yes, from Growth up. Your logo, colours and company name appear on every client report and in the client portal, and nothing client-facing mentions us.",
    faq4Q: "What happens when my trial ends?",
    faq4A:
      "Nothing is deleted. Scanning pauses and everything already recorded stays visible until you pick a plan.",
    faq5Q: "What if I go over a limit?",
    faq5A:
      "Adding a website beyond your plan is blocked with a prompt naming the limit. If a downgrade puts you over one, you get 14 days to archive down or move back up — we never delete a site, and after that window the oldest extra sites are paused, not removed.",
    faq6Q: "Do you need access to my client's website?",
    faq6A:
      "No. We load the public site the same way a visitor's browser does. No plugin, no tag, no credentials.",
    faq7Q: "How often do you scan?",
    faq7A:
      "Weekly or monthly on Starter, and daily from Growth up. You can also run a scan by hand at any time.",
    faq8Q: "Can I cancel whenever I want?",
    faq8A:
      "Yes, from the billing portal. Your plan runs to the end of the period you have paid for, and you keep access to your data throughout.",
    faq9Q: "Which currency am I charged in?",
    faq9A:
      "Billing is in USD. Where we have a local price for your currency, checkout uses it; otherwise the USD price applies.",
    faq10Q: "Is the AI deciding what is wrong with my site?",
    faq10A:
      "No. Every detection comes from the browser instrumentation and a fixed set of rules. AI only writes explanations of evidence that was already recorded, and every finding renders whether AI is on or off.",
  },

  /** §3.11, §8.9 — Settings → AI. */
  aiSettings: {
    title: "AI",
    subtitle:
      "AI explains findings the scanner already recorded. It never decides what was detected, and every finding renders with or without it.",
    featuresTitle: "Features",
    featuresBody:
      "Turn AI explanations on or off for everyone in this agency. Individual explanations are generated when someone asks for one.",
    enable: "Enable AI features",
    enableHelp:
      "When off, AI sections show as unavailable and the technical detail on every page is unchanged.",
    autoExplain: "Explain critical findings automatically",
    /**
     * ⚠️ THE WARNING NAMES THE COST, not the behaviour. Feature doc 16 calls
     * this "the main uncontrolled cost vector" — someone approving it needs to
     * know it spends on findings nobody has opened, which the label alone does
     * not say.
     */
    autoExplainHelp:
      "Uses credits for every critical finding as it is detected, including ones nobody opens. Leave this off unless you have reviewed your credit use.",
    costTitle: "Model and credits",
    costBody:
      "One credit is one explanation. Repeat requests for the same finding are served from cache and cost nothing.",
    modelTier: "Model tier",
    tierStandard: "Standard — faster and cheaper",
    tierAdvanced: "Advanced — slower, for harder analysis",
    modelTierHelp:
      "Standard handles explanations, fixes and summaries well. Advanced costs three credits per call.",
    creditCap: "Monthly credit limit",
    creditCapPlaceholder: "No limit",
    creditCapHelp:
      "Leave empty for no limit. Set 0 to stop all AI spend. We notify at 80% and block new calls at 100%.",
    unavailable:
      "Billing is temporarily unavailable. Your subscription and everything it includes are unaffected.",
    noSubscription: "There is no subscription to manage yet.",
    confirming: "Confirming your subscription…",
    confirmingBody:
      "Payment went through. We are waiting for confirmation from our payment provider — this usually takes a few seconds.",
    checkoutCancelled: "Checkout was cancelled. Nothing has been charged.",
    usageTitle: "Usage this period",
    creditsUsed: "Credits used",
    ofCap: "of",
    noCapSet: "No limit set",
    cacheHits: "Served from cache",
    cacheHitsNote: "Cost no credits",
    rejected: "Responses discarded",
    rejectedNote: "Failed our accuracy checks — not charged",
    nearingCap: "You are close to your monthly credit limit.",
    chartLabel: "AI credits used per day",
    peakDay: "Busiest day",
    noUsageYet: "No AI has been used yet in this period.",
    showTable: "Show the numbers",
    columnDate: "Date",
    columnCredits: "Credits",
    columnCalls: "Requests",
    columnCached: "Cached",
    columnRejected: "Discarded",
    noProviderTitle: "No AI provider is configured",
    noProviderBody:
      "Everything below is saved but has no effect until an API key is set for this deployment. Scanning, findings, alerts and reports are unaffected.",
  },

  /** §6.5 — the seven-state lifecycle. "New", never "Open" (§5.12). */
  issueStatus: {
    new: "New",
    acknowledged: "Acknowledged",
    inProgress: "In progress",
    resolved: "Resolved",
    verified: "Verified",
    ignored: "Ignored",
    /** "You fixed this and it came back" — not a fresh finding. */
    reopened: "Reopened",
    needsReview: "Needs review",
  },

  /** §3.11 — the Privacy Drift feed. The product's namesake surface. */
  drift: {
    title: "Privacy Drift",
    eventsIn: "changes in the last",
    days: "days",
    events: "changes",
    websitesChanged: "websites changed",
    viewScan: "View the scan",
    changeTrackerAdded: "New tracker",
    changeTrackerRemoved: "Tracker removed",
    changeUnknownVendorAdded: "New third party",
    changeCookieAdded: "New cookie",
    changeCookieRemoved: "Cookie removed",
    changeDomainAdded: "New domain contacted",
    changeDomainRemoved: "Domain no longer contacted",
    changeScriptAdded: "New script",
    changeScriptRemoved: "Script removed",
    changeConsentBehavior: "Consent behavior changed",
    /** The highest-value signal this product produces — named plainly. */
    changeConsentRegression: "Rejection no longer respected",
    changeCmpChanged: "Consent platform changed",
    changeCmpRemoved: "Consent banner gone",
    changeTrackerCountDelta: "Tracker count changed",
    changeScoreDrop: "Health score dropped",
  },

  websiteTabs: {
    label: "Website sections",
    overview: "Overview",
    trackers: "Trackers",
    cookies: "Cookies",
    consent: "Consent",
    policy: "Privacy Policy",
    changes: "Changes",
    scans: "Scans",
    crawl: "Crawl & Auth",
    fromScan: "Showing the scan from",
    /** A PARTIAL scan's tabs are incomplete — the reader has to be told. */
    fromPartialScan:
      "Showing an incomplete scan from",
  },

  policyTab: {
    title: "Privacy Policy Alignment",
    subtitle: "Reconciles written privacy policy disclosures against observed browser tracking evidence.",
    policyUrl: "Published Policy",
    effectiveDate: "Stated Effective Date",
    freshDate: "Updated recently",
    staleDate: "Older than 12 months",
    alignmentScore: "Disclosure Alignment",
    undisclosedTitle: "Undisclosed Trackers",
    undisclosedDesc: "Observed in technical scanner evidence but absent from the published privacy policy.",
    declaredTitle: "Declared Third-Party Vendors",
    declaredDesc: "Vendors and tracking networks explicitly named in the written document.",
    detectedTitle: "Observed Trackers",
    detectedDesc: "Vendors detected executing network requests or setting storage entries during scans.",
    staleVendorsTitle: "Unobserved Disclosures",
    staleVendorsDesc: "Vendors named in the policy that were not observed loading in recent scans.",
    emptyTitle: "No policy audit recorded yet",
    emptyDescription: "Run a full scan to discover and audit the target website's privacy policy disclosures.",
  },

  trackers: {
    title: "Trackers",
    columnVendor: "Vendor",
    columnCategory: "Category",
    columnFirstSeenUnder: "First seen under",
    columnRequests: "Requests",
    columnConfidence: "Confidence",
    corroborated: "Two signals",
    unknown: "Unknown",
    unknownVendors: "Unknown third parties",
    unknownBody:
      "Contacted by this website but not in our vendor catalogue. Recorded so nothing is missing from the evidence.",
  },

  cookies: {
    columnName: "Name",
    columnParty: "Party",
    columnExpiry: "Expiry",
    columnFlags: "Flags",
    firstParty: "First-party",
    thirdParty: "Third-party",
    session: "Session",
    days: "days",
    compareLabel: "Compare consent states",
  },

  consentTab: {
    noCmp: "No consent platform detected",
    detectionConfidence: "Detection confidence",
    expected: "Expected",
    journeyNotRun: "This journey could not be completed",
    thirdPartyRequests: "third-party requests",
    didNoConsent: "Loaded the page and waited, without touching the banner.",
    didRejectAll: "Found and used the Reject All control, then kept watching.",
    didAcceptAll: "Found and used the Accept All control, then kept watching.",
    didWithdraw: "Looked for a way to withdraw consent after accepting.",
  },

  /** §3.13 — the portfolio question, not the per-site one. */
  trackerInventory: {
    title: "Trackers across your portfolio",
    acrossPortfolio: "vendors detected",
    columnSites: "Websites",
    columnPreConsent: "Before consent on",
    columnRisk: "Risk",
    sites: "sites",
    vendorProfile: "Service profile",
    domains: "Domains",
    scripts: "Script patterns",
    cookiePatterns: "Cookie patterns",
    documentation: "Documentation",
    privacyPolicy: "Privacy policy",
    processingLocation: "Processing location",
    company: "Operated by",
    essentialNote:
      "Marked as a service that may legitimately load before consent, so a pre-consent detection is not treated as critical.",
    whereItAppears: "Where it appears",
    columnFirstSeen: "First seen",
    columnPhases: "Consent states",
    timelineTitle: "When it appeared",
    notFound: "We don't have a profile for that service",
    notFoundBody:
      "It may be an unrecognised third party. Those are listed by domain on the inventory page.",
    noDetections: "Not currently detected on any monitored website.",
  },

  /** §3.5 — the surface that makes suppression reversible. */
  ignored: {
    title: "Ignored findings",
    active: "active suppressions",
    columnReason: "Reason",
    columnScope: "Applies to",
    columnCreated: "Ignored on",
    agencyWide: "All websites",
    revoke: "Stop ignoring",
    revoking: "Removing",
  },

  /** §6.2 — the team page. */
  team: {
    title: "Team",
    members: "members",
    columnMember: "Member",
    columnRole: "Role",
    columnJoined: "Joined",
    columnLastActive: "Last active",
    remove: "Remove",
    removing: "Removing",
    never: "Never",
    /** The guard's message — it names the fix, not just the refusal. */
    lastOwner:
      "An agency needs at least one owner. Make someone else an owner first.",
    inviteTitle: "Team invitations",
    inviteBody:
      "Team members receive an invitation link via email. Once accepted, they gain immediate access with their assigned role.",
    inviteMember: "Invite member",
    inviteMemberTitle: "Invite a team member",
    inviteMemberSubtitle: "Send an invitation to join your agency team.",
    emailLabel: "Email address",
    emailPlaceholder: "colleague@agency.com",
    roleLabel: "Role",
    roleHelpAdmin: "Can manage websites, clients, team members and agency settings.",
    roleHelpManager: "Can manage websites, clients and review issues.",
    roleHelpDeveloper: "Can trigger scans, view raw evidence and resolve issues.",
    roleHelpViewer: "Read-only access to monitoring, issues and reports.",
    sendInvite: "Send invitation",
    sendingInvite: "Sending…",
    inviteSuccess: "Invitation sent.",
    pendingInvitationsTitle: "Pending invitations",
    noPendingInvitations: "No pending invitations.",
    columnEmail: "Email",
    columnSent: "Sent",
    columnExpires: "Expires",
    revoke: "Revoke",
    revoking: "Revoking…",
    resend: "Resend",
    resending: "Resending…",
    resendSuccess: "Invitation resent.",
    copyLink: "Copy link",
    copyLinkTitle: "Copy invitation link",
    linkCopied: "Link copied!",
    directLinkNotice:
      "Share this direct invitation link with your colleague to join immediately:",
    done: "Done",
    alreadyMember: "This person is already a member of your team.",
    alreadyInvited: "An active invitation has already been sent to this email.",
    roleOwner: "Owner",
    roleAdmin: "Admin",
    roleManager: "Manager",
    roleDeveloper: "Developer",
    roleViewer: "Viewer",
    you: "You",
  },

  settings: {
    title: "Settings",
    general: "General",
    agencyName: "Agency name",
    timezone: "Timezone",
    yourRole: "Your role",
    managedInClerk:
      "Your agency name and members are managed in your organization settings.",
  },

  /** §5.6 — who did what. Cursor-paginated; see the page note. */
  /** §3.11 — Settings → Security. */
  security: {
    title: "Security",
    subtitle: "Sessions, two-factor authentication, and the audit trail.",
    sessionsTitle: "Sessions and two-factor authentication",
    sessionsBody:
      "Active sessions, password changes and two-factor authentication are handled by our authentication provider. Open your account menu in the header to manage them.",
    twoFactorTitle: "Require two-factor for everyone",
    twoFactorBody:
      "Enforcing two-factor for the whole agency is an organisation setting with our authentication provider, not a switch here. Turning it on there applies to every member immediately.",
    auditTitle: "Audit trail",
    auditBody:
      "Every change anyone makes is recorded, with who made it and what moved. Export it whenever you need a copy.",
    openAuditLog: "Open the audit log",
    apiKeysTitle: "API keys",
    apiKeysBody:
      "Programmatic access to your monitoring data. Not available yet.",
    ipAllowlistTitle: "IP allowlist",
    ipAllowlistBody:
      "Restrict sign-in to named networks. Not available yet.",
    comingIn: "Planned",
    notAvailable: "Not available yet",
  },

  /** §3.8 "Tab: Evidence", UI_DESIGN_PROMPTS §5.11 — the developer's tab. */
  evidence: {
    title: "Evidence",
    subtitle: "Everything the browser recorded on this scan.",
    scanLabel: "Scan",
    kindRequests: "Requests",
    kindCookies: "Cookies",
    kindStorage: "Storage",
    kindConsole: "Console",
    kindScreenshots: "Screenshots",
    filterDomain: "Domain or URL",
    filterPhase: "Consent state",
    filterType: "Resource type",
    thirdPartyOnly: "Third-party only",
    trackerOnly: "Tracker-matched only",
    anyPhase: "Any state",
    anyType: "Any type",
    columnTime: "Time",
    columnMethod: "Method",
    columnUrl: "URL",
    columnType: "Type",
    columnStatus: "Status",
    columnSize: "Size",
    columnParty: "Party",
    columnPhase: "State",
    columnTracker: "Tracker",
    columnKey: "Key",
    columnOrigin: "Origin",
    columnLevel: "Level",
    columnMessage: "Message",
    columnValue: "Value",
    beforeConsent: "Before consent",
    firstParty: "First-party",
    thirdParty: "Third-party",
    valueRedacted: "Redacted",
    valueLength: "length",
    export: "Export",
    exportJson: "Export JSON",
    exportCsv: "Export CSV",
    exportNote:
      "Exports the rows matching the filters above. Exports are recorded in the audit log.",
    noScans: "No scans yet",
    noScansBody:
      "Evidence appears here once this website has been scanned at least once.",
    emptyTitle: "Nothing recorded",
    emptyBody: "No rows match these filters on this scan.",
    /** §10.6 — the reason values are absent, said out loud. */
    minimisationNote:
      "Query values, cookie values and header values are stripped before storage. What you see is everything we kept.",
    screenshotAlt: "Screenshot",
  },

  /** §3.11 — Settings → Scan Settings, Phase 4 task 4.9. */
  scanSettings: {
    title: "Scanning",
    subtitle: "Defaults applied to new websites, and settings that apply to every scan.",
    defaultsTitle: "Defaults for new websites",
    defaultsBody: "Changing these does not alter websites you have already added.",
    frequency: "Default frequency",
    pageLimit: "Pages per scan",
    pageLimitHelp: "How many pages of each website we load. Higher plans allow more.",
    priority: "Default priority",
    behaviourTitle: "How scans behave",
    screenshotPolicy: "Screenshots",
    screenshotAlways: "Every scan",
    screenshotOnChange: "Only when something changed",
    screenshotNever: "Never",
    screenshotHelp:
      "Screenshots corroborate a finding. They are the largest thing we store, so most agencies keep them on change only.",
    respectRobots: "Respect robots.txt",
    respectRobotsHelp:
      "When a website's robots.txt disallows our scanner, skip it rather than scanning anyway. Leave this on unless you control the site and have decided otherwise.",
    userAgentSuffix: "User-agent suffix",
    userAgentSuffixHelp:
      "Appended to our scanner's user agent, so your client's logs and firewall rules can identify us.",
    retentionTitle: "Evidence retention",
    retentionLabel: "Keep evidence for",
    retentionDays: "days",
    retentionPlanDefault: "Use my plan's limit",
    retentionHelp:
      "A shorter period than your plan allows. Evidence attached to an open finding is always kept until that finding closes.",
    ignoredTitle: "Ignored domains",
    ignoredHelp:
      "Domains excluded from third-party classification — your own CDN, for example. One per line. Requests to them are still recorded.",
    save: "Save settings",
    saving: "Saving",
    saved: "Settings saved.",
  },

  audit: {
    title: "Audit log",
    columnAction: "Action",
    columnEntity: "Type",
    columnActor: "Who",
    columnWhen: "When",
    system: "System",
    older: "Older entries",
    endOfLog: "End of the log",
    filterAction: "Action",
    filterEntity: "Entity",
    filterActor: "Who",
    exportCsv: "Export CSV",
    exportNote: "Exports the rows matching the filters above, newest first.",
    anyAction: "Any action",
    anyEntity: "Any entity",
  },

  bulk: {
    selectPage: "Select all on this page",
    selectRow: "Select row",
    selected: "selected",
    updated: "updated",
    /** Surfaced, never swallowed — see the note in bulk-selection.tsx. */
    skipped: "skipped (out of your scope)",
    archiveConfirm: "Archive these websites?",
    scanNow: "Scan now",
    queued: "queued",
    moveToGroup: "Move to group",
    assignToClient: "Assign to client",
    groupPlaceholder: "Group name",
    apply: "Apply",
    newGroupHint: "Type a name to create a new group.",
  },

  /** §5.5 — CSV import. Preview before write, always. */
  import: {
    title: "Import websites",
    dropZone: "Choose a CSV file",
    dropHint: "One website per row. A 'url' column is required.",
    downloadTemplate: "Download template",
    tooLarge: "That file is too large. Split it into smaller batches.",
    ready: "ready",
    warnings: "warnings",
    errors: "errors",
    columnLine: "Row",
    columnUrl: "Address",
    columnClient: "Client",
    columnStatus: "Status",
    statusReady: "Ready",
    statusDuplicate: "Duplicate — skipped",
    statusInvalid: "Cannot import",
    statusClientNew: "Client will be created",
    importButton: "Import",
    importing: "Importing",
    /** The result is reported per outcome — nothing is silently dropped. */
    imported: "imported",
    skippedRows: "skipped",
    failedRows: "failed",
    noRows: "No rows found in that file.",
  },

  filters: {
    apply: "Apply",
    any: "Any",
    all: "All",
  },

  clients: {
    addClient: "Add client",
    saving: "Adding client",
    contactTitle: "Contact",
    contactNameLabel: "Contact name",
    notesLabel: "Internal notes",
    addedLabel: "Client added",
    portalOn: "Portal enabled",
    /** Archiving keeps history — the notice says so, because the word alarms people. */
    archivedNotice:
      "This client is archived. Its websites keep their scan history and its reports stay available.",
    nameLabel: "Client name",
    namePlaceholder: "Acme Dental",
    contactEmailLabel: "Contact email (optional)",
    contactEmailPlaceholder: "hello@acme-dental.co.uk",
    averageHealth: "Avg health",
    columnClient: "Client",
    columnOpenIssues: "Open issues",
    columnPortal: "Portal",
    columnWebsites: "Websites",
    portalEnabled: "Enabled",
    portalOff: "Off",
    searchPlaceholder: "Search clients",
    /** Archiving is reversible and is not deletion — the filter says so. */
    archived: "Archived",
    archivedHidden: "Hidden",
    archivedShown: "Shown",
    title: "Clients",
  },

  websites: {
    addWebsite: "Add website",
    columnDrift: "Drift",
    columnFrequency: "Frequency",
    columnHealth: "Health",
    columnLastScan: "Last scan",
    columnMonitoring: "Monitoring",
    columnOpenIssues: "Open potential issues",
    columnWebsite: "Website",
    filterClient: "Client",
    filterHealth: "Health",
    filterStatus: "Status",
    importCsv: "Import CSV",
    neverScanned: "Never scanned",
    pause: "Pause monitoring",
    resume: "Resume monitoring",
    archive: "Archive",
    archiving: "Archiving",
    archiveConfirmTitle: "Archive this website?",
    /** Names what SURVIVES. The fear the word "archive" triggers is data loss. */
    archiveConfirmBody:
      "Monitoring stops and the website leaves your list. Scan history, evidence and reports are kept, and you can restore it later.",
    archivedNotice:
      "This website is archived. Monitoring is stopped, and its scan history is kept.",
    settingsTitle: "Monitoring settings",
    originalUrlLabel: "Address as entered",
    /** Names the unlabelled count chip beside the critical badge. */
    otherIssuesLabel: "other potential issues",
    registrableDomainLabel: "Registrable domain",
    monitoredPathsLabel: "Monitored paths",
    nextScanLabel: "Next check",
    notScheduled: "Not scheduled",
    addedLabel: "Added",
    scanHistoryTitle: "Scan history",
    searchPlaceholder: "Search by address or label",
    title: "Websites",
    viewTable: "Table",
    viewGrid: "Grid",
    viewToggle: "View as",
    filterGroup: "Group",
    anyClient: "Any client",
    anyGroup: "Any group",
    noGroup: "No group",
    exportCsv: "Export CSV",
    scannedRelative: "Scanned",
  },

  /** §3.6 — the Add Website wizard. */
  addWebsite: {
    back: "Back",
    continueToSchedule: "Continue to schedule",
    stepConfirm: "Confirm",
    stepSchedule: "Schedule",
    stepUrl: "Website address",
    stepValidation: "Validation",
    title: "Add website",
    urlLabel: "Website address",
    urlPlaceholder: "https://www.example.com",
    validate: "Check this address",
    checkAddress: "Address",
    checkConnection: "Connection",
    checkConsentBanner: "Consent banner",
    checkRobots: "robots.txt",
    checking: "Checking this address",
    reachable: "Reachable",
    frequencyLabel: "How often to check",
    clientLabel: "Client",
    noClient: "No client",
    labelLabel: "Label (optional)",
    labelPlaceholder: "Main site, EU storefront…",
    /** MANUAL means nextScanAt stays null — §7.5. Say so rather than implying monitoring. */
    manualNote:
      "Manual means this website is only checked when you start a scan yourself.",
    submit: "Add website",
    saving: "Adding website",
    wwwNoticeTitle: "www is kept.",
    wwwNoticeBody:
      "A www address and its apex can serve different tags, so they are monitored as separate websites.",
  },

  /** §6.4 — one distinct message per validation failure code. */
  urlError: {
    duplicate: "You're already monitoring this address.",
    entitlementExceeded:
      "You've reached the website limit on your plan. Upgrade to add more.",
    hasCredentials:
      "Remove the username and password from the address before adding it.",
    invalid:
      "Enter a full web address, including https:// — for example https://www.example.com",
    noRegistrableDomain: "Enter a public web address with a domain name.",
    /** Deliberately vague — never reveal which check failed (§10.3). */
    notAllowed: "We can't monitor this address.",
    unreachable:
      "The site didn't respond. Check the address, or try again in a few minutes.",
    unsupportedScheme: "Enter an address starting with https:// or http://",
  },

  /** §4.3, §3.9 — scan surfaces. The four consent journeys. */
  scan: {
    analysis: "Analysis",
    analysisDetail:
      "Classification, drift comparison and scoring run after recording ends.",
    cancel: "Cancel scan",
    compare: "Compare with previous scan",
    consoleTab: "Console",
    cookiesTab: "Cookies",
    elapsed: "elapsed",
    journeyAcceptAll: "Accept All",
    journeyNoConsent: "No consent",
    journeyRejectAll: "Reject All",
    journeyWithdraw: "Withdraw consent",
    phasesTitle: "Consent journeys",
    queued: "Queued and picked up",
    rerun: "Re-run scan",
    requestsTab: "Requests",
    screenshotsTab: "Screenshots",
    storageTab: "Storage",
    waiting: "Waiting",
    /** P6 — an incomplete scan never renders a clean verdict. */
    partialTitle: "Some consent journeys could not be completed",
    partialBody:
      "Results below cover only the journeys that ran. Anything specific to a journey that did not run could not be determined in this scan.",
    columnConsentState: "Consent state",
    columnFlag: "Flag",
    columnRequest: "Request",
    columnTime: "Time",
    columnType: "Type",
    columnVendor: "Vendor",
    stateBeforeConsent: "Before consent",
    stateFirstParty: "First-party",
  },

  /** Scan and phase outcome words. Never pass/fail (§1.12). */
  scanStatus: {
    queued: "Queued",
    running: "Running",
    completed: "Completed",
    partial: "Partial",
    failed: "Failed",
    cancelled: "Cancelled",
  },

  severity: {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
  },

  monitoring: {
    active: "Active",
    paused: "Paused",
    error: "Needs attention",
  },

  frequency: {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    manual: "Manual",
  },

  onboarding: {
    body:
      "Your account isn't attached to an agency yet. Create one to start adding client websites.",
    title: "Set up your agency",
    welcome: "You're set up",
    checklistBody:
      "Three things left. You can do them now or explore first — the app works with nothing in it.",
    stepAgency: "Agency created",
    stepClient: "Add a client",
    stepClientBody:
      "Optional. Clients group websites for reporting and portal access.",
    stepWebsite: "Add your first website",
    stepWebsiteBody:
      "We'll check it in a real browser across all four consent journeys.",
    stepScan: "First scan",
    /** Not an action: adding the website is what queues it. */
    stepScanBody:
      "Runs automatically once a website is added. It usually takes a couple of minutes.",
    skip: "Skip for now",
  },

  pagination: {
    next: "Next page",
    previous: "Previous page",
    showing: "Showing",
  },

  a11y: {
    loading: "Loading",
    mainNavigation: "Main navigation",
    secondaryNavigation: "Secondary navigation",
    /** Landmark for the trail back up from a detail page. */
    breadcrumb: "Breadcrumb",
    /** Severity is never colour alone — the icon carries a label too (§11.6). */
    severityLabel: "Severity",
    sortBy: "Sort by",
  },

  /* ───────────────────────────── Phase 4 ───────────────────────────── */

  /** §3.11 — the notification centre and the header bell. */
  notifications: {
    title: "Notifications",
    subtitle: "Everything we've told you about, newest first.",
    tabUnread: "Unread",
    tabAll: "All",
    markAllRead: "Mark all read",
    marking: "Marking",
    filterType: "Type",
    allTypes: "All types",
    loadMore: "Load more",
    bellLabel: "Notifications",
    viewAll: "View all notifications",
    emptyUnreadTitle: "You're up to date",
    emptyUnreadBody:
      "Nothing new since you last looked. We'll tell you the moment something changes on a monitored website.",
    emptyAllTitle: "No notifications yet",
    emptyAllBody:
      "Once monitoring finds something worth telling you about, it appears here and in your inbox.",
  },

  /** §3.11 — alert rules and history. */
  alerts: {
    title: "Alerts",
    subtitle: "Decide what we tell you about, and when.",
    tabRules: "Rules",
    tabHistory: "History",
    createRule: "Create rule",
    editRule: "Edit rule",
    columnRule: "Rule",
    columnScope: "Scope",
    columnChannels: "Channels",
    columnSchedule: "Schedule",
    columnThreshold: "Threshold",
    columnQuietHours: "Quiet hours",
    columnEnabled: "Enabled",
    columnType: "Type",
    columnTrigger: "Trigger",
    columnRecipients: "Recipients",
    columnSentAt: "Sent",
    columnDelivery: "Delivery",
    nameLabel: "Rule name",
    namePlaceholder: "Critical findings, all sites",
    scopeLabel: "Applies to",
    scopeAll: "All websites",
    scopeGroup: "A website group",
    scopeClient: "One client",
    scopeWebsite: "One website",
    scopeTargetLabel: "Which one",
    triggerTypesLabel: "Alert me about",
    minSeverityLabel: "Minimum severity",
    channelsLabel: "Send by",
    channelEmail: "Email",
    channelInApp: "In-app",
    scheduleLabel: "When to send",
    scheduleImmediate: "Immediately",
    scheduleDaily: "Daily digest",
    scheduleWeekly: "Weekly digest",
    scheduleNever: "Never",
    quietHoursLabel: "Quiet hours",
    quietHoursHelp:
      "Alerts inside this window are held and delivered when it ends. Nothing is discarded.",
    quietHoursStart: "From",
    quietHoursEnd: "Until",
    quietHoursTimezoneNote: "Times are in your agency's timezone.",
    criticalOverrideLabel: "Let critical alerts through quiet hours",
    criticalOverrideHelp:
      "A consent change at 2 a.m. is usually what you want to know about. Turn this off to hold everything.",
    recipientsLabel: "Also send to",
    recipientsHelp: "Extra addresses outside your team. One per line.",
    enabledLabel: "Rule is active",
    save: "Save rule",
    saving: "Saving",
    delete: "Delete rule",
    deleteConfirm: "Delete this rule? Alerts it covers will stop being sent.",
    emptyRulesTitle: "No alert rules yet",
    emptyRulesBody:
      "Without a rule, monitoring runs but nobody is told. Create one to choose what reaches your inbox.",
    emptyHistoryTitle: "Nothing sent yet",
    emptyHistoryBody:
      "Every alert we send is recorded here with its delivery status, so you can prove a client was told.",
    statusSent: "Sent",
    statusDelivered: "Delivered",
    statusOpened: "Opened",
    statusBounced: "Bounced",
    statusFailed: "Failed",
    statusSimulated: "Simulated",
    statusDeferred: "Held for quiet hours",
    statusSuppressed: "Suppressed as a duplicate",
    statusQueued: "Queued",
    typeTransactional: "Notification",
    noQuietHours: "None",
    floodNote:
      "Repeats of the same alert are suppressed for four hours so one changing website cannot flood your inbox.",
  },

  /** §3.11 — the report library, wizard and detail. */
  reports: {
    title: "Reports",
    subtitle: "Branded documents you can send to a client.",
    generate: "Generate report",
    columnReport: "Report",
    columnType: "Type",
    columnScope: "Scope",
    columnPeriod: "Period",
    columnGenerated: "Generated",
    columnGeneratedBy: "Generated by",
    columnStatus: "Status",
    columnSize: "Size",
    download: "Download PDF",
    view: "View",
    regenerate: "Regenerate",
    shareLink: "Share link",
    deleteReport: "Delete",
    deleteConfirm: "Delete this report? The PDF stops being downloadable.",
    statusQueued: "Queued",
    statusGenerating: "Generating",
    statusReady: "Ready",
    statusFailed: "Failed",
    emptyTitle: "No reports yet",
    emptyBody:
      "Generate a branded PDF of what monitoring found, ready to send to your client.",
    /** §12.3 requires this exact reassurance on a failure. */
    failed: "We couldn't generate this report. Nothing was charged against your report allowance.",
    generatingBody: "This usually takes under a minute. We'll notify you when it's ready.",
    queuedBody: "Waiting for a renderer. We'll notify you when it's ready.",
    previewLabel: "Preview",
    previewUnavailable: "The preview appears once the report has finished generating.",
    metadata: "Report details",
    sharedLinks: "Shared links",
    shareExpires: "Expires",
    shareRevoke: "Revoke",
    shareCreated: "Share link created. Copy it now — it is not shown again.",
    shareHelp: "Anyone with the link can download this report until it expires.",
    shareExpiryLabel: "Link expires after",
    shareDays: "days",
    downloads: "Downloads",
    noPeriod: "Point in time",
    scopeAgency: "Whole portfolio",
    scopeClient: "Client",
    scopeWebsite: "Website",

    wizardTitle: "Generate a report",
    stepType: "Type",
    stepScope: "Scope",
    stepPeriod: "Period",
    stepOptions: "Options",
    typeScanBody: "Everything one scan recorded, in full technical detail.",
    typeIssueBody: "Selected findings with their evidence — for sending to a developer.",
    typeMonthlyBody: "The flagship monthly deliverable: activity, trend, findings and changes.",
    typeHealthBody: "One website's current score, findings, trackers and consent status.",
    typeDriftBody: "Everything that changed over a period, before and after.",
    nameLabel: "Report name",
    namePlaceholder: "March monitoring report",
    clientLabel: "Client",
    websiteLabel: "Website",
    scanLabel: "Scan",
    periodStart: "From",
    periodEnd: "To",
    optionEvidence: "Include evidence appendix",
    optionAi: "Include AI summary",
    optionResolved: "Include resolved findings",
    optionScreenshots: "Include screenshots",
    brandingPreview: "Branding preview",
    brandingPreviewNote: "This is how the cover will look.",
    submit: "Generate",
    submitting: "Starting",
    allClients: "All clients",
    allWebsites: "All websites",
  },

  /** §3.11 — white-label settings. */
  branding: {
    title: "Branding",
    subtitle: "Applied to reports, the client portal and client-facing email.",
    notEntitledTitle: "White-label is not on your plan",
    notEntitledBody:
      "Reports and the client portal currently carry our brand. Upgrade to use your own.",
    logoLight: "Logo (light background)",
    logoDark: "Logo (dark background)",
    logoHelp: "PNG or SVG, at least 240px wide. Falls back to your company name.",
    logoUrlLabel: "Logo URL",
    primaryColor: "Primary colour",
    accentColor: "Accent colour",
    contrastPasses: "Contrast passes AA",
    contrastFails: "Contrast is too low",
    contrastAgainst: "against",
    contrastHelp:
      "Checked at save time against white and our neutral surface, so a report is readable in print.",
    companyName: "Company name",
    contactEmail: "Contact email",
    contactPhone: "Contact phone",
    reportFooter: "Report footer text",
    customDisclaimer: "Additional disclaimer",
    customDisclaimerHelp:
      "Added after our standard note. Our note always appears — it cannot be replaced.",
    portalWelcome: "Portal welcome message",
    portalLink: "Client portal address",
    portalLinkHelp: "Path-based for now. Custom domains are not available yet.",
    livePreview: "Live preview",
    previewReportCover: "Report cover",
    previewPortalHeader: "Portal header",
    save: "Save changes",
    saving: "Saving",
    discard: "Discard",
    saved: "Branding saved.",
    baseDisclaimerLabel: "Our standard note",
  },

  /** §3.13 — the client portal. Deliberately plain language. */
  portal: {
    signIn: "Sign in",
    signInTitle: "Sign in to your monitoring dashboard",
    signInBody:
      "Enter your email address and we'll send you a link. No password to remember.",
    emailLabel: "Email address",
    sendLink: "Email me a link",
    sending: "Sending",
    /** Always the same answer, whether or not the address is known (§6.10). */
    linkSent:
      "If that address has access, we've sent a sign-in link. It expires in 15 minutes.",
    linkInvalid:
      "That link can't be used. It may have expired or already been used — request a new one.",
    signOut: "Sign out",
    overviewTitle: "Your website is being monitored",
    monitoredDaily: "Monitored daily",
    monitoredWeekly: "Monitored weekly",
    monitoredMonthly: "Monitored monthly",
    lastChecked: "last checked",
    neverChecked: "not yet checked",
    scoreLabel: "Privacy health score",
    scoreUnavailable: "We could not determine a score yet.",
    scoreExcellent: "Nothing needs your attention right now.",
    scoreGood: "A few things are worth a look, but nothing urgent.",
    scoreFair: "Several things are worth reviewing with whoever manages your site.",
    scorePoor: "A number of things need attention. Your agency has the detail.",
    scoreVeryLow: "Several things need attention soon. Your agency has the detail.",
    itemsTitle: "Items needing attention",
    itemsEmpty: "Nothing needs your attention right now.",
    changesTitle: "Recent changes",
    changesEmpty: "Nothing has changed since the last check.",
    reportTitle: "Latest report",
    reportsTitle: "Your reports",
    reportsEmpty: "No reports have been shared with you yet.",
    downloadReport: "Download",
    issuesTitle: "Items to review",
    issuesEmpty: "There's nothing to review right now.",
    scansTitle: "Monitoring history",
    scansEmpty: "No checks have run yet.",
    scanCheckedOk: "Checked successfully",
    scanCheckedPartial: "Partially checked",
    scanCheckFailed: "Could not be checked",
    settingsTitle: "Your details",
    settingsName: "Your name",
    settingsNotifyReports: "Email me when a new report is ready",
    settingsNotifyCritical: "Email me about anything urgent",
    settingsSave: "Save",
    settingsSaved: "Saved.",
    /** Plain words, never the internal severity enum (§3.13). */
    severityNeedsAttention: "Needs attention",
    severityWorthReviewing: "Worth reviewing",
    severityInformational: "Informational",
    statusOpen: "Open",
    statusInProgress: "Being worked on",
    statusResolved: "Resolved",
    detectedOn: "Detected on",
    poweredBy: "Monitoring by",
    navOverview: "Overview",
    navIssues: "Items",
    navReports: "Reports",
    navScans: "History",
    navSettings: "Settings",
  },

  /** Agency-side management of portal contacts. */
  portalAdmin: {
    title: "Client portal access",
    subtitle: "People at the client who can see monitoring status.",
    invite: "Invite a contact",
    inviting: "Sending",
    emailLabel: "Email address",
    nameLabel: "Name",
    columnContact: "Contact",
    columnStatus: "Status",
    columnLastLogin: "Last signed in",
    statusInvited: "Invited",
    statusActive: "Active",
    statusRevoked: "Revoked",
    resend: "Resend link",
    revoke: "Revoke access",
    revokeConfirm:
      "Revoke access? They are signed out immediately and the link stops working.",
    revoked: "Access revoked.",
    invited: "Invitation sent.",
    emptyTitle: "No portal contacts yet",
    emptyBody:
      "Invite someone at the client to see monitoring status, current items and reports.",
    neverSignedIn: "Never",
    portalDisabled: "Turn the portal on for this client before inviting contacts.",
  },

  /** §3.11 — per-type notification preferences. */
  notificationSettings: {
    title: "Notifications",
    subtitle: "Choose what reaches you, and how.",
    columnType: "Alert type",
    columnInApp: "In-app",
    columnEmail: "Email",
    columnDigest: "Frequency",
    save: "Save preferences",
    saved: "Preferences saved.",
    digestNote:
      "In-app notifications always arrive immediately. The frequency applies to email.",
  },

  /** Enum labels used by both the app and the report renderer. */
  notificationType: {
    criticalIssue: "Critical finding",
    newTracker: "New tracker",
    consentRegression: "Consent change",
    privacyDrift: "Privacy drift",
    scanFailed: "Scan failed",
    scanPartial: "Scan partially completed",
    websiteUnreachable: "Website unreachable",
    reportReady: "Report ready",
    reportFailed: "Report failed",
    memberJoined: "Member joined",
    trialEnding: "Trial ending",
    paymentFailed: "Payment failed",
    planChanged: "Plan changed",
    aiQuotaWarning: "AI credits low",
    usageLimitWarning: "Approaching a limit",
  },

  reportType: {
    scan: "Scan",
    issue: "Findings",
    monthlyMonitoring: "Monthly monitoring",
    websiteHealth: "Website health",
    privacyDrift: "Privacy drift",
  },

  digestFrequency: {
    immediate: "Immediately",
    daily: "Daily",
    weekly: "Weekly",
    never: "Never",
  },

  issueCategory: {
    preConsentTracking: "Tracking before consent",
    consentFailure: "Consent not respected",
    consentMissing: "No consent mechanism",
    cookieBehavior: "Cookie behaviour",
    newTracker: "New tracker",
    unknownVendor: "Unknown third party",
    drift: "Change detected",
    scanHealth: "Scan health",
    transportSecurity: "Transport security",
    usCcpa: "US CCPA / GPC",
    ftcCompliance: "FTC disclosure",
    cipaWiretap: "Session replay / Wiretap",
    cloaking: "CNAME cloaking",
    storage: "Persistent storage",
    transport: "Cross-border transport",
    cmpHygiene: "Banner hygiene",
    interaction: "Interactive tracking",
    tagManager: "Tag governance",
    fingerprint: "Browser fingerprinting",
    performance: "Script weight",
    security: "Insecure transport",
    policy: "Policy governance",
    euGermany: "Germany (TDDDG)",
    euFrance: "France (CNIL)",
    euItaly: "Italy (Garante)",
    ukPecr: "UK (PECR / ICO)",
  },

  trackerCategory: {
    necessary: "Necessary",
    analytics: "Analytics",
    marketing: "Marketing",
    advertising: "Advertising",
    functional: "Functional",
    social: "Social media",
    unknown: "Unknown",
  },

  riskLevel: {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  },
} as const;

export type Copy = typeof en;

/** Dot-separated key paths into the dictionary, e.g. `"nav.pricing"`. */
export type CopyKey = Paths<Copy>;

/**
 * Every leaf path as a dot-separated literal, e.g. `"empty.noWebsites"`.
 * The `& string` on the recursive call is what lets it sit inside a template
 * literal type — without it TS cannot prove the recursion produces a string.
 */
type Paths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${Paths<T[K]> & string}`;
    }[keyof T & string];
