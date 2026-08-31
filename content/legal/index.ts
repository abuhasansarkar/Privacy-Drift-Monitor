/**
 * LEGAL DOCUMENTS — PLAN.md §3.2 ("Legal Pages").
 *
 * ⚠️ DEVIATION FROM §3.2's "MDX from content/legal/*.mdx", deliberate. MDX
 * needs `@next/mdx` plus a `next.config` change, and these four documents have
 * no rich content — they are headings and paragraphs. Structured TypeScript
 * gives the same output with no dependency, generates the table of contents
 * from the data instead of by parsing rendered HTML, and stays inside
 * `scripts/check-terminology.ts`'s scan set (it walks `content/`). When the
 * blog lands and genuinely needs MDX, these can move with it.
 *
 * ⚠️ NOT LEGAL ADVICE AND NOT COUNSEL-REVIEWED. §12.3 puts "legal pages
 * finalized with counsel review" in Phase 7 (task 7.9). What is here covers
 * every point §3.2 lists as mandatory, in our own words, so the surface exists
 * and can be reviewed — it is a draft for a lawyer to edit, not a substitute
 * for one.
 */

import { DISCLAIMER_FULL } from "@pdm/shared/copy/terminology";

export interface LegalSection {
  /** Slug for the anchor and the table of contents. */
  id: string;
  heading: string;
  /** Rendered as paragraphs. */
  body?: readonly string[];
  /** Rendered as a bulleted list after the paragraphs. */
  list?: readonly string[];
  /** Rendered as a two-column table after the list. */
  table?: {
    columns: readonly [string, string];
    rows: readonly (readonly [string, string])[];
  };
}

export interface LegalDocument {
  slug: string;
  title: string;
  description: string;
  /** ISO date. Rendered through `Intl` with an explicit locale (§11.11). */
  lastUpdated: string;
  intro: readonly string[];
  sections: readonly LegalSection[];
}

const LAST_UPDATED = "2026-08-31";

const CONTACT = "privacy@driftmonitor.example";

const disclaimer: LegalDocument = {
  slug: "disclaimer",
  title: "Disclaimer",
  description:
    "What Privacy Drift Monitor is, what it is not, and the limits of automated scanning.",
  lastUpdated: LAST_UPDATED,
  // The four paragraphs §3.2 fixes word for word. Imported, never retyped.
  intro: DISCLAIMER_FULL,
  sections: [
    {
      id: "what-we-do",
      heading: "What the service does",
      body: [
        "We load each monitored website in a real browser and record what happens: every network request, every cookie, every storage write, and the consent state each of them occurred under. We repeat that across four consent journeys — no interaction, Reject All, Accept All, and withdrawal.",
        "Deterministic rules then run over that recording. A finding always points back to the specific request, cookie or storage write that produced it, and reads identically every time it is opened.",
      ],
    },
    {
      id: "what-we-do-not-do",
      heading: "What the service does not do",
      list: [
        "We do not decide whether a website meets any legal obligation.",
        "We do not issue certifications, attestations or seals.",
        "We do not act as your data protection officer or representative.",
        "We do not modify, fix or configure anything on a monitored website.",
      ],
    },
    {
      id: "limitations",
      heading: "Known limitations of automated scanning",
      body: [
        "These limits are inherent to browser-based scanning. We state them here rather than in a support article because they change how a finding should be read.",
      ],
      list: [
        "Behaviour observed by an automated browser can differ from behaviour shown to real visitors, by geography, by device, and by whether a bot is detected.",
        "Tags that load only after an interaction we do not perform — a video play, a form submission — may not appear.",
        "Server-side tracking is not visible to a browser-based scan at all.",
        "Consent journeys depend on the consent banner being detectable and operable automatically. Where a journey could not be completed we report it as “could not be determined”, never as a clean result.",
        "A tracking service we do not yet recognise is recorded as an unknown third party rather than being silently dropped.",
      ],
    },
    {
      id: "your-responsibility",
      heading: "Your responsibility",
      body: [
        "You are responsible for having permission to monitor every website you add, for determining which legal obligations apply to it, and for deciding what to do about anything we report.",
      ],
    },
  ],
};

