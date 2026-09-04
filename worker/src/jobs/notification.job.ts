import { unsafeGlobalClient } from "@pdm/database";
import { repositoriesFor } from "@pdm/database/repositories";
import { renderMessage, type EmailMessage } from "@pdm/email";
import {
  DEFAULT_TRIGGER_TYPES,
  DUPLICATE_WINDOW_MS,
  planDispatch,
  sendSlackAlert,
  type AlertEvent,
  type AlertRuleSpec,
  type AlertScopeType,
  type RecipientSpec,
} from "@pdm/notifications";
import { resolveBranding } from "@pdm/reports/branding";
import {
  enqueueEmail,
  type EmailJobData,
  type NotificationJobData,
} from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";

/**
 * ALERT DISPATCHER — PLAN.md Part VI §6.6, Phase 4 task 4.2.
 *
 * The pipeline §6.6 specifies, in order:
 *
 *   rule fires → notification job → resolve matching AlertRules → per recipient,
 *   resolve NotificationPreference → apply quiet hours and digest →
 *   deliver (in-app row, and/or email job) → record AlertHistory
 *
 * ⚠️ THE IN-APP ROWS ARE WRITTEN BEFORE ANY EMAIL WORK IS ATTEMPTED, and no
 * email failure can unwind them. §12.3: "in-app notifications are unaffected by
 * a Resend outage." The ordering below IS that requirement — a shared code path
 * would let a thrown send take the notification centre down with it.
 *
 * ⚠️ THE DECISION IS PURE AND LIVES IN `@pdm/notifications`. This file is the
 * I/O around it: read rules, read recipients, write rows, enqueue email. Quiet
 * hours across DST and the four-hour window are unit-tested there, without a
 * database.
 */

