/**
 * PRODUCT CHANGELOG — PLAN.md §3.2, Phase 7 task 7.10.
 *
 * ⚠️ STRUCTURED TYPESCRIPT: keeps changelog entries in source control,
 * walked by `scripts/check-terminology.ts` to ensure clean technical language.
 */

export interface ChangelogItem {
  category: "feature" | "improvement" | "fix" | "security";
  description: string;
}

export interface ChangelogEntry {
  version: string;
  title: string;
  date: string; // ISO date format YYYY-MM-DD
  lead: string;
  items: readonly ChangelogItem[];
}

export const CHANGELOG_ENTRIES: readonly ChangelogEntry[] = [
  {
    version: "v1.0.0",
    title: "Launch Readiness, Hardening & Public Scanner",
    date: "2026-09-01",
    lead: "Complete end-to-end launch hardening, including multi-tier security reviews, automated restore drills, WCAG 2.2 AA accessibility validations, and automated deployment pipelines.",
    items: [
      {
        category: "feature",
        description: "Public free scanner with Turnstile protection, isolated low-priority queue, and instant scan summaries.",
      },
      {
        category: "security",
        description: "Multi-layered SSRF guard active on all navigation requests, redirects, and subresource queries.",
      },
      {
        category: "security",
        description: "Strict Content Security Policy (CSP) with cryptographic nonces on authenticated and dynamic surfaces.",
      },
      {
        category: "improvement",
        description: "WCAG 2.2 AA contrast compliance verified across all light and dark theme semantic design tokens.",
      },
      {
        category: "improvement",
        description: "Database disaster recovery drill verified with automated restore verification script.",
      },
    ],
  },
  {
    version: "v0.9.0",
    title: "AI Analysis Layer & Grounded Explanations",
    date: "2026-08-20",
    lead: "Additive AI analysis providing technical summaries and developer remediation notes, strictly grounded in recorded scan evidence.",
    items: [
      {
        category: "feature",
        description: "Grounded AI explanation cards with verifiable evidence references on issue detail pages.",
      },
      {
        category: "feature",
        description: "Drift narrative summaries explaining consent setup changes between consecutive scans.",
      },
      {
        category: "improvement",
        description: "Strict terminology validator rejecting unsupported legal claims or unverified statements.",
      },
      {
        category: "improvement",
        description: "Pre-call budget enforcement and semantic caching via deterministic input hashing.",
      },
    ],
  },
  {
    version: "v0.8.0",
    title: "Agency Workflow, Reports & Client Portal",
    date: "2026-08-05",
    lead: "White-label client reporting, email notification system with digest options, and secure magic-link client portal.",
    items: [
      {
        category: "feature",
        description: "Five automated report types with Playwright PDF rendering and custom agency branding.",
      },
      {
        category: "feature",
        description: "Secure, passwordless client portal with time-limited magic links and client-safe serializers.",
      },
      {
        category: "feature",
        description: "Customizable notification alerts, quiet hours, and batch daily/weekly digest emails.",
      },
      {
        category: "improvement",
        description: "Verification re-scan workflow allowing instant confirmation of fixed tracker setups.",
      },
    ],
  },
  {
    version: "v0.7.0",
    title: "Intelligence, Rule Engine & Privacy Drift",
    date: "2026-07-20",
    lead: "Deterministic classification engine, 25 launch detection rules, and normalized drift diffing across scan history.",
    items: [
      {
        category: "feature",
        description: "25 built-in privacy monitoring rules detecting unconsented trackers, third-party calls, and cookie behavior.",
      },
      {
        category: "feature",
        description: "Explainable health score model with itemized deductions and partial-scan safeguards.",
      },
      {
        category: "feature",
        description: "Privacy drift engine detecting tag manager changes, new trackers, and consent mechanism shifts.",
      },
      {
        category: "improvement",
        description: "Comprehensive tracker vendor database with over 250 verified classification entries.",
      },
    ],
  },
];
