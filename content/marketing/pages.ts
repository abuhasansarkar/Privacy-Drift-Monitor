/**
 * TRUST-PAGE CONTENT — `/methodology`, `/security`, `/integrations`, `/bot`.
 *
 * ⚠️ THE SECURITY PAGE DESCRIBES IMPLEMENTED CONTROLS ONLY. Every point below
 * traces to something that exists in this codebase (tenant-scoped data access,
 * the SSRF guard, encrypted evidence storage, audit logging, retention
 * sweeps). An invented certification here would be the worst kind of
 * fabrication — the kind a buyer's security review checks first.
 *
 * ⚠️ WALKED BY THE TERMINOLOGY CHECK, like the rest of `content/marketing`.
 */

export const METHODOLOGY = {
  title: "Methodology",
  subtitle:
    "What a scan does, what it records, how findings are decided, and where the limits are. Written for the evaluator who will read it properly.",
  sections: [
    {
      heading: "What is scanned",
      body: [
        "Each monitored website is scanned on a schedule you set. A scan loads the site in an isolated Chromium browser (via Playwright) and walks four consent journeys in a fixed order: load with no interaction, Reject All, Accept All, and withdraw after accepting.",
        "Where the scan journey includes additional paths — a cart, a checkout, a landing page — those paths are part of the journey configuration for that website.",
      ],
    },
    {
      heading: "What evidence is collected",
      body: [
        "Every network request is recorded with its URL, timing and the consent state that existed when it fired. Every cookie write is recorded with its name, category classification, attributes and the state that allowed it. Storage writes (localStorage and similar) are recorded the same way.",
        "A screenshot is captured per journey. Evidence is immutable once recorded: later analysis interprets it, but nothing downstream of the evidence collector adds facts to it.",
      ],
    },
    {
      heading: "How findings are decided",
      body: [
        "Recorded evidence is evaluated by a deterministic rule engine — versioned rules with stable identifiers, not an LLM. A finding exists because a rule matched recorded events, and every finding links to the evidence rows that triggered it.",
        "AI enters afterwards, as an explanation layer over findings that already exist. Every AI output must reference stored evidence; an output with a reference that cannot be resolved is rejected before it is shown to anyone.",
      ],
    },
    {
      heading: "How Privacy Drift works",
      body: [
        "Each scan is diffed against the previous successful scan for the same website. New trackers, requests that began firing in a journey where they previously did not, cookies that stopped being removed, and consent controls that stopped being detected each become dated drift events on the site's timeline.",
        "Drift is a comparison, not a verdict: it says what changed and when, and attaches the evidence. What the change means for a client is a review decision, not an automated one.",
      ],
    },
    {
      heading: "How the score works",
      body: [
        "The monitoring health score summarises a website's latest successful scan: open findings by severity, consent-journey outcomes, and unresolved drift. A scan that could not complete never produces a score — it is marked PARTIAL and says which phase failed.",
      ],
    },
    {
      heading: "Limitations",
      body: [
        "Automated scanning has technical limits. Bot protection can prevent navigation. Some consent platforms expose no operable control, so a journey's outcome is could-not-be-determined rather than a pass. Highly dynamic or heavily geo-fenced content may behave differently for the scanner than for a person.",
        "The product states what it observed and what it could not determine. It is a technical monitoring service: it does not provide legal advice and does not determine legal compliance.",
      ],
    },
  ],
  cta: { href: "/free-scanner", label: "See a scan run on your site" },
} as const;
export const SECURITY = {
  title: "Security",
  subtitle:
    "The controls we operate, in plain language, limited to the ones actually implemented.",
  sections: [
    {
      heading: "Data handling",
      body: [
        "Recorded evidence — requests, cookies, storage writes, screenshots — belongs to the agency that commissioned the scan. Every tenant query is scoped by agency at the data-access layer; cross-tenant access is prevented structurally, not by convention in each screen.",
      ],
    },
    {
      heading: "Scanner isolation",
      body: [
        "Scan browsers run in isolated, resource-limited workers with hard timeouts. A leaked browser context is released by a finally block, not by luck.",
      ],
    },
    {
      heading: "SSRF protection",
      body: [
        "The scanner never trusts a submitted URL. Every navigation and every redirect hop is validated against internal and link-local address ranges before the request leaves — DNS rebinding and redirects to internal addresses are both guarded at the browser's network layer.",
      ],
    },
    {
      heading: "Encrypted storage and retention",
      body: [
        "Evidence and screenshots are stored encrypted. Data is retained for the window in the plan and deleted automatically afterwards — retention is a scheduled sweep, not a promise to get around to it.",
      ],
    },
    {
      heading: "Access and audit",
      body: [
        "Portal access is scoped to one client and signed; revocation takes effect immediately. Agency-side actions that change settings or data are recorded in an audit log that agencies can export.",
      ],
    },
    {
      heading: "Subprocessors",
      body: [
        "The service depends on a short, published list of subprocessors — authentication, billing, email delivery, AI providers, hosting and storage. The current list with their roles is maintained in the data processing agreement.",
      ],
    },
  ],
  disclaimer:
    "This page describes implemented controls. It is not a certification, an attestation, or a substitute for your own review.",
  cta: { href: "/contact", label: "Ask us about a security review" },
} as const;
export interface IntegrationRow {
  name: string;
  category: "CMP" | "Alerting" | "Workflow" | "Platform";
  status: "available" | "partial" | "heuristic" | "experimental" | "coming-soon" | "planned";
  note: string;
}

