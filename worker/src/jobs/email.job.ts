import { repositoriesFor } from "@pdm/database/repositories";
import {
  createResendTransport,
  renderMessage,
  resendConfigFromEnv,
  type EmailMessage,
  type EmailTransport,
} from "@pdm/email";
import { resolveBranding } from "@pdm/reports/branding";
import type { EmailJobData } from "@pdm/scanner/queue/queues";
import { childLogger } from "@pdm/shared/logger";

/**
 * EMAIL JOB — PLAN.md Part IX §9.5, Phase 4 task 4.3.
 *
 * ⚠️ EVERY SEND IS IDEMPOTENT AGAINST `AlertHistory` (§9.5). BullMQ retries on
 * failure and a job can be replayed after a worker dies mid-send; without the
 * check below, a Resend timeout that actually delivered would send again on
 * every one of the eight attempts.
 *
 * ⚠️ THE MESSAGE IS RE-RENDERED HERE, NOT CARRIED AS HTML. A 40 KB HTML body in
 * a Redis job payload is expensive, and re-rendering means a template fix
 * reaches queued mail. The BRANDING is resolved fresh by explicit `agencyId`
 * for the same reason it always is (§6.9).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? `${APP_URL}/portal`;
const FROM_EMAIL = process.env.EMAIL_FROM ?? "monitoring@driftmonitor.local";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Privacy Drift Monitor";

/** Client-facing templates render with the AGENCY's brand; internal mail uses ours. */
const CLIENT_FACING = new Set([
  "portal-invitation",
  "portal-magic-link",
  "client-report-delivery",
]);

let transport: EmailTransport | null = null;

function getTransport(): EmailTransport {
  transport ??= createResendTransport(resendConfigFromEnv());
  return transport;
}

export interface SendEmailJobResult {
  sent: boolean;
  skipped?: "already_sent" | "undeliverable";
  providerId?: string;
}

export async function processEmailJob(
  data: EmailJobData,
  deps: { transport?: EmailTransport } = {},
): Promise<SendEmailJobResult> {
  const log = childLogger({ agencyId: data.agencyId, component: "email" });
  const repos = repositoriesFor(data.agencyId);

  if (await repos.alerts.hasBeenDelivered(data.idempotencyKey)) {
    log.info({ idempotencyKey: data.idempotencyKey }, "email already delivered; skipping");
    return { sent: false, skipped: "already_sent" };
  }

  const message = data.message as EmailMessage;

  const branding = await resolveBranding(data.agencyId, {
    whiteLabelEnabled: CLIENT_FACING.has(message.template),
  });

  const rendered = renderMessage(message, branding, {
    appUrl: APP_URL,
    portalUrl: PORTAL_URL,
    unsubscribeUrl: `${APP_URL}/app/settings/notifications`,
  });

  try {
    const result = await (deps.transport ?? getTransport()).send({
      to: data.to,
      from: {
        email: FROM_EMAIL,
        // ⚠️ The AGENCY's name on client-facing mail, ours on internal mail.
        // A client contact receiving "Privacy Drift Monitor" in their From line
        // is the agency's white-label promise leaking.
        name: CLIENT_FACING.has(message.template) ? branding.companyName : FROM_NAME,
      },
      ...(branding.contactEmail && CLIENT_FACING.has(message.template)
        ? { replyTo: branding.contactEmail }
        : {}),
      rendered,
      idempotencyKey: data.idempotencyKey,
    });

    await recordStatus(repos, data, result.simulated ? "simulated" : "sent", result.providerId);
    log.info({ to: data.to, template: message.template }, "email sent");
    return { sent: true, providerId: result.providerId };
  } catch (error) {
    // ⚠️ The history row is written BEFORE the throw, so a permanently failing
    // address is visible in the Alerts → History tab rather than only in logs.
    await recordStatus(repos, data, "failed", null, describe(error));
    // Re-thrown so BullMQ retries — §9.5 gives email roughly two hours.
    throw error;
  }
}

async function recordStatus(
  repos: ReturnType<typeof repositoriesFor>,
  data: EmailJobData,
  status: string,
  providerId: string | null,
  errorMessage?: string,
): Promise<void> {
  await repos.alerts.recordHistory({
    alertRuleId: data.alertRuleId,
    type: (data.notificationType ?? "REPORT_READY") as never,
    channel: "email",
    recipients: [data.to],
    entityType: data.entityType,
    entityId: data.entityId,
    status,
    providerId,
    errorMessage: errorMessage ?? null,
    // The queued row already claimed the key; this one records the OUTCOME and
    // must not collide with it on the unique index.
    idempotencyKey: `${data.idempotencyKey}:${status}`,
  });
}

function describe(error: unknown): string {
  // Provider text never reaches a user (§6.7) — this string lands in
  // `AlertHistory.errorMessage`, which only the owning agency reads.
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown error";
}
