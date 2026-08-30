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
    websitesUsed: "websites used",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeSystem: "System",
  },

  navApp: {
    clients: "Clients",
    dashboard: "Dashboard",
    issues: "Issues",
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
