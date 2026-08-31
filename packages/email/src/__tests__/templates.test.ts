import { describe, expect, it } from "vitest";
import { FORBIDDEN_TERMS } from "@pdm/shared/copy/terminology";
import { defaultBranding, type Branding } from "@pdm/shared/branding";
import { parseFromAddress } from "../client";
import { renderMessage, type EmailMessage } from "../templates";
import { escapeHtml, toPlainText } from "../html";

/**
 * ⚠️ THE TERMINOLOGY ASSERTION BELOW IS THE POINT OF THIS FILE. Feature doc 13:
 * "Emails are a place banned terminology leaks in, because template copy is
 * often written quickly and outside the app." The CI grep covers the SOURCE;
 * this covers the RENDERED OUTPUT, including anything the layout adds.
 */

const branding: Branding = {
  ...defaultBranding("agency-1", "Northlight Digital"),
  companyName: "Northlight Digital",
  primaryColor: "#2563EB",
  contactEmail: "hello@northlight.test",
  isWhiteLabelled: true,
};

const ctx = { appUrl: "https://app.test", portalUrl: "https://app.test/portal" };

const MESSAGES: EmailMessage[] = [
  { template: "welcome", data: { firstName: "Priya" } },
  {
    template: "invitation",
    data: { agencyName: "Northlight", inviterName: "Priya", acceptPath: "/app" },
  },
  {
    template: "portal-invitation",
    data: { clientName: "Acme", siteLabel: "acme.test", magicLinkPath: "/portal/auth?t=x" },
  },
  { template: "portal-magic-link", data: { magicLinkPath: "/portal/auth?t=x" } },
  {
    template: "scan-completed",
    data: {
      siteLabel: "acme.test",
      websitePath: "/app/websites/1",
      score: 82,
      trackerCount: 7,
      issueCount: 2,
      partial: false,
    },
  },
  {
    template: "critical-issue",
    data: {
      siteLabel: "acme.test",
      issuePath: "/app/issues/1",
      issueTitle: "Tracker detected before consent",
      severity: "CRITICAL",
      severityLabel: "Critical",
      detectedAt: "14 Mar 2026, 09:12",
    },
  },
  {
    template: "consent-regression",
    data: {
      siteLabel: "acme.test",
      driftPath: "/app/drift",
      before: "No trackers fired after Reject All",
      after: "3 trackers fired after Reject All",
      detectedAt: "14 Mar 2026, 09:12",
    },
  },
  {
    template: "daily-digest",
    data: {
      dateLabel: "14 March 2026",
      total: 2,
      omitted: 0,
      groups: [
        {
          websiteLabel: "acme.test",
          topSeverity: "HIGH",
          items: [
            {
              severity: "HIGH",
              severityLabel: "High",
              title: "New tracker detected",
              linkUrl: "/app/issues/1",
            },
          ],
        },
      ],
    },
  },
  {
    template: "weekly-summary",
    data: {
      periodLabel: "9–15 March",
      total: 4,
      omitted: 1,
      websitesMonitored: 18,
      averageScore: 78,
      groups: [],
    },
  },
  {
    template: "website-unreachable",
    data: {
      siteLabel: "acme.test",
      websitePath: "/app/websites/1",
      failures: 3,
      lastError: "ERR_NAME_NOT_RESOLVED",
    },
  },
  {
    template: "report-ready",
    data: {
      reportName: "March monitoring report",
      downloadUrl: "https://s3.test/x",
      reportPath: "/app/reports/1",
      periodLabel: "March 2026",
    },
  },
  {
    template: "client-report-delivery",
    data: { periodLabel: "March 2026", siteLabel: "acme.test", downloadUrl: "https://s3.test/x" },
  },
  {
    template: "report-failed",
    data: { reportName: "March monitoring report", reportPath: "/app/reports/1" },
  },
  { template: "trial-ending", data: { days: 3 } },
  { template: "payment-failed", data: { amountLabel: "$149.00" } },
  {
    template: "subscription-changed",
    data: { planName: "Professional", limits: ["25 websites", "500 scans"] },
  },
  {
    template: "usage-warning",
    data: { metric: "websites", used: "22", limit: "25", percent: 88 },
  },
  { template: "ai-quota-warning", data: { percent: 82 } },
  { template: "support-received", data: { message: "How do I add a website?" } },
];

