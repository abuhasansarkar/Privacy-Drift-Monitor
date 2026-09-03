/**
 * HOMEPAGE CONTENT — structured TypeScript in `content/` for the same two
 * reasons as `content/blog`: no string literals in JSX, and
 * `scripts/check-terminology.ts` walks this directory, so a banned claim in a
 * homepage headline fails CI instead of shipping.
 *
 * ⚠️ ALL SAMPLE DATA IN THIS FILE IS ILLUSTRATIVE. Every component that
 * renders it must also render its `demoLabel` ("Illustrative data"), because a
 * fabricated-looking live feed on a monitoring product's own homepage is the
 * same lie as a fabricated testimonial — just cheaper to catch.
 *
 * ⚠️ THE COPY DESCRIBES OBSERVED BEHAVIOR. Where the punchy phrasing would be
 * a legal conclusion, the copy stops at what a browser recorded and who
 * should review it. That restraint is a design decision, not timidity.
 */

export const HERO = {
  eyebrow: "Continuous privacy monitoring for agencies",
  title: "Find tracking changes before your clients do",
  subtitle:
    "Privacy Drift Monitor loads every client website in a real browser, tests each consent journey, and tells you the day its privacy behavior changes — with the technical evidence to fix it.",
  secondaryCta: { href: "/how-it-works", label: "See how it works" },
  placeholder: "https://clientwebsite.com",
  scanButton: "Scan website",
  formNote: "Free scan · no account needed · result in about two minutes",
} as const;

export const PROBLEM = {
  eyebrow: "The problem",
  heading: "Your clients' websites change after launch. Their privacy behavior changes too.",
  intro:
    "Nobody decides to break a consent configuration. It happens in the ordinary course of running a website — and it happens quietly.",
  chain: [
    "The website launches, clean and audited",
    "Marketing adds a GTM tag for a campaign",
    "A plugin update ships a new third-party script",
    "A new pixel appears on the landing page",
    "The consent banner no longer covers it",
    "Nobody notices",
  ],
  cards: [
    {
      title: "The audit went stale",
      body: "A one-off audit is a photograph of one afternoon. Every tag added, plugin updated or template changed since is invisible — the site looks exactly the same from the outside.",
    },
    {
      title: "The tools watch servers, not behavior",
      body: "Uptime and error monitors check that pages load. None of them ask what loaded alongside the page, or whether a consent state allowed it.",
    },
    {
      title: "The client finds out first",
      body: "When the question arrives — usually from the client's privacy advisor, not the client — the answer starts with an investigation you have to run by hand, weeks after the change.",
    },
  ],
} as const;

/** Snapshot tools vs continuous monitoring — categories, never named competitors. */
export const COMPARISON = {
  eyebrow: "Why one-off scans miss this",
  heading: "A snapshot tells you what a site did. Monitoring tells you what changed.",
  snapshot: {
    title: "One-off scan",
    steps: ["Run a scan", "List cookies found", "Produce a PDF", "Go out of date immediately"],
  },
  monitor: {
    title: "Privacy Drift Monitor",
    steps: [
      "Real browser, every consent journey",
      "Network, cookie and storage evidence recorded",
      "Baseline kept per website",
      "Every scan diffed against the last",
      "Drift becomes a dated alert with evidence",
    ],
  },
  rows: [
    { from: "A cookie list", to: "Consent-state evidence" },
    { from: "A single point in time", to: "A monitored baseline" },
    { from: "A generic audit report", to: "Portfolio-wide agency workflow" },
    { from: "Raw logs to interpret", to: "Evidence, explained, with a fix to review" },
  ],
} as const;
export const PIPELINE = {
  eyebrow: "How it works",
  heading: "Real browser testing, four consent journeys, one evidence trail",
  intro:
    "Every scan is the same six stages, on every website, on a schedule. The order matters: consent is tested before anything is classified, and comparison happens only after the evidence is recorded.",
  steps: [
    { title: "Website ingested", body: "The site joins your portfolio with a scan schedule and jurisdiction profile." },
    { title: "Browser journey", body: "An isolated Chromium loads the site and walks four consent states." },
    { title: "Evidence captured", body: "Every request, cookie and storage write is recorded with its consent state." },
    { title: "Deterministic analysis", body: "Rule-based classification — not an LLM — decides what was observed." },
    { title: "Drift comparison", body: "The scan is diffed against the site's previous scan." },
    { title: "Alerts and reports", body: "Changes become alerts; the month becomes a white-label report." },
  ],
} as const;