const globalDb = unsafeGlobalClient(
  // Justification (required in review): the agency's timezone drives quiet
  // hours and digests, and `Agency` is a GLOBAL model the tenant extension
  // does not scope. Everything tenant-owned below goes through
  // `repositoriesFor`.
  "agency timezone lookup — Agency is a global model",
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? `${APP_URL}/portal`;

export interface DispatchDeps {
  emailQueue: Queue<EmailJobData>;
  now?: () => Date;
}

export async function dispatchNotification(
  data: NotificationJobData,
  deps: DispatchDeps,
): Promise<{ inApp: number; emails: number; suppressed: string[] }> {
  const now = deps.now?.() ?? new Date();
  const log = childLogger({ agencyId: data.agencyId, component: "alerts" });

  const repos = repositoriesFor(data.agencyId);

  const agency = await globalDb.agency.findUnique({
    where: { id: data.agencyId },
    select: { timezone: true, name: true, status: true },
  });

  // A suspended or deleted agency is not alerted. Their monitoring is paused;
  // emailing them about findings they cannot open is noise plus a support ticket.
  if (!agency || agency.status !== "ACTIVE") {
    log.info({ status: agency?.status ?? "MISSING" }, "alert skipped: agency not active");
    return { inApp: 0, emails: 0, suppressed: ["agency_inactive"] };
  }

  const event: AlertEvent = {
    agencyId: data.agencyId,
    type: data.type as AlertEvent["type"],
    severity: data.severity as AlertEvent["severity"],
    title: data.title,
    body: data.body,
    linkUrl: data.linkUrl,
    entityType: data.entityType,
    entityId: data.entityId,
    websiteId: data.websiteId,
    websiteGroupId: data.websiteGroupId,
    clientId: data.clientId,
    websiteLabel: data.websiteLabel,
  };

  const [ruleRows, memberRows, lastSentAt] = await Promise.all([
    repos.alerts.activeRules(),
    repos.notifications.membersWithPreferences(event.type),
    repos.alerts.lastSentAt({
      type: event.type,
      entityId: event.entityId,
      since: new Date(now.getTime() - DUPLICATE_WINDOW_MS),
    }),
  ]);

  const rules: AlertRuleSpec[] = ruleRows.map((row) => ({
    id: row.id,
    enabled: row.enabled,
    scopeType: row.scopeType as AlertScopeType,
    scopeId: row.scopeId,
    triggerTypes: row.triggerTypes,
    minSeverity: row.minSeverity,
    channels: row.channels,
    digest: row.digest,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    criticalOverridesQuietHours: row.criticalOverridesQuietHours,
    recipients: row.recipients,
  }));

  /*
   * ⚠️ A MEMBER WITH NO `NotificationPreference` ROW IS NOT OPTED OUT. The
   * absence means "never chosen", and the default is the §6.6 starter set —
   * resolved HERE, where the absence is still visible, rather than by writing
   * preference rows for every member on signup (which would then have to be
   * back-filled every time a notification type is added).
   */
  const recipients: RecipientSpec[] = memberRows.map((member) => {
    const preference = member.preference;
    const defaultOn = DEFAULT_TRIGGER_TYPES.includes(event.type);
    return {
      userId: member.userId,
      email: member.email,
      emailUndeliverable: member.emailUndeliverable,
      websiteScope: member.websiteScope,
      inApp: preference?.inApp ?? true,
      email_: preference?.email ?? defaultOn,
      digest: preference?.digest ?? "IMMEDIATE",
    };
  });

  const plan = planDispatch({
    event,
    rules,
    recipients,
    context: { now, timeZone: agency.timezone, lastSentAt },
  });

  if (plan.suppressed.some((entry) => entry.reason === "duplicate_window")) {
    // Recorded, never silent — the History tab has to be able to explain why an
    // agency did not get a second email about the same finding.
    await repos.alerts.recordHistory({
      alertRuleId: null,
      type: event.type,
      channel: "none",
      recipients: [],
      entityType: event.entityType,
      entityId: event.entityId,
      status: "suppressed_duplicate",
      idempotencyKey: `${data.dedupeKey}:dup:${now.toISOString().slice(0, 13)}`,
    });
    log.info({ type: event.type, entityId: event.entityId }, "alert suppressed as duplicate");
    return { inApp: 0, emails: 0, suppressed: ["duplicate_window"] };
  }

  // ── 1. In-app first, and independent of everything below ────────────────
  const inAppCount = await repos.notifications.createMany(plan.inApp);

  // ── 2. Email ─────────────────────────────────────────────────────────────
  let emailCount = 0;

  if (plan.emails.length > 0) {
    // Branding is resolved ONCE per event, by explicit agencyId (§6.9), and
    // handed to every render as a parameter. Never read inside a template.
    const branding = await resolveBranding(data.agencyId, {
      // Client-facing branding only applies to portal and report mail; an
      // internal alert to the agency's own staff uses our brand either way
      // (§6.9: "the agency app itself is not white-labeled").
      whiteLabelEnabled: false,
    });

    for (const delivery of plan.emails) {
      /*
       * ⚠️ A DIGEST RECIPIENT GETS NO EMAIL NOW. §6.6: the in-app row is
       * written immediately (done above) and the item is picked up by the next
       * digest run, which reads the notification rows rather than a separate
       * pending table.
       */
      if (delivery.digest) {
        await repos.alerts.recordHistory({
          alertRuleId: delivery.ruleId,
          type: event.type,
          channel: "email",
          recipients: [delivery.email],
          entityType: event.entityType,
          entityId: event.entityId,
          status: `deferred_${delivery.digest.toLowerCase()}_digest`,
        });
        continue;
      }

      const message = toEmailMessage(event);
      if (!message) continue;

      // Idempotency key (§9.5). Includes the address so two recipients of the
      // same alert are two sends, not one that collides with itself.
      const idempotencyKey = `${data.dedupeKey}:${delivery.email}`;
      if (await repos.alerts.hasBeenSent(idempotencyKey)) {
        log.info({ idempotencyKey }, "email already sent; skipping");
        continue;
      }

      const rendered = renderMessage(message, branding, {
        appUrl: APP_URL,
        portalUrl: PORTAL_URL,
      });

      await enqueueEmail(
        deps.emailQueue,
        {
          agencyId: data.agencyId,
          message: message as unknown,
          to: delivery.email,
          userId: delivery.userId,
          alertRuleId: delivery.ruleId,
          notificationType: event.type,
          entityType: event.entityType,
          entityId: event.entityId,
          idempotencyKey,
        },
        { deliverAt: delivery.deliverAt },
      );

      await repos.alerts.recordHistory({
        alertRuleId: delivery.ruleId,
        type: event.type,
        channel: "email",
        recipients: [delivery.email],
        entityType: event.entityType,
        entityId: event.entityId,
        // ⚠️ Deferral is recorded as its own status, not as a failure. §6.6
        // requires quiet hours to DEFER; the history has to show that it did.
        status: delivery.deferredByQuietHours ? "suppressed_quiet_hours" : "queued",
        idempotencyKey,
      });

      // The rendered subject is logged, not stored: the body can carry a
      // client's website and findings, and the alert history is a delivery
      // record, not a second copy of the evidence (§10.6).
      log.info(
        { to: delivery.email, subject: rendered.subject, deferred: delivery.deferredByQuietHours },
        "alert email queued",
      );
      emailCount += 1;
    }
  }

  // ── 3. Slack notification ────────────────────────────────────────────────
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  const hasSlackRule = rules.some((r) => r.channels.includes("slack"));
  if (slackWebhookUrl || hasSlackRule) {
    const targetUrl = slackWebhookUrl;
    if (targetUrl) {
      try {
        await sendSlackAlert({
          webhookUrl: targetUrl,
          websiteUrl: data.linkUrl ? `${APP_URL}${data.linkUrl}` : APP_URL,
          websiteLabel: data.websiteLabel ?? undefined,
          title: data.title,
          severity: data.severity,
          body: data.body,
          dashboardUrl: data.linkUrl ? `${APP_URL}${data.linkUrl}` : undefined,
        });
        log.info({ type: event.type }, "slack alert dispatched");
      } catch (err) {
        log.warn({ err }, "slack alert dispatch failed");
      }
    }
  }

  return {
    inApp: inAppCount,
    emails: emailCount,
    suppressed: plan.suppressed.map((entry) => entry.reason),
  };
}

/**
 * Maps an alert event onto the email template that carries it.
 *
 * ⚠️ Returns null for types that have no email of their own — they still
 * produced an in-app row above, and they appear in the digest. Inventing a
 * generic "something happened" email for them is how an inbox becomes noise.
 */
function toEmailMessage(event: AlertEvent): EmailMessage | null {
  const site = event.websiteLabel ?? "your website";
  const detectedAt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date());

  switch (event.type) {
    case "CRITICAL_ISSUE":
      return {
        template: "critical-issue",
        data: {
          siteLabel: site,
          issuePath: event.linkUrl ?? "/app/issues",
          issueTitle: event.title,
          severity: event.severity,
          severityLabel: event.severity[0] + event.severity.slice(1).toLowerCase(),
          detectedAt,
        },
      };
    case "CONSENT_REGRESSION":
      return {
        template: "consent-regression",
        data: {
          siteLabel: site,
          driftPath: event.linkUrl ?? "/app/drift",
          before: "Recorded on the previous scan",
          after: event.body,
          detectedAt,
        },
      };
    case "WEBSITE_UNREACHABLE":
      return {
        template: "website-unreachable",
        data: {
          siteLabel: site,
          websitePath: event.linkUrl ?? "/app/websites",
          failures: 3,
          lastError: event.body,
        },
      };
    case "REPORT_READY":
      return {
        template: "report-ready",
        data: {
          reportName: event.title,
          downloadUrl: `${APP_URL}${event.linkUrl ?? "/app/reports"}`,
          reportPath: event.linkUrl ?? "/app/reports",
          periodLabel: event.body,
        },
      };
    case "REPORT_FAILED":
      return {
        template: "report-failed",
        data: { reportName: event.title, reportPath: event.linkUrl ?? "/app/reports" },
      };
    default:
      // NEW_TRACKER, PRIVACY_DRIFT, SCAN_PARTIAL and the account types reach
      // the recipient in-app and in the digest. Deliberate (§6.6): an email per
      // new tracker across a 200-site portfolio is the alert fatigue that kills
      // the product.
      return null;
  }
}