describe("email templates", () => {
  it("covers all 19 templates from §9.5", () => {
    expect(new Set(MESSAGES.map((m) => m.template)).size).toBe(19);
  });

  it.each(MESSAGES.map((m) => [m.template, m] as const))(
    "%s renders a subject, html and text",
    (_name, message) => {
      const rendered = renderMessage(message, branding, ctx);
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.html).toContain("<!doctype html>");
      expect(rendered.text.length).toBeGreaterThan(0);
      // No unsubstituted placeholders escaped into the output.
      expect(rendered.subject).not.toMatch(/\{[a-z]+\}/i);
      expect(rendered.html).not.toMatch(/\{[a-z]+\}/i);
    },
  );

  it.each(MESSAGES.map((m) => [m.template, m] as const))(
    "%s contains no banned terminology",
    (_name, message) => {
      const rendered = renderMessage(message, branding, ctx);
      const haystack = `${rendered.subject}\n${rendered.text}`.toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        // Whole-word match, the same rule the CI grep applies.
        const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        expect(pattern.test(haystack), `"${term}" in ${message.template}`).toBe(false);
      }
    },
  );

  it("carries the disclaimer on client-facing mail only", () => {
    const clientFacing = renderMessage(
      { template: "portal-magic-link", data: { magicLinkPath: "/portal/auth?t=x" } },
      branding,
      ctx,
    );
    const internal = renderMessage({ template: "trial-ending", data: { days: 3 } }, branding, ctx);
    expect(clientFacing.text).toContain("not legal advice");
    expect(internal.text).not.toContain("not legal advice");
  });

  it("offers an unsubscribe on digests and never on billing mail", () => {
    const digestCtx = { ...ctx, unsubscribeUrl: "https://app.test/unsub" };
    const digest = renderMessage(
      {
        template: "daily-digest",
        data: { dateLabel: "14 March", total: 0, omitted: 0, groups: [] },
      },
      branding,
      digestCtx,
    );
    const billing = renderMessage(
      { template: "payment-failed", data: { amountLabel: "$149.00" } },
      branding,
      digestCtx,
    );
    expect(digest.html).toContain("https://app.test/unsub");
    expect(billing.html).not.toContain("https://app.test/unsub");
  });

  it("uses the agency's brand colour and company name", () => {
    const rendered = renderMessage({ template: "welcome", data: { firstName: null } }, branding, ctx);
    expect(rendered.html).toContain("#2563EB");
    expect(rendered.html).toContain("Northlight Digital");
  });

  it("falls back to a wordmark when there is no logo", () => {
    const rendered = renderMessage({ template: "welcome", data: { firstName: null } }, branding, ctx);
    expect(rendered.html).not.toContain("<img");
  });

  it("never reports a clean score for a PARTIAL scan", () => {
    const rendered = renderMessage(
      {
        template: "scan-completed",
        data: {
          siteLabel: "acme.test",
          websitePath: "/app/websites/1",
          score: 82,
          trackerCount: 1,
          issueCount: 0,
          partial: true,
        },
      },
      branding,
      ctx,
    );
    expect(rendered.text).toContain("Could not be determined");
    expect(rendered.text).not.toContain("82");
  });
});

describe("html escaping", () => {
  it("escapes interpolated user input", () => {
    const rendered = renderMessage(
      {
        template: "critical-issue",
        data: {
          siteLabel: '<script>alert("x")</script>',
          issuePath: "/app/issues/1",
          issueTitle: "Tracker detected before consent",
          severity: "CRITICAL",
          severityLabel: "Critical",
          detectedAt: "now",
        },
      },
      branding,
      ctx,
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("reduces markup to readable text", () => {
    expect(toPlainText("<p>Hello <b>world</b></p><p>Second</p>")).toBe("Hello world\nSecond");
  });
});

/**
 * ⚠️ THIS BLOCK EXISTS BECAUSE THE BUG IT COVERS SURVIVED A GREEN TEST SUITE.
 *
 * `EMAIL_FROM` ships in `.env.example` as `"Privacy Drift Monitor
 * <alerts@example.com>"`, and that file is the contract. The transport read it
 * as a BARE address and wrapped it again, producing
 * `Privacy Drift Monitor <Privacy Drift Monitor <alerts@example.com>>`.
 *
 * Nothing caught it because with no `RESEND_API_KEY` every send short-circuits
 * to `simulated` before the From header is ever composed — so the whole email
 * suite passed while the one thing that talks to the provider was malformed.
 * That is the shape of defect worth a permanent test.
 */
describe("from-address parsing", () => {
  it("splits the RFC 5322 form `.env.example` ships", () => {
    expect(parseFromAddress('"Privacy Drift Monitor <alerts@example.com>"', "Fallback")).toEqual({
      name: "Privacy Drift Monitor",
      email: "alerts@example.com",
    });
  });

  it("handles the same value without surrounding quotes", () => {
    expect(parseFromAddress("Privacy Drift Monitor <alerts@example.com>", "Fallback")).toEqual({
      name: "Privacy Drift Monitor",
      email: "alerts@example.com",
    });
  });

  it("accepts a bare address and supplies the fallback name", () => {
    // An operator who sets a bare address is not wrong — they just did not
    // include a display name.
    expect(parseFromAddress("alerts@example.com", "Privacy Drift Monitor")).toEqual({
      name: "Privacy Drift Monitor",
      email: "alerts@example.com",
    });
  });

  it("falls back when the display name is empty", () => {
    expect(parseFromAddress("<alerts@example.com>", "Privacy Drift Monitor")).toEqual({
      name: "Privacy Drift Monitor",
      email: "alerts@example.com",
    });
  });

  it("never yields an address that still contains angle brackets", () => {
    // The exact shape of the original defect: a re-wrapped address.
    for (const input of [
      '"Privacy Drift Monitor <alerts@example.com>"',
      "Privacy Drift Monitor <alerts@example.com>",
      "alerts@example.com",
    ]) {
      const parsed = parseFromAddress(input, "Fallback");
      expect(parsed.email).not.toContain("<");
      expect(parsed.email).not.toContain(">");
      expect(parsed.email).toContain("@");
    }
  });
});