export const DRIFT = {
  eyebrow: "Privacy Drift",
  heading: "We don't just scan your sites. We remember how they behaved.",
  intro:
    "Each scan is compared with the last one that succeeded. A new tracker, a request that started firing before consent, a cookie that stopped being removed — each becomes a dated event on the site's timeline, with the recorded evidence attached.",
  demoLabel: "Illustrative timeline — demo data",
  events: [
    { date: "1 Aug", status: "healthy" as const, title: "Scan completed", detail: "No changes from baseline." },
    { date: "8 Aug", status: "healthy" as const, title: "Scan completed", detail: "No changes from baseline." },
    {
      date: "15 Aug",
      status: "new" as const,
      title: "Meta Pixel observed",
      detail: "New tracker on the landing page template.",
    },
    {
      date: "15 Aug",
      status: "finding" as const,
      title: "Pre-consent request detected",
      detail: "connect.facebook.net fired before any consent state.",
    },
    {
      date: "17 Aug",
      status: "resolved" as const,
      title: "Fix verified",
      detail: "Trigger moved behind the consent check; no longer observed.",
    },
  ],
} as const;

/** Data for the interactive consent-journey demo on the homepage. */
export interface JourneyDemo {
  key: string;
  label: string;
  description: string;
  requests: ReadonlyArray<{ domain: string; category: string; state: string }>;
  cookies: ReadonlyArray<{ name: string; category: string; note: string }>;
  finding: string | null;
}

export const CONSENT_JOURNEYS = {
  eyebrow: "Consent journeys",
  heading: "One scan. Four consent states. Every request accounted for.",
  intro:
    "A banner that renders is not a banner that works. The scanner walks the journeys a real visitor takes and records what each one actually loads.",
  demoLabel: "Illustrative data — one website, one scan",
  selectLabel: "Choose a consent journey",
  journeys: [
    {
      key: "no-consent",
      label: "No consent",
      description:
        "The page loads and the visitor touches nothing. Marketing tags have no permission to fire.",
      requests: [
        { domain: "clientwebsite.com", category: "First party", state: "Observed" },
        { domain: "connect.facebook.net", category: "Marketing", state: "Observed before consent" },
      ],
      cookies: [{ name: "essential_sid", category: "Essential", note: "Set — permitted" }],
      finding:
        "Potential issue: a marketing request was observed before any consent state existed.",
    },
    {
      key: "reject-all",
      label: "Reject all",
      description:
        "The visitor declines everything. Non-essential tags should not load and marketing cookies should not be set.",
      requests: [
        { domain: "clientwebsite.com", category: "First party", state: "Observed" },
        { domain: "connect.facebook.net", category: "Marketing", state: "Still observed" },
      ],
      cookies: [{ name: "essential_sid", category: "Essential", note: "Set — permitted" }],
      finding: "Potential issue: a marketing request was still observed after Reject All.",
    },
    {
      key: "accept-all",
      label: "Accept all",
      description:
        "The visitor accepts everything. Analytics and marketing tags are now permitted to load.",
      requests: [
        { domain: "clientwebsite.com", category: "First party", state: "Observed" },
        { domain: "connect.facebook.net", category: "Marketing", state: "Observed — consent given" },
        { domain: "www.google-analytics.com", category: "Analytics", state: "Observed — consent given" },
      ],
      cookies: [
        { name: "essential_sid", category: "Essential", note: "Set — permitted" },
        { name: "_fbp", category: "Marketing", note: "Set after consent" },
        { name: "_ga", category: "Analytics", note: "Set after consent" },
      ],
      finding: null,
    },
    {
      key: "withdraw",
      label: "Withdraw",
      description:
        "The visitor changes their mind. Previously permitted tags should stop and their cookies should be removed.",
      requests: [
        { domain: "clientwebsite.com", category: "First party", state: "Observed" },
        { domain: "connect.facebook.net", category: "Marketing", state: "No longer observed" },
      ],
      cookies: [
        { name: "essential_sid", category: "Essential", note: "Set — permitted" },
        { name: "_fbp", category: "Marketing", note: "Removed on withdrawal" },
      ],
      finding: null,
    },
  ] as readonly JourneyDemo[],
} as const;
export const EVIDENCE = {
  eyebrow: "Technical proof",
  heading: "Every finding traces back to a recorded event",
  intro:
    "Findings are not scores out of thin air. Each one references the evidence rows behind it — the request, the consent state it fired under, the second it happened.",
  demoLabel: "Illustrative data — demo scan",
  cards: [
    {
      kind: "Network event",
      rows: [
        ["Request", "connect.facebook.net"],
        ["Consent state", "Not given"],
        ["Journey", "NO_CONSENT"],
        ["Observed at", "1.82 s"],
      ],
    },
    {
      kind: "Cookie",
      rows: [
        ["Name", "_fbp"],
        ["Category", "Marketing"],
        ["State", "Set before consent"],
        ["Lifetime", "90 days"],
      ],
    },
    {
      kind: "Drift",
      rows: [
        ["Previous scan (8 Aug)", "Meta Pixel not observed"],
        ["Current scan (15 Aug)", "Meta Pixel observed"],
        ["Change", "New tracker on /landing"],
        ["Evidence", "3 network events · 1 cookie write"],
      ],
    },
  ],
} as const;

