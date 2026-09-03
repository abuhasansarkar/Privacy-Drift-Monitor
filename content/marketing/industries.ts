/**
 * INDUSTRY SOLUTIONS — one data-driven template, five genuinely different
 * pages. The brief's rule against doorway pages is enforced structurally:
 * every industry carries its own pain points, tracking stack, example
 * findings and FAQs, written from the scenarios that industry actually
 * produces — the template fills in around the content, never the reverse.
 *
 * ⚠️ WALKED BY THE TERMINOLOGY CHECK, like the rest of `content/marketing`.
 */

export interface IndustryExample {
  title: string;
  body: string;
}

export interface Industry {
  slug: string;
  name: string;
  shortName: string;
  /** Card line: the pain in one sentence. */
  pain: string;
  /** Card line: how the product helps, in one sentence. */
  help: string;
  hero: { title: string; subtitle: string };
  /** The tracking stack this industry typically manages for clients. */
  trackingStack: readonly string[];
  painPoints: ReadonlyArray<{ title: string; body: string }>;
  whyAuditsFail: string;
  workflow: ReadonlyArray<{ title: string; body: string }>;
  examples: readonly IndustryExample[];
  capabilities: readonly string[];
  agencyWorkflow: string;
  faqs: ReadonlyArray<{ question: string; answer: string }>;
  cta: { title: string; body: string };
}