const terms: LegalDocument = {
  slug: "terms",
  title: "Terms of Service",
  description: "The agreement that governs your use of Privacy Drift Monitor.",
  lastUpdated: LAST_UPDATED,
  intro: [
    "These terms govern your use of Privacy Drift Monitor. By creating an account you agree to them.",
  ],
  sections: [
    {
      id: "service",
      heading: "The service",
      body: [
        "Privacy Drift Monitor is a technical monitoring service for web agencies. It scans websites you nominate in an automated browser, records what it observes, compares each scan against the previous one, and reports what changed.",
        "The service is provided on a subscription basis. Features available to you depend on the plan you are on.",
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      body: [
        "One rule matters more than the rest, and it is not negotiable:",
      ],
      list: [
        "You may only monitor websites that you control, or that you have explicit permission from the owner to scan. Scanning a website you have no relationship with is a misuse of the service and grounds for immediate termination.",
        "You may not use the service to test, probe or attack infrastructure, or to attempt to circumvent another party's access controls.",
        "You may not attempt to reach internal, private or link-local network addresses through the scanner. We block these, and attempts are logged.",
        "You may not resell raw access to the scanner, or use it to build a competing scanning product.",
        "You may not submit volumes designed to degrade the service for other customers.",
      ],
    },
    {
      id: "accounts",
      heading: "Accounts",
      body: [
        "You are responsible for activity under your account and for the accuracy of the details you give us. Tell us promptly if you believe an account has been compromised.",
        "Each member of your team should have their own login. Roles determine what they can do; you are responsible for assigning them appropriately.",
      ],
    },
    {
      id: "trial",
      heading: "Trial",
      body: [
        "New accounts start with a 14-day trial. No card is required to begin. If you do not subscribe before the trial ends, scanning stops and your data is retained for a limited period before deletion.",
      ],
    },
    {
      id: "payment",
      heading: "Payment",
      body: [
        "Subscriptions are billed in advance, monthly or annually, in the currency shown at checkout. Charges are not refundable except where required by law.",
        "If a payment fails we will retry and tell you. Continued failure results in the account being suspended rather than deleted.",
      ],
    },
    {
      id: "cancellation",
      heading: "Cancellation",
      body: [
        "You can cancel at any time. Your subscription runs to the end of the period you have paid for, after which scanning stops. You can export your data before then.",
        "We may suspend or terminate an account that breaches the acceptable use rules above, with notice where circumstances allow.",
      ],
    },
    {
      id: "warranty",
      heading: "Warranty disclaimer",
      body: [
        "The service is provided as-is. We do not warrant that scanning will detect every tracking technology, that every consent journey will complete, or that the service will be uninterrupted.",
        "Findings are potential issues for human review. They are not a legal assessment. See the Disclaimer for the full boundary statement.",
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      body: [
        "To the extent permitted by law, our total liability arising from the service is limited to the amount you paid us in the twelve months before the claim.",
        "We are not liable for indirect or consequential loss, including lost profits, lost business, or regulatory action taken against you.",
      ],
    },
    {
      id: "ip",
      heading: "Intellectual property",
      body: [
        "We own the service, including our detection rules and vendor catalogue. You own your data and the reports generated from it, and you may share them with your clients.",
      ],
    },
    {
      id: "changes",
      heading: "Changes",
      body: [
        "We may change these terms. Material changes will be notified by email before they take effect, and the “last updated” date above always reflects the current version.",
      ],
    },
    {
      id: "law",
      heading: "Governing law",
      body: [
        "These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.",
      ],
    },
  ],
};

const privacy: LegalDocument = {
  slug: "privacy",
  title: "Privacy Policy",
  description:
    "What we collect, why, how long we keep it, and who processes it on our behalf.",
  lastUpdated: LAST_UPDATED,
  intro: [
    "We sell a privacy monitoring product, so this policy has to be better than average. It says exactly what we collect and exactly how long we keep it.",
  ],
  sections: [
    {
      id: "what-we-collect",
      heading: "What we collect",
      table: {
        columns: ["Data", "Why we hold it"],
        rows: [
          ["Account data — name, email, agency name, role", "To give you an account and control what you can access"],
          ["Client and website records you create", "They are the subject of the monitoring you asked for"],
          ["Scan evidence — requests, cookies, storage writes, screenshots", "It is the evidence behind every finding; without it a finding cannot be checked"],
          ["Findings, drift events and scores", "The product's output"],
          ["Billing data — plan, invoices, tax identifiers", "To charge you. Card details are held by our payment processor, never by us"],
          ["Usage analytics — pages viewed, features used", "To understand what is worth building"],
          ["Support messages you send us", "To answer them"],
        ],
      },
    },
    {
      id: "minimisation",
      heading: "What we deliberately do not collect",
      body: [
        "Scan evidence is reduced before it is stored, not after. This is a design decision, not a policy promise:",
      ],
      list: [
        "Request URLs are stripped of query values before storage; parameter names are kept, values are not.",
        "Cookie values are stored as a hash and a length. The only exception is a short allowlist of consent-signal cookies, where the value itself is the diagnostic.",
        "IP addresses are stored as a hash, never in the clear.",
        "We do not record page content, form input, or anything a visitor types.",
      ],
    },
    {
      id: "lawful-basis",
      heading: "Lawful bases",
      table: {
        columns: ["Processing", "Basis"],
        rows: [
          ["Providing the service to you", "Performance of our contract with you"],
          ["Billing and tax records", "Legal obligation"],
          ["Product analytics and service improvement", "Legitimate interests, balanced against your expectations"],
          ["Marketing email", "Consent, withdrawable at any time"],
        ],
      },
    },
    {
      id: "processors",
      heading: "Sub-processors",
      body: [
        "We use these providers to run the service. Each is bound by a data processing agreement.",
      ],
      table: {
        columns: ["Provider", "Purpose"],
        rows: [
          ["Clerk", "Authentication and team membership for agency users"],
          ["Stripe", "Payments and subscription management"],
          ["Resend", "Transactional and alert email"],
          ["OpenAI", "Optional AI explanation of findings, when enabled"],
          ["Our hosting provider", "Running the application and the scanner"],
          ["Our object storage provider", "Screenshots and generated reports"],
        ],
      },
    },
    {
      id: "retention",
      heading: "Retention",
      table: {
        columns: ["Data class", "Kept for"],
        rows: [
          ["Scan evidence and screenshots", "30 to 365 days, depending on your plan"],
          ["Findings, drift events and scores", "For as long as the website is monitored, then 12 months"],
          ["Generated reports", "Until you delete them"],
          ["Free public scan results", "7 days, then purged"],
          ["Audit log", "24 months"],
          ["Billing records", "As long as tax law requires"],
          ["Account data", "Until you close the account, then 30 days"],
        ],
      },
    },
    {
      id: "your-rights",
      heading: "Your rights",
      body: [
        `You can ask for a copy of your data, ask us to correct it, ask us to delete it, object to processing based on legitimate interests, or ask us to restrict processing. Write to ${CONTACT} and we will respond within one month.`,
        "If you are unhappy with how we handled a request you can complain to your local supervisory authority.",
      ],
    },
    {
      id: "transfers",
      heading: "International transfers",
      body: [
        "Scanning runs from the EU. Some of our sub-processors operate in the United States; those transfers rely on Standard Contractual Clauses or an equivalent mechanism.",
      ],
    },
    {
      id: "security",
      heading: "Security",
      list: [
        "Every tenant's data is isolated at the data-access layer, not by convention, and that isolation is asserted by an automated test suite against every model.",
        "Screenshots and reports live in a private bucket and are only ever served through short-lived signed links.",
        "Client portal sessions are separate from agency sessions and are scoped to a single client.",
        "Access to production data is limited and audited.",
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      body: [`Write to ${CONTACT} with any question about this policy.`],
    },
  ],
};

const cookiePolicy: LegalDocument = {
  slug: "cookie-policy",
  title: "Cookie Policy",
  description: "Every cookie this site sets, what it is for, and how long it lasts.",
  lastUpdated: LAST_UPDATED,
  intro: [
    "A privacy monitoring product with a vague cookie policy is not credible, so this page enumerates every cookie we set rather than describing categories.",
    "We set no advertising cookies and no cross-site tracking cookies, on any of our surfaces.",
  ],
  sections: [
    {
      id: "our-cookies",
      heading: "Cookies we set",
      table: {
        columns: ["Cookie", "Purpose and duration"],
        rows: [
          ["__session", "Your signed-in session, set by our authentication provider. Required. Expires when the session ends."],
          ["__client_uat", "Tells the browser whether a session exists, so pages can render the right controls without a round trip. Required. Session."],
          ["pdm_portal", "A client portal session. Only set on /portal, only after a magic-link sign-in. Required. 7 days, with a 30-day absolute maximum."],
          ["pdm_theme", "Remembers whether you chose light or dark. Preference. 1 year."],
        ],
      },
    },
    {
      id: "no-consent-banner",
      heading: "Why you are not seeing a consent banner",
      body: [
        "Every cookie in the table above is either strictly necessary to deliver a service you asked for, or a preference you set yourself. None of them are used for advertising, profiling or cross-site measurement, so none of them require consent.",
        "If that ever changes, this page changes first and a banner appears with it.",
      ],
    },
    {
      id: "scanning",
      heading: "Cookies we observe on your behalf",
      body: [
        "Separately from the cookies this site sets, the scanner records the cookies present on the websites you monitor. Those recordings are your data, stored under your account, and are covered by the retention table in our Privacy Policy.",
        "Their values are stored as a hash and a length rather than in the clear, with a short allowlist of consent-signal cookies where the value itself is the diagnostic.",
      ],
    },
    {
      id: "controlling",
      heading: "Controlling cookies",
      body: [
        "You can clear or block cookies in your browser. Blocking the session cookies above will sign you out and prevent you from signing back in; the preference cookie can be blocked with no loss of function.",
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  terms,
  privacy,
  cookiePolicy,
  disclaimer,
];

export function findLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
}