export const AI = {
  eyebrow: "AI that explains evidence",
  heading: "Understand what changed and what your developer should check next",
  intro:
    "The scanner records the facts; the AI explains them. Every explanation is grounded in recorded evidence — if the reference cannot be resolved, the output is rejected before it reaches you.",
  steps: [
    "Technical evidence recorded",
    "Deterministic finding",
    "AI explanation",
    "Recommended fix",
    "Developer task",
    "Client message",
  ],
  demoLabel: "Illustrative output — demo issue",
  example: {
    title: "Potential issue detected",
    body: "Meta Pixel observed before marketing consent.",
    why: "The tag appears to load before the consent state allows marketing tracking. It was observed on the /landing template in the NO_CONSENT journey at 1.82 s.",
    action: "Review the GTM consent trigger for the Meta tag.",
    buttons: ["Generate developer task", "Generate client message"],
  },
} as const;

export const AGENCY = {
  eyebrow: "For agencies",
  heading: "Built around the way agencies work",
  intro:
    "One portfolio, many clients, dozens of websites. Monitoring runs across all of it, and every level of the hierarchy — agency, client, website, scan, finding — is where the product already lives.",
  steps: [
    { title: "Your agency", body: "Team seats, roles, and one portfolio view." },
    { title: "Clients", body: "Each client gets a rollup and their own portal access." },
    { title: "Websites", body: "Every domain with its own schedule and baseline." },
    { title: "Scans", body: "Scheduled, journey-tested, evidence-recorded." },
    { title: "Findings", body: "Triage queue with severity and evidence." },
    { title: "Reports", body: "White-label PDFs and monthly digests." },
    { title: "Care plans", body: "Package monitoring into recurring client services." },
  ],
  revenueCopy:
    "Ongoing technical privacy monitoring is a natural fit for an existing website care plan: a monthly report, a health score, and a clear answer when a client asks what changed. You set the price with your client — we never make claims about what you can charge.",
} as const;
export const WHITE_LABEL = {
  eyebrow: "White-label reporting",
  heading: "Your branding. Your client relationship.",
  intro:
    "Monthly reports and the client portal carry your name, logo and colours. Clients see a report from their agency — not from a third-party tool they have never heard of.",
  demoLabel: "Illustrative report — demo data",
  report: {
    agency: "ABC Digital",
    subtitle: "Website Privacy Monitoring",
    client: "Example Company",
    health: 92,
    stats: [
      ["Scans this month", "31"],
      ["Potential issues", "1"],
      ["Privacy Drift", "0 unresolved"],
      ["Last scan", "Today"],
    ],
  },
} as const;

export const PORTAL = {
  eyebrow: "Client portal",
  heading: "A client login that answers the only three questions they have",
  intro:
    "Is everything OK, what changed, and where is the report. That is the whole portal — health score, recent changes, and branded PDF reports, with nothing in it that alarms or confuses.",
  demoLabel: "Illustrative portal — demo data",
  stats: [
    ["Health", "92"],
    ["Latest scan", "Today"],
    ["Status", "Healthy"],
    ["Recent changes", "None"],
  ],
  reports: ["August 2026", "July 2026"],
} as const;

export const SECURITY_TEASER = {
  eyebrow: "Security & privacy",
  heading: "Monitoring you can put in front of a client's IT team",
  points: [
    {
      title: "Tenant isolation",
      body: "Every query is scoped to one agency. Evidence, screenshots and reports are never shared across tenants.",
    },
    {
      title: "SSRF-guarded scanner",
      body: "The scanner validates every navigation and every redirect hop against internal address ranges.",
    },
    {
      title: "Encrypted, retained, deleted",
      body: "Evidence is stored encrypted and deleted automatically at the end of the plan's retention window.",
    },
    {
      title: "Audited access",
      body: "Who viewed what, and when, is recorded in an audit log agencies can export.",
    },
  ],
  cta: { href: "/security", label: "Read the security overview" },
} as const;

export const PRICING_PREVIEW = {
  eyebrow: "Pricing",
  heading: "Priced per portfolio, not per seat",
  intro:
    "Four plans from small portfolios to unlimited websites. Monthly or annual, with white-label and the client portal on the plans agencies actually need them on.",
  cta: { href: "/pricing", label: "See full pricing" },
} as const;

export const FINAL_CTA = {
  title: "Your clients' websites change every day.",
  titleAccent: "Know when privacy behavior changes too.",
  body: "Run one free scan now, or start monitoring a whole portfolio in minutes.",
  primary: { href: "/free-scanner", label: "Run your first free scan" },
  secondary: { href: "/pricing", label: "See pricing" },
} as const;