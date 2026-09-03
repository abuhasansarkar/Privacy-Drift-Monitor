/**
 * MARKETING NAVIGATION — dev-doc/features/20-marketing-site.md shared layout
 * rules ("footer with 4 columns"), restructured for the 2026 surface.
 *
 * ⚠️ STRUCTURED TYPESCRIPT IN `content/`, like `content/blog` and
 * `content/legal`. Two reasons, both binding: no string literals in JSX
 * (engineering conventions), and `scripts/check-terminology.ts` walks
 * `content/`, so a banned phrase cannot reach the header or the footer of
 * every page on the site without failing CI.
 *
 * ⚠️ NOTHING HERE IS FABRICATED SOCIAL PROOF. The trust bar names product
 * capabilities, not customers — until real customers exist there are no logos
 * and no invented testimonials (feature 20, acceptance criteria).
 */

export interface NavItem {
  href: string;
  label: string;
  /** Optional one-line description shown inside a desktop dropdown panel. */
  description?: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/** Desktop dropdowns and the mobile drawer share one data source. */
export const HEADER_NAV: readonly NavGroup[] = [
  {
    label: "Product",
    items: [
      { href: "/features", label: "Features", description: "Every capability, and the evidence each one records." },
      { href: "/how-it-works", label: "How it works", description: "The six-stage pipeline, end to end." },
      { href: "/#drift", label: "Privacy Drift", description: "How a change becomes a dated event." },
      { href: "/#ai", label: "AI explanations", description: "Grounded in recorded browser evidence." },
      { href: "/#white-label", label: "Agency reports", description: "White-label reports and the client portal." },
      { href: "/methodology", label: "Methodology", description: "What is scanned, and what the limits are." },
    ],
  },
  {
    label: "Solutions",
    items: [
      { href: "/solutions", label: "All solutions", description: "Monitoring built around agency portfolios." },
      { href: "/solutions/web-agencies", label: "Web & digital agencies" },
      { href: "/solutions/wordpress-agencies", label: "WordPress agencies" },
      { href: "/solutions/ecommerce-agencies", label: "E-commerce agencies" },
      { href: "/solutions/seo-ppc-agencies", label: "SEO & PPC agencies" },
      { href: "/solutions/saas-agencies", label: "SaaS & product agencies" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/free-scanner", label: "Free scanner", description: "Scan one website, no account needed." },
      { href: "/resources", label: "Guides & CMP compatibility", description: "Which consent platforms the scanner operates." },
      { href: "/blog", label: "Blog", description: "Privacy monitoring, consent, and agency operations." },
      { href: "/security", label: "Security", description: "How scan data is isolated, stored and retained." },
      { href: "/integrations", label: "Integrations", description: "CMPs, Slack, webhooks — and what is planned." },
      { href: "/changelog", label: "Changelog", description: "What shipped, and when." },
    ],
  },
] as const;

/** A direct link beside the dropdowns — pricing is a destination, not a menu. */
export const HEADER_LINKS: readonly NavItem[] = [
  { href: "/pricing", label: "Pricing" },
] as const;

export const FOOTER_NAV: readonly NavGroup[] = [
  {
    label: "Product",
    items: [
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/methodology", label: "Methodology" },
      { href: "/pricing", label: "Pricing" },
      { href: "/free-scanner", label: "Free scanner" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { href: "/solutions/web-agencies", label: "Web & digital agencies" },
      { href: "/solutions/wordpress-agencies", label: "WordPress agencies" },
      { href: "/solutions/ecommerce-agencies", label: "E-commerce agencies" },
      { href: "/solutions/seo-ppc-agencies", label: "SEO & PPC agencies" },
      { href: "/solutions/saas-agencies", label: "SaaS & product agencies" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/resources", label: "Guides" },
      { href: "/blog", label: "Blog" },
      { href: "/integrations", label: "Integrations" },
      { href: "/security", label: "Security" },
      { href: "/bot", label: "About our scanner" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/legal/disclaimer", label: "Scope of service" },
      { href: "/api/health/ready", label: "System status" },
    ],
  },
] as const;

/** Product signals for the hero trust bar. Capabilities, not customers. */
export const TRUST_BAR: readonly string[] = [
  "Real-browser scanning",
  "Four consent journeys",
  "Technical evidence",
  "Privacy Drift detection",
  "White-label reports",
  "AI-assisted analysis",
] as const;
