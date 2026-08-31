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
    heroTitle:
      "Detect privacy and consent changes across every client website — automatically.",
    heroSubtitle:
      "Privacy Drift Monitor watches your clients' sites in a real browser, tests what happens before consent, after Reject All, and after withdrawal — and tells you the moment something changes.",
    primaryCta: "Start free trial",
    secondaryCta: "Scan a website free",
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
    noDrift:
      "No changes detected since monitoring began. We'll tell you the moment something changes.",
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
    viewScan: "View the scan that recorded this",
    /** §11.8 — AI is additive and absent here; say so rather than leaving a gap. */
    noAiYet: "AI explanation is not available yet.",
    ruleLabel: "Rule",
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
    changes: "Changes",
    scans: "Scans",
    fromScan: "Showing the scan from",
    /** A PARTIAL scan's tabs are incomplete — the reader has to be told. */
    fromPartialScan:
      "Showing an incomplete scan from",
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
    inviteTitle: "Invitations are managed in Clerk",
    inviteBody:
      "Invite people from your organization settings. They appear here once they accept, and you can set their role then.",
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