export const INTEGRATIONS = {
  title: "Integrations",
  subtitle:
    "What the scanner operates today, and what is on the roadmap. Roadmap items are labelled as roadmap — nothing here pretends to be live.",
  statusLabels: {
    available: "Supported",
    partial: "Partial",
    heuristic: "Heuristic",
    experimental: "Experimental",
    "coming-soon": "Coming soon",
    planned: "Planned",
  } as const,
  rows: [
    { name: "Google Consent Mode v2", category: "CMP", status: "available", note: "Signals observed per journey." },
    { name: "Cookiebot", category: "CMP", status: "available", note: "All four journeys operated." },
    { name: "OneTrust", category: "CMP", status: "available", note: "All four journeys operated." },
    { name: "Usercentrics", category: "CMP", status: "available", note: "Including Deny-style controls." },
    { name: "Klaro", category: "CMP", status: "available", note: "All four journeys operated." },
    { name: "Didomi", category: "CMP", status: "partial", note: "Some configurations expose no operable reject control." },
    { name: "Termly", category: "CMP", status: "heuristic", note: "Detected generically; journeys may report undetermined." },
    { name: "Bespoke banners", category: "CMP", status: "heuristic", note: "Generic strategies only; honest could-not-be-determined outcomes." },
    /*
     * ⚠️ BOTH OF THESE READ "available" UNTIL AN AUDIT CHECKED THEM, AND
     * NEITHER IS BUILT. Slack is a feature flag (`SLACK_INTEGRATION`) that
     * defaults to false with no delivery code anywhere — `policy.ts` routes the
     * `email` channel and nothing else. The webhook dispatcher exists and is
     * tested, but nothing calls it: there is no endpoint model, no signing
     * secret and no producer (see `src/server/services/webhooks.ts`).
     *
     * A status label on this page is a product claim. "available" against
     * something a customer cannot switch on is the same defect as a rule that
     * reports a finding it did not observe, one surface further out.
     */
    { name: "Slack", category: "Alerting", status: "planned", note: "Alert delivery to Slack channels." },
    { name: "Webhooks", category: "Alerting", status: "planned", note: "Signed webhook events for alert rules." },
    { name: "Email digests", category: "Alerting", status: "available", note: "Weekly summaries per agency." },
    { name: "Jira", category: "Workflow", status: "planned", note: "Create issues from findings." },
    { name: "Linear", category: "Workflow", status: "planned", note: "Create issues from findings." },
    { name: "WordPress plugin", category: "Platform", status: "planned", note: "Portfolio import helpers." },
  ] as readonly IntegrationRow[],
  cta: { href: "/free-scanner", label: "Test it against your stack" },
} as const;

export const BOT = {
  title: "About our scanner",
  subtitle:
    "What the Privacy Drift Monitor scanner does on the websites it visits, and how to control it.",
  sections: [
    {
      heading: "What the scanner does",
      body: [
        "The scanner loads public web pages in a headless Chromium browser to record which network requests, cookies and storage writes occur under different consent states. It does not execute forms it was not configured to execute, does not submit personal data, and does not attempt to bypass authentication.",
      ],
    },
    {
      heading: "How it identifies itself",
      body: [
        "Scans run from our infrastructure with a user agent that identifies the product. The exact user-agent string is visible in your server logs on every request a scan makes.",
      ],
    },
    {
      heading: "How often it visits",
      body: [
        "Scan frequency is set by the agency that monitors the website — weekly by default, up to daily. A scan is one browser session per consent journey on the configured paths.",
      ],
    },
    {
      heading: "How to block or exclude your site",
      body: [
        "Block the scanner's user agent, or contact us and we will exclude the domain from scanning entirely. Monitoring a website requires the agency's authority to scan it, and our terms say so.",
      ],
    },
  ],
} as const;