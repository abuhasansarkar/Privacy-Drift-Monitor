import type { Branding } from "@pdm/shared/branding";
import { emailCopy, fill } from "../copy/en";
import { html, raw, toPlainText, type SafeHtml } from "../html";
import { factTable, list, muted, p, renderLayout, severityChip } from "../layout";

/**
 * THE 19 TRANSACTIONAL TEMPLATES — PLAN.md Part IX §9.5.
 *
 * ⚠️ ONE DISCRIMINATED UNION, NOT 19 EXPORTED FUNCTIONS. The email queue
 * carries these payloads across a process boundary, so the template name and
 * its data have to be checkable together: `{ template: "report-ready" }` with a
 * digest's payload must be a TYPE error, not a blank email discovered by a
 * customer.
 *
 * ⚠️ EVERY TEMPLATE TAKES `branding` EXPLICITLY (§6.9). No ambient brand.
 */

export interface EmailContext {
  /** Absolute origin for app links, e.g. `https://app.driftmonitor.test`. */
  appUrl: string;
  /** Absolute origin for portal links. Path-based `/portal` in v1 (§12.9 Q2). */
  portalUrl: string;
  /** Present on digest and summary mail only — never on security or billing. */
  unsubscribeUrl?: string | null;
}

export interface DigestGroupPayload {
  websiteLabel: string;
  topSeverity: string;
  items: { severity: string; severityLabel: string; title: string; linkUrl: string | null }[];
}

export type EmailMessage =
  | { template: "welcome"; data: { firstName: string | null } }
  | {
      template: "invitation";
      data: { agencyName: string; inviterName: string; acceptPath: string };
    }
  | {
      template: "portal-invitation";
      data: { clientName: string; siteLabel: string; magicLinkPath: string };
    }
  | { template: "portal-magic-link"; data: { magicLinkPath: string } }
  | {
      template: "scan-completed";
      data: {
        siteLabel: string;
        websitePath: string;
        score: number | null;
        trackerCount: number;
        issueCount: number;
        partial: boolean;
      };
    }
  | {
      template: "critical-issue";
      data: {
        siteLabel: string;
        issuePath: string;
        issueTitle: string;
        severity: string;
        severityLabel: string;
        detectedAt: string;
      };
    }
  | {
      template: "consent-regression";
      data: {
        siteLabel: string;
        driftPath: string;
        before: string;
        after: string;
        detectedAt: string;
      };
    }
  | {
      template: "daily-digest";
      data: { groups: DigestGroupPayload[]; total: number; omitted: number; dateLabel: string };
    }
  | {
      template: "weekly-summary";
      data: {
        groups: DigestGroupPayload[];
        total: number;
        omitted: number;
        websitesMonitored: number;
        averageScore: number | null;
        periodLabel: string;
      };
    }
  | {
      template: "website-unreachable";
      data: { siteLabel: string; websitePath: string; failures: number; lastError: string };
    }
  | {
      template: "report-ready";
      data: { reportName: string; downloadUrl: string; reportPath: string; periodLabel: string };
    }
  | {
      template: "client-report-delivery";
      data: { periodLabel: string; siteLabel: string; downloadUrl: string };
    }
  | { template: "report-failed"; data: { reportName: string; reportPath: string } }
  | { template: "trial-ending"; data: { days: number } }
  | { template: "payment-failed"; data: { amountLabel: string } }
  | { template: "subscription-changed"; data: { planName: string; limits: string[] } }
  | {
      template: "usage-warning";
      data: { metric: string; used: string; limit: string; percent: number };
    }
  /**
   * ⚠️ TWO TEMPLATES §9.5's TABLE DOES NOT LIST, added for §9.2's grace rule,
   * which requires "an email listing exactly which ones and how to restore
   * them". The precedent is `report-failed`, which is also ours rather than
   * the table's. Both are billing mail, so neither carries an unsubscribe.
   */
  | { template: "grace-started"; data: { excess: number; days: number } }
  | {
      template: "grace-paused";
      data: { limit: number; count: number; siteLabels: string[] };
    }
  | { template: "ai-quota-warning"; data: { percent: number } }
  | { template: "support-received"; data: { message: string } };

