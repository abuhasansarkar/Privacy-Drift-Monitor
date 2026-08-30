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
  audit: {
    title: "Audit log",
    columnAction: "Action",
    columnEntity: "Type",
    columnActor: "Who",
    columnWhen: "When",
    system: "System",
    older: "Older entries",
    endOfLog: "End of the log",
  },

  bulk: {
    selectPage: "Select all on this page",
    selected: "selected",
    updated: "updated",
    /** Surfaced, never swallowed — see the note in bulk-selection.tsx. */
    skipped: "skipped (out of your scope)",
    archiveConfirm: "Archive these websites?",
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