export const INDUSTRIES: readonly Industry[] = [
{
    slug: "web-agencies",
    name: "Web & digital agencies",
    shortName: "Web & digital",
    pain: "Forty client websites, four CMSs, and no way to know which one changed its tracking behavior this week.",
    help: "Portfolio-wide monitoring with per-site baselines, so drift is a dated alert instead of a manual investigation.",
    hero: {
      title: "Monitor privacy behavior across your whole client portfolio",
      subtitle:
        "You already monitor uptime, errors and performance for clients. Privacy Drift Monitor adds the missing layer: what each website actually loads, under each consent state, and what changed since last week.",
    },
    trackingStack: [
      "Google Tag Manager containers per client",
      "Analytics platforms the client chose years ago",
      "Pixels added by whoever has dashboard access",
      "Chat widgets, embeds and A/B testing scripts",
      "A different consent platform on almost every site",
    ],
    painPoints: [
      {
        title: "Every client is a different setup",
        body: "Different CMS, different CMP, different tag conventions. A monitoring approach that assumes one stack breaks the moment the portfolio is heterogeneous — which every real portfolio is.",
      },
      {
        title: "The person who set up consent has moved on",
        body: "The GTM container was configured by a developer who left in 2023. Nobody on the team now knows whether that marketing tag is still behind the consent trigger — until something asks.",
      },
      {
        title: "Questions arrive without warning",
        body: "A client forwards a question from their privacy advisor about a tracker you have never heard of. With per-site baselines and recorded evidence, the answer is a timeline instead of a week of browser devtools.",
      },
    ],
    whyAuditsFail:
      "A one-off audit averages one afternoon per website and is out of date the next time any of the forty changes. Across a portfolio, the arithmetic stops working entirely: continuous monitoring is the only version of this that scales to dozens of sites without adding headcount.",
    workflow: [
      { title: "Import the portfolio", body: "Bulk-add client websites by CSV; each gets a schedule and jurisdiction profile." },
      { title: "Baseline established", body: "The first successful scan records what each site does under each consent state." },
      { title: "Drift surfaces", body: "Every scan is diffed against the baseline; changes become dated, evidenced events." },
      { title: "Fix and verify", body: "Fix the trigger or the template; the next scan verifies the change is no longer observed." },
    ],
examples: [
      {
        title: "New tracker on a campaign landing page",
        body: "A landing page built outside the main template loads a pixel the consent script never covers. The scan flags a marketing request observed before consent, with the URL, timestamp and journey recorded.",
      },
      {
        title: "CMP update changes category mapping",
        body: "After a consent platform update, a statistics tag starts firing under Reject All. The drift timeline shows the date it started — which turns a vague client worry into a specific, fixable change.",
      },
    ],
    capabilities: [
      "Consent journeys per website, on a schedule",
      "Network, cookie and storage evidence per journey",
      "Deterministic rules, not an LLM, decide findings",
      "Portfolio dashboard with health scores",
      "Alerts routed to Slack, email or webhooks",
      "White-label monthly reports per client",
    ],
    agencyWorkflow:
      "Assign websites to clients, let the schedule do the watching, and review the triage queue once a week instead of auditing sites one at a time. The monthly digest becomes the care-plan deliverable your client actually reads.",
    faqs: [
      {
        question: "We manage more than one CMS. Does that matter?",
        answer:
          "No. The scanner observes what the browser loads, so it works the same way on WordPress, Shopify, Webflow, a static site or a hand-rolled framework. The consent platform is detected per website, not assumed per portfolio.",
      },
      {
        question: "Who on the team sees the findings?",
        answer:
          "Team seats are role-based: owners and admins see everything, members can be scoped to triage. Alerts can route to Slack or email, so the right developer sees the finding without a login.",
      },
    ],
    cta: {
      title: "Put your whole portfolio under monitoring this afternoon",
      body: "Import your client list, run first scans, and see what the baselines record — before a client asks first.",
    },
  },
  {
    slug: "wordpress-agencies",
    name: "WordPress agencies",
    shortName: "WordPress",
    pain: "Plugin updates, theme changes and client-installed plugins change tracking behavior without a single deploy.",
    help: "Scheduled scans catch the tracker a plugin update introduced — the day it appears, not the day a client complains.",
    hero: {
      title: "Catch what the next plugin update ships",
      subtitle:
        "A WordPress site changes without anyone pressing deploy. Plugins auto-update, themes bundle scripts, and clients install things. Privacy Drift Monitor watches what each site actually loads — under each consent state — so the change is caught while it is still this week's problem.",
    },
    trackingStack: [
      "GA / GTM wired through a consent plugin",
      "SEO and form plugins that bundle their own scripts",
      "Page-builder templates with embedded trackers",
      "Ad pixels on WooCommerce checkout funnels",
      "Cookie-banner plugins of wildly varying quality",
    ],
    painPoints: [
      {
        title: "Updates are the deployment",
        body: "A routine plugin update can add a third-party endpoint, change script loading order, or swap the banner markup the consent logic depends on. There is no deploy review to catch it in.",
      },
      {
        title: "Clients install plugins",
        body: "You hand over a clean site; two months later there is a statistics plugin active on it that nobody audited. Scheduled scans surface exactly what it added, and when.",
      },
      {
        title: "Banner and consent logic drift apart",
        body: "WordPress consent plugins interact with GTM through fragile category mappings. When either side updates, tags can start firing outside their categories — precisely the drift the scanner records.",
      },
    ],
    whyAuditsFail:
      "Auditing a WordPress site is auditing a moving target: the plugin set this month is not the plugin set next month. A point-in-time report cannot warn you that an update shipped a new tracker — only a diff against a recorded baseline can, and only if it runs on a schedule.",
    workflow: [
      { title: "Add the site", body: "Each WordPress site gets its own schedule and baseline; multisite networks are separate monitored websites." },
      { title: "Scans run on schedule", body: "Weekly or daily — the browser walks the four consent journeys every time." },
      { title: "Update lands, drift fires", body: "A plugin update adds a tracker; the next scan records it as a dated change with evidence." },
      { title: "Client report shows diligence", body: "The monthly white-label report shows what changed, what you checked, and what was fixed." },
    ],
    examples: [
      {
        title: "Form plugin adds a third-party endpoint",
        body: "An update to a popular form plugin begins loading an external script on every page. The scan records the new domain under every consent journey, including before consent.",
      },
      {
        title: "Banner update breaks tag blocking",
        body: "After the cookie-banner plugin updates, a statistics tag starts firing in the NO_CONSENT journey. The drift timeline dates the change; the fix is a category mapping, verified by the next scan.",
      },
    ],
    capabilities: [
      "Works with WordPress consent plugins and CMPs",
      "Detects new third-party domains after updates",
      "Records pre-consent behavior per journey",
      "Per-site baselines across the whole portfolio",
      "Evidence rows a developer can act on directly",
      "White-label reports for care-plan clients",
    ],
    agencyWorkflow:
      "Add monitoring to the care plan: the monthly report shows scans run, changes detected and fixes verified. When a client asks what a plugin update did to their tracking, the answer is a link, not an afternoon.",
    faqs: [
      {
        question: "Does the scanner work with cookie-banner plugins?",
        answer:
          "Common WordPress consent plugins are detected and operated where they expose working controls; the resources page carries the honest compatibility matrix, including which platforms fall back to heuristics.",
      },
      {
        question: "Will scans slow down my clients' sites?",
        answer:
          "Scans run from our infrastructure in an isolated browser, one page at a time on a schedule you set. From the site's point of view a scan is one ordinary visitor session.",
      },
    ],
    cta: {
      title: "Know what the next update ships",
      body: "Add the portfolio, set the schedule, and let the baseline catch what plugin changelogs do not mention.",
    },
  },
  {
    slug: "ecommerce-agencies",
    name: "E-commerce agencies",
    shortName: "E-commerce",
    pain: "Checkout funnels carry the densest tracking of any page on the web, and every pixel there has revenue attached to it.",
    help: "Journey-level evidence shows which trackers fire on product, cart and checkout pages — and which fire before consent.",
    hero: {
      title: "Watch the trackers that watch the checkout",
      subtitle:
        "E-commerce sites run ad pixels, conversion trackers, personalisation scripts and analytics on every step of the funnel. Privacy Drift Monitor records what each journey loads — so a pixel added by a marketplace integration becomes evidence, not a mystery.",
    },
    trackingStack: [
      "Conversion and remarketing pixels on checkout",
      "Marketplace and affiliate integrations",
      "Personalisation and recommendation scripts",
      "Enhanced-conversion and server-side tagging setups",
      "Consent platforms configured per region",
    ],
    painPoints: [
      {
        title: "Revenue-critical pixels change quietly",
        body: "An app integration adds its own pixel to the theme. When conversion tracking breaks or double-fires, nobody notices until the ad platform's numbers stop matching — weeks later.",
      },
      {
        title: "Consent applies to the whole funnel",
        body: "Product pages, cart, checkout and post-purchase pages each load their own scripts. A consent setup that works on the homepage can leave the checkout loading marketing tags before any choice.",
      },
      {
        title: "Regional rules differ",
        body: "One store, several jurisdictions. What a browser observes before consent in an EU-configured store is exactly what the scanner records per journey, per region profile.",
      },
    ],
    whyAuditsFail:
      "An audit checks the pages someone thought to list. Store platforms assemble each page from themes, apps and integrations at request time, so the script set differs by template, campaign and season. Only scheduled comparison against a recorded baseline tracks a target that re-composes itself.",
    workflow: [
      { title: "Monitor the funnel pages", body: "Scan schedules cover product, cart and checkout paths, not just the homepage." },
      { title: "Journeys record everything", body: "Every pixel and cookie is tagged with the consent state it fired under." },
      { title: "App integrations surface", body: "A marketplace app adding its own endpoint appears as a dated drift event." },
      { title: "Fix without breaking revenue", body: "Evidence shows exactly which tag and template; the next scan verifies the fix." },
    ],
    examples: [
      {
        title: "Checkout pixel fires before consent",
        body: "A remarketing pixel on the checkout template fires in the NO_CONSENT journey. The finding carries the domain, the template and the timestamp — the developer knows exactly where to look.",
      },
      {
        title: "App integration adds a new domain",
        body: "A reviews app update starts loading a third-party script on product pages. The drift event dates the change and links the recorded requests.",
      },
    ],
    capabilities: [
      "Multi-page journeys across the funnel",
      "Pre-consent detection per journey and region",
      "Cookie registry with categories and lifetimes",
      "Tracker inventory across the whole store",
      "Alerts when the script set changes",
      "White-label reports for store owners",
    ],
    agencyWorkflow:
      "Offer store owners ongoing technical privacy monitoring alongside maintenance: the monthly report documents what the funnel loaded, what changed, and what was verified fixed.",
    faqs: [
      {
        question: "Can it scan cart and checkout pages, not just the homepage?",
        answer:
          "Yes. A monitored website's scan journeys are configurable, so the paths that carry the tracking density — cart, checkout, post-purchase — are scanned, not just the landing page.",
      },
      {
        question: "We use server-side tagging. Is that covered?",
        answer:
          "The scanner observes what the browser sends and receives, including first-party endpoints that proxy to tagging servers. What a browser sees is what gets recorded, whatever the architecture behind it.",
      },
    ],
    cta: {
      title: "Put the funnel under monitoring",
      body: "The pages with the most tracking deserve the most evidence. Run a free scan on a store and see what the journeys record.",
    },
  },
  {
    slug: "seo-ppc-agencies",
    name: "SEO & PPC agencies",
    shortName: "SEO & PPC",
    pain: "Your campaigns add the pixels. When one starts firing before consent, it has your name on it.",
    help: "Every tag the campaign ships is monitored per consent state, so the fix lands before the question does.",
    hero: {
      title: "You shipped the tag. Monitor what it does.",
      subtitle:
        "PPC and SEO work is measured in pixels and conversion tags — the exact surface where consent behavior drifts. Privacy Drift Monitor records what every landing page loads under each consent state, so the tag you added this quarter is still doing what you intended.",
    },
    trackingStack: [
      "Conversion tracking and remarketing tags",
      "Landing pages spun up per campaign",
      "A/B testing and heatmap scripts",
      "Call-tracking numbers and widgets",
      "GTM containers owned by the agency",
    ],
    painPoints: [
      {
        title: "Landing pages skip the template",
        body: "Campaign pages are built fast, often outside the main template, and the consent script is the thing that gets forgotten. That is also the page every paid click lands on.",
      },
      {
        title: "Tags accumulate",
        body: "Each quarter adds a conversion tag, a retargeting pixel, an experiment script. Nobody removes the old ones, and the page's tracking behavior quietly doubles.",
      },
      {
        title: "The agency is the visible party",
        body: "When a client's advisor asks about a tracking tag, the tag belongs to the marketing workstream. Agencies that can show monitoring records answer in minutes instead of days.",
      },
    ],
    whyAuditsFail:
      "An annual audit is on the wrong clock for paid media: landing pages, tags and campaigns change weekly. Drift detection compares every scan against the last, on the cadence campaigns actually move.",
    workflow: [
      { title: "Cover the campaign pages", body: "Landing pages and funnels are monitored websites in their own right." },
      { title: "Tags recorded per journey", body: "Every conversion and remarketing tag is logged with its consent state." },
      { title: "New tag, dated event", body: "A tag added mid-campaign shows up in the next scan diff, with evidence." },
      { title: "Report wins the renewal", body: "White-label reports show the client the monitoring you run on their behalf." },
    ],
    examples: [
      {
        title: "Campaign page loads a pixel pre-consent",
        body: "A paid landing page fires a remarketing pixel before any consent state. The finding names the page, the tag and the journey — one GTM trigger away from fixed.",
      },
      {
        title: "Retired tag never removed",
        body: "A conversion tag from an ended campaign still fires on the thank-you page. The tracker inventory lists it; removing it is a five-minute cleanup with evidence behind it.",
      },
    ],
    capabilities: [
      "Pre-consent tag detection per landing page",
      "Tracker inventory with first-seen dates",
      "Journey evidence for every consent state",
      "Change alerts on the campaign cadence",
      "Client-ready white-label reports",
      "Health scores that survive client handovers",
    ],
    agencyWorkflow:
      "Fold monitoring into retainers: the monthly report documents tag behavior across campaign pages, and every new tag lands in a scan diff before it lands in a client meeting.",
    faqs: [
      {
        question: "We add tags constantly. Will every change trigger noise?",
        answer:
          "You control alert rules — by website, severity or change type — so routine additions can be reviewed in the weekly digest while pre-consent observations alert immediately.",
      },
      {
        question: "Does this replace conversion verification?",
        answer:
          "No. It records that a conversion endpoint was requested under a consent state; it does not validate ad-platform attribution. It is the privacy-behavior layer, not the analytics QA layer.",
      },
    ],
    cta: {
      title: "Monitor the pages your campaigns depend on",
      body: "Run a free scan on a live landing page and see the consent-state evidence it produces.",
    },
  },
  {
    slug: "saas-agencies",
    name: "SaaS & product agencies",
    shortName: "SaaS & product",
    pain: "Product surfaces embed analytics, session tools and third-party services across app, docs and marketing sites.",
    help: "One monitored portfolio for app, marketing and docs properties, with journey evidence for each.",
    hero: {
      title: "Every embedded service is a privacy behavior to monitor",
      subtitle:
        "Product agencies ship and maintain a dozen third-party surfaces: app shells, docs, changelogs, marketing sites. Privacy Drift Monitor keeps a baseline for each and records what every consent journey loads — so embedded services stay accounted for as the product grows.",
    },
    trackingStack: [
      "Product analytics across app and marketing",
      "Session replay and error-tracking widgets",
      "Docs and community platforms on subdomains",
      "A/B testing in onboarding flows",
      "Consent states that differ between app and site",
    ],
    painPoints: [
      {
        title: "The estate is bigger than the website",
        body: "App, docs, changelog, status page, community — each is a separate surface with its own script set. Monitoring only the marketing site misses most of the estate.",
      },
      {
        title: "Product releases change embedded scripts",
        body: "A new onboarding step ships with a new analytics call. Nothing in the release notes says so; the baseline diff does.",
      },
      {
        title: "App and site consent differ",
        body: "Consent applies differently inside a logged-in product versus the public site. Journey evidence per surface keeps the two straight instead of hand-waving between them.",
      },
    ],
    whyAuditsFail:
      "A product's third-party surface area grows with every release and spans properties no single audit covers. Continuous monitoring treats each property as a monitored website with its own baseline and history.",
    workflow: [
      { title: "Register the estate", body: "App, marketing site, docs and subdomains are each monitored websites." },
      { title: "Baselines per surface", body: "Each property records what its journeys load, independently." },
      { title: "Releases become visible", body: "A script added by a release appears as drift on the next scheduled scan." },
      { title: "One report, whole estate", body: "Client reports roll the properties up, or break them out — the agency chooses." },
    ],
    examples: [
      {
        title: "Session tool added to onboarding",
        body: "A release adds a session-replay script to the signup flow. The drift event dates it and records which consent states it fired under.",
      },
      {
        title: "Docs subdomain loads its own tracker",
        body: "A documentation platform's integration starts loading a third-party script. The per-property baseline catches it even though the main site never loads it.",
      },
    ],
    capabilities: [
      "Multi-property portfolios under one agency",
      "Per-surface baselines and drift histories",
      "Journey evidence inside authenticated flows where accessible",
      "Cookie and storage registries per property",
      "API access on plans that include it",
      "Digest emails summarising the week's changes",
    ],
    agencyWorkflow:
      "Treat monitoring as part of the product retainer: each release cycle gets a scan diff, and the monthly report shows the client their whole third-party estate in one place.",
    faqs: [
      {
        question: "Can it scan pages behind a login?",
        answer:
          "Journeys can include authenticated flows where the agency provides scan-only credentials scoped to a test account. The security page describes how those credentials are stored.",
      },
      {
        question: "We ship daily. What scan frequency makes sense?",
        answer:
          "Schedules go up to daily per website. Most product teams run daily on the surfaces that change fastest and weekly elsewhere.",
      },
    ],
    cta: {
      title: "Monitor the whole product estate",
      body: "Add every property you maintain and see what each baseline records on its first scan.",
    },
  },
];

export const SOLUTIONS_INDEX = {
  title: "Solutions",
  subtitle:
    "Monitoring built around the portfolios agencies actually manage. Each industry page describes the stack, the failure mode, and the workflow that fits.",
} as const;

export function industryBySlug(slug: string): Industry | undefined {
  return INDUSTRIES.find((industry) => industry.slug === slug);
}

/** Industries used only as homepage cards (no dedicated page yet) link here. */
export const SENSITIVE_DATA_NOTE =
  "Websites handling sensitive data have the least tolerance for untracked change. Talk to us about monitoring requirements for these portfolios.";