export type EmailTemplateName = EmailMessage["template"];

export interface RenderedEmail {
  subject: string;
  html: string;
  /** Never omitted — see `toPlainText` in html.ts for why. */
  text: string;
}

/** Digest and summary mail are the only categories with an unsubscribe (§9.5). */
const UNSUBSCRIBABLE: ReadonlySet<EmailTemplateName> = new Set([
  "daily-digest",
  "weekly-summary",
]);

/** Client-facing mail always carries the disclaimer (§6.8). */
const CLIENT_FACING: ReadonlySet<EmailTemplateName> = new Set([
  "portal-invitation",
  "portal-magic-link",
  "client-report-delivery",
]);

function absolute(origin: string, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = origin.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/portal") && cleanPath.startsWith("/portal/")) {
    return `${base}${cleanPath.slice("/portal".length)}`;
  }
  return `${base}${cleanPath}`;
}

function digestBody(
  groups: readonly DigestGroupPayload[],
  omitted: number,
  origin: string,
): SafeHtml {
  if (groups.length === 0) return p(emailCopy.dailyDigest.nothing);

  const sections = groups.map(
    (group) => html`<div style="margin:0 0 18px;">
      <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0F172A;">
        ${group.websiteLabel}
      </p>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#0F172A;">
        ${group.items.map(
          (item) => html`<li>
            ${severityChip(item.severity, item.severityLabel)}
            ${item.linkUrl
              ? html`<a href="${absolute(origin, item.linkUrl)}" style="color:#1D4ED8;"
                  >${item.title}</a
                >`
              : html`${item.title}`}
          </li>`,
        )}
      </ul>
    </div>`,
  );

  const more =
    omitted > 0
      ? muted(fill(emailCopy.dailyDigest.andMore, { count: omitted }))
      : raw("");

  return html`${sections}${more}`;
}

/**
 * Renders one message.
 *
 * ⚠️ The `switch` is EXHAUSTIVE and the default arm is a compile-time
 * `never` check — adding a template to the union without a body here is a type
 * error, not a runtime blank.
 */
