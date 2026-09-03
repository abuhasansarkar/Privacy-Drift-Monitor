/**
 * MARKETING FAQS — the objection-handling set.
 *
 * ⚠️ STRUCTURED TYPESCRIPT IN `content/` so `scripts/check-terminology.ts`
 * walks every answer. A FAQ is the easiest place for a compliance claim to
  * slip in, because the natural answer to "does this resolve a client's obligations?"
 * is the one §1.12 forbids — the honest answer is "no tool determines that,
 * and we say so".
 *
 * Rendered with native `<details>` so crawlers and no-JS visitors read every
 * answer, and paired with FAQPage JSON-LD only where the same items are
 * visible on the page.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export const PRODUCT_FAQS: readonly FaqItem[] = [
  {
    question: "Is this a cookie consent manager?",
    answer:
      "No. A consent manager shows the banner and stores choices on your client's website. Privacy Drift Monitor sits outside the website and verifies what the banner actually does: it loads the site in a real browser, walks through each consent state, and records which requests and cookies appear in each one.",
  },
  {
    question: "Does it replace Cookiebot, OneTrust or Usercentrics?",
    answer:
      "No — it works alongside them. The consent platform is the control; Privacy Drift Monitor is the verification layer that checks the control is still doing its job after CMP updates, tag changes and plugin releases. Most agencies keep the CMP exactly as it is and add monitoring on top.",
  },
  {
    question: "How does the browser scanner work?",
    answer:
      "Each scan runs the site in an isolated Chromium browser (Playwright), walks four consent journeys — no interaction, Reject All, Accept All, and withdraw — and records every network request, cookie and storage write with the consent state it happened under. The recordings then go through deterministic rules, not an LLM, to produce findings.",
  },
  {
    question: "Can it detect trackers that fire before consent?",
    answer:
      "Yes. Because every request is tagged with the consent state that existed when it fired, the rule set can flag a marketing tag observed before any consent decision — the classic drift scenario after someone adds a tag outside the consent trigger.",
  },
  {
    question: "Can it test a Reject All button?",
    answer:
      "Yes, where the consent platform exposes a control the scanner can operate. The CMP compatibility table on the resources page states which platforms are supported, which are heuristic, and where the result comes back as could-not-be-determined instead of a pass.",
  },
  {
    question: "Can it detect changes over time?",
    answer:
      "That is the product's core idea, and it is called Privacy Drift. Every scan is diffed against the site's previous scan, so a new tracker, a new pre-consent request or a cookie that stopped being removed becomes a dated event with evidence, rather than a surprise during the next audit.",
  },
  {
    question: "What happens if a site cannot be fully scanned?",
    answer:
      "The scan is marked PARTIAL and never reports a clean result. Behind a bot challenge, or where a consent control cannot be operated, the score is shown as undetermined and the scan notes say exactly which phase could not complete. An incomplete scan is a first-class outcome here, not an error to hide.",
  },
];
export const MORE_FAQS: readonly FaqItem[] = [
  {
    question: "Does it provide legal advice?",
    answer:
      "No. Privacy Drift Monitor is a technical monitoring service. It records observable browser behavior and flags potential issues for review. It does not provide legal advice and does not determine legal compliance — findings are technical evidence for you and your clients' privacy advisors to interpret.",
  },
  {
    question: "Can agencies white-label the reports?",
    answer:
      "Yes, on plans that include the white-label entitlement. Reports carry the agency's logo, name and colours, are delivered from the agency's domain, and the client portal is branded the same way — your client relationship stays yours.",
  },
  {
    question: "Can clients have their own login?",
    answer:
      "Yes. The client portal is a separate, deliberately simple surface: health score, latest scan status, recent changes and downloadable PDF reports. Clients sign in with a magic link — no agency credentials are ever shared, and portal access is scoped to one client only.",
  },
  {
    question: "How many websites can I monitor?",
    answer:
      "Plans are sized by monitored website count, from small portfolios to unlimited. A monitored website is a distinct domain you scan on a schedule; the four consent journeys within a scan do not count extra. The pricing page shows the exact limits per plan.",
  },
  {
    question: "How does the AI work?",
    answer:
      "The deterministic scanner is the only source of truth. AI receives recorded evidence — never invents it — and produces a plain-language explanation, a recommended review action, a developer task and a client-ready message. Every AI output references stored evidence; if a reference cannot be resolved, the output is rejected and never shown.",
  },
  {
        question: "Does the AI determine a legal basis?",
    answer:
      "No. The AI explains recorded evidence and suggests what a developer should check next. It does not reach legal conclusions, and the same terminology rules bind its output as bind the rest of the product.",
  },
  {
    question: "What happens to scan data?",
    answer:
      "Recorded evidence belongs to the agency that commissioned the scan, is isolated per tenant, and is retained for the period in the plan before automatic deletion. Screenshots and request logs are stored encrypted, and access is audited. The security page documents the controls that are actually implemented.",
  },
  {
    question: "Can I cancel at any time?",
    answer:
      "Yes. Plans are month-to-month unless you choose annual billing, cancellation stops future billing, and you can export your data. There is no minimum term and no cancellation fee.",
  },
] as const;

/** The full set, in display order — what /pricing and /free-scanner render. */
export const PRODUCT_FAQS_FULL: readonly FaqItem[] = [...PRODUCT_FAQS, ...MORE_FAQS];

/** A shorter subset for the homepage — the highest-intent objections first. */
export const HOMEPAGE_FAQS: readonly FaqItem[] = [
  PRODUCT_FAQS[0],
  PRODUCT_FAQS[1],
  PRODUCT_FAQS[3],
  PRODUCT_FAQS[5],
  PRODUCT_FAQS[6],
  MORE_FAQS[0],
  MORE_FAQS[1],
  MORE_FAQS[7],
] as const;