export function renderMessage(
  message: EmailMessage,
  branding: Branding,
  ctx: EmailContext,
): RenderedEmail {
  const app = ctx.appUrl;
  const portal = ctx.portalUrl;
  const shared = {
    branding,
    showDisclaimer: CLIENT_FACING.has(message.template),
    unsubscribeUrl: UNSUBSCRIBABLE.has(message.template)
      ? (ctx.unsubscribeUrl ?? null)
      : null,
  };

  switch (message.template) {
    case "welcome": {
      const c = emailCopy.welcome;
      const greeting = message.data.firstName ? `Hi ${message.data.firstName} — ` : "";
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: c.heading,
        body: html`${p(`${greeting}${c.intro}`)}${list(c.steps)}`,
        cta: { label: c.cta, url: absolute(app, "/app/websites/new") },
      });
    }

    case "invitation": {
      const c = emailCopy.invitation;
      const values = {
        agency: message.data.agencyName,
        inviter: message.data.inviterName,
      };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: c.intro,
        heading: fill(c.heading, values),
        body: html`${p(c.intro)}${muted(c.expiry)}`,
        cta: { label: c.cta, url: absolute(app, message.data.acceptPath) },
      });
    }

    case "portal-invitation": {
      const c = emailCopy.portalInvitation;
      const values = { company: branding.companyName, site: message.data.siteLabel };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: c.heading,
        body: html`${p(fill(c.intro, values))}${branding.portalWelcomeText
          ? p(branding.portalWelcomeText)
          : raw("")}${muted(c.expiry)}`,
        cta: { label: c.cta, url: absolute(portal, message.data.magicLinkPath) },
      });
    }

    case "portal-magic-link": {
      const c = emailCopy.portalMagicLink;
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: c.heading,
        body: html`${p(c.intro)}${muted(c.expiry)}${muted(c.ignore)}`,
        cta: { label: c.cta, url: absolute(portal, message.data.magicLinkPath) },
      });
    }

    case "scan-completed": {
      const c = emailCopy.scanCompleted;
      const d = message.data;
      const values = { site: d.siteLabel };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: fill(c.heading, values),
        body: html`${p(c.intro)}${factTable([
          {
            label: "Privacy health score",
            // ⚠️ A PARTIAL scan never renders a clean number (P5). "Could not be
            // determined" is the approved outcome word for exactly this.
            value: d.partial
              ? "Could not be determined — some consent journeys were not completed"
              : d.score !== null
                ? String(d.score)
                : "Could not be determined",
          },
          { label: "Trackers detected", value: String(d.trackerCount) },
          { label: "Potential issues", value: String(d.issueCount) },
        ])}`,
        cta: { label: c.cta, url: absolute(app, d.websitePath) },
      });
    }

    case "critical-issue": {
      const c = emailCopy.criticalIssue;
      const d = message.data;
      const values = { site: d.siteLabel };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: d.issueTitle,
        heading: fill(c.heading, values),
        body: html`${p(c.intro)}${factTable([
          { label: "Finding", value: d.issueTitle },
          { label: "Severity", value: d.severityLabel },
          { label: "Website", value: d.siteLabel },
          { label: "Detected", value: d.detectedAt },
        ])}${muted(c.evidenceNote)}`,
        cta: { label: c.cta, url: absolute(app, d.issuePath) },
      });
    }

    case "consent-regression": {
      const c = emailCopy.consentRegression;
      const d = message.data;
      return finish(fill(c.subject, { site: d.siteLabel }), {
        ...shared,
        preview: c.heading,
        heading: c.heading,
        body: html`${p(c.intro)}${factTable([
          { label: "Website", value: d.siteLabel },
          { label: "Previously", value: d.before },
          { label: "Now", value: d.after },
          { label: "Detected", value: d.detectedAt },
        ])}`,
        cta: { label: c.cta, url: absolute(app, d.driftPath) },
      });
    }

    case "daily-digest": {
      const c = emailCopy.dailyDigest;
      const d = message.data;
      return finish(`${c.subject} — ${d.dateLabel}`, {
        ...shared,
        preview: `${d.total} detected across your portfolio`,
        heading: c.heading,
        body: html`${p(c.intro)}${digestBody(d.groups, d.omitted, app)}`,
        cta: { label: c.cta, url: absolute(app, "/app") },
      });
    }

    case "weekly-summary": {
      const c = emailCopy.weeklySummary;
      const d = message.data;
      return finish(`${c.subject} — ${d.periodLabel}`, {
        ...shared,
        preview: `${d.websitesMonitored} websites monitored`,
        heading: c.heading,
        body: html`${p(c.intro)}${factTable([
          { label: "Websites monitored", value: String(d.websitesMonitored) },
          {
            label: "Average privacy health score",
            value: d.averageScore !== null ? String(d.averageScore) : "Could not be determined",
          },
          { label: "Detected this week", value: String(d.total) },
        ])}${digestBody(d.groups, d.omitted, app)}`,
        cta: { label: c.cta, url: absolute(app, "/app") },
      });
    }

    case "website-unreachable": {
      const c = emailCopy.websiteUnreachable;
      const d = message.data;
      const values = { site: d.siteLabel };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: fill(c.heading, values),
        body: html`${p(c.intro)}${factTable([
          { label: "Consecutive failures", value: String(d.failures) },
          { label: "Last error", value: d.lastError },
        ])}`,
        cta: { label: c.cta, url: absolute(app, d.websitePath) },
      });
    }

    case "report-ready": {
      const c = emailCopy.reportReady;
      const d = message.data;
      return finish(c.subject, {
        ...shared,
        preview: d.reportName,
        heading: fill(c.heading, { name: d.reportName }),
        body: html`${p(c.intro)}${factTable([
          { label: "Report", value: d.reportName },
          { label: "Period", value: d.periodLabel },
        ])}${muted(c.expiry)}`,
        cta: { label: c.cta, url: d.downloadUrl },
      });
    }

    case "client-report-delivery": {
      const c = emailCopy.clientReportDelivery;
      const d = message.data;
      const values = { company: branding.companyName, period: d.periodLabel };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: fill(c.heading, values),
        body: html`${p(fill(c.intro, values))}${factTable([
          { label: "Website", value: d.siteLabel },
          { label: "Period", value: d.periodLabel },
        ])}`,
        cta: { label: "Download your report", url: d.downloadUrl },
      });
    }

    case "report-failed": {
      const c = emailCopy.reportFailed;
      const d = message.data;
      return finish(c.subject, {
        ...shared,
        preview: c.heading,
        heading: c.heading,
        body: p(fill(c.intro, { name: d.reportName })),
        cta: { label: c.cta, url: absolute(app, d.reportPath) },
      });
    }

    case "trial-ending": {
      const c = emailCopy.trialEnding;
      const values = { days: message.data.days };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: c.intro,
        heading: fill(c.heading, values),
        body: p(c.intro),
        cta: { label: c.cta, url: absolute(app, "/app/billing") },
      });
    }

    case "payment-failed": {
      const c = emailCopy.paymentFailed;
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: c.heading,
        body: html`${p(c.intro)}${factTable([
          { label: "Amount", value: message.data.amountLabel },
        ])}`,
        cta: { label: c.cta, url: absolute(app, "/app/billing") },
      });
    }

    case "subscription-changed": {
      const c = emailCopy.subscriptionChanged;
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: fill(c.heading, { plan: message.data.planName }),
        body: html`${p(c.intro)}${list(message.data.limits)}`,
        cta: { label: c.cta, url: absolute(app, "/app/billing") },
      });
    }

    case "usage-warning": {
      const c = emailCopy.usageWarning;
      const d = message.data;
      const values = { percent: d.percent, metric: d.metric, used: d.used, limit: d.limit };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: c.heading,
        body: p(fill(c.intro, values)),
        cta: { label: c.cta, url: absolute(app, "/app/billing") },
      });
    }

    case "grace-started": {
      const c = emailCopy.graceStarted;
      const values = { excess: message.data.excess, days: message.data.days };
      return finish(c.subject, {
        ...shared,
        preview: fill(c.intro, values),
        heading: fill(c.heading, values),
        body: p(fill(c.intro, values)),
        cta: { label: c.cta, url: absolute(app, "/app/billing") },
      });
    }

    case "grace-paused": {
      const c = emailCopy.gracePaused;
      const values = { count: message.data.count, limit: message.data.limit };
      return finish(fill(c.subject, values), {
        ...shared,
        preview: fill(c.intro, values),
        heading: c.heading,
        /*
         * ⚠️ THE LIST IS THE POINT OF THIS EMAIL. §9.2 asks for one "listing
         * exactly which ones"; a message that says "some sites were paused"
         * makes the recipient go and diff their portfolio by hand.
         */
        body: html`${p(fill(c.intro, values))}${list(message.data.siteLabels)}`,
        cta: { label: c.cta, url: absolute(app, "/app/websites") },
      });
    }

    case "ai-quota-warning": {
      const c = emailCopy.aiQuotaWarning;
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: c.heading,
        // ⚠️ P3: AI is additive. This email says so explicitly, because the
        // first thing an agency assumes when credits run out is that
        // monitoring stopped.
        body: p(c.intro),
        cta: { label: c.cta, url: absolute(app, "/app/settings/ai") },
      });
    }

    case "support-received": {
      const c = emailCopy.supportReceived;
      return finish(c.subject, {
        ...shared,
        preview: c.intro,
        heading: c.heading,
        body: html`${p(c.intro)}${factTable([
          { label: "Your message", value: message.data.message },
        ])}`,
        cta: { label: c.cta, url: absolute(app, "/app") },
      });
    }

    default: {
      // Exhaustiveness guard. A new template with no arm fails to compile here.
      const unreachable: never = message;
      throw new Error(`Unhandled email template: ${JSON.stringify(unreachable)}`);
    }
  }
}

function finish(
  subject: string,
  options: Parameters<typeof renderLayout>[0],
): RenderedEmail {
  const markup = renderLayout(options);
  // The text part is derived, never hand-maintained: two copies of the same
  // message drift, and the one nobody looks at is the plain-text one.
  return { subject, html: markup, text: toPlainText(markup) };
}

export { renderLayout };
