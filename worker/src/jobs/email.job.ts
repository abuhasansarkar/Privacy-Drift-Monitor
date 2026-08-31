import { repositoriesFor } from "@pdm/database/repositories";
import {
  createResendTransport,
  EmailRejectedError,
  parseFromAddress,
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
/**
 * ⚠️ PARSED, NOT SPLIT ON AN ASSUMPTION. `EMAIL_FROM` is RFC 5322 in
 * `.env.example` — see `parseFromAddress` for what went wrong when this module
 * assumed a bare address.
 */
const FROM = parseFromAddress(
  process.env.EMAIL_FROM ?? "monitoring@driftmonitor.local",
  process.env.EMAIL_FROM_NAME ?? "Privacy Drift Monitor",
);
const REPLY_TO = process.env.EMAIL_REPLY_TO || null;

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
  skipped?: "already_sent" | "undeliverable" | "rejected";
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

  /*
   * ⚠️ THE RESOLVER DECIDES THE ENTITLEMENT (§6.9); this job only decides
   * whether the template is CLIENT-FACING and therefore whether an agency
   * display name is appropriate at all. Those are two different questions, and
   * conflating them — passing `whiteLabelEnabled: CLIENT_FACING.has(...)` —
   * forced white-label on for every client-facing template regardless of plan.
   * It survived a grep for the literal `whiteLabelEnabled: true` because it was
   * written as an expression, and only a delivered email showed it.
   */
  const branding = await resolveBranding(data.agencyId);

  const rendered = renderMessage(message, branding, {
    appUrl: APP_URL,
    portalUrl: PORTAL_URL,
    unsubscribeUrl: `${APP_URL}/app/settings/notifications`,
  });

  try {
    const result = await (deps.transport ?? getTransport()).send({
      to: data.to,
      from: {
        // The ADDRESS is always ours — it has to be, because it is the domain
        // verified with the provider. Only the display name changes.
        email: FROM.email,
        // ⚠️ The AGENCY's name on client-facing mail, ours on internal mail.
        // A client contact receiving "Privacy Drift Monitor" in their From line
        // is the agency's white-label promise leaking.
        name: CLIENT_FACING.has(message.template)
          ? branding.companyName
          : (FROM.name ?? "Privacy Drift Monitor"),
      },
      /*
       * Reply-To carries the AGENCY's address on client-facing mail, so a
       * client contact who hits reply reaches their agency and not us. Internal
       * mail falls back to our support address.
       */
      ...(CLIENT_FACING.has(message.template) && branding.contactEmail
        ? { replyTo: branding.contactEmail }
        : REPLY_TO
          ? { replyTo: REPLY_TO }
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

    /*
     * ⚠️ A PROVIDER REJECTION IS NOT RETRIED. An unverified sending domain or a
     * malformed address answers the same way every time; eight attempts over
     * two hours would hide a one-line configuration fix behind "still
     * retrying". The failure is recorded and the job completes — the in-app
     * notification already reached the user either way (§6.6).
     */
    if (error instanceof EmailRejectedError) {
      log.error(
        { status: error.status, template: message.template },
        "email not sent: the provider rejected it and a retry cannot fix it",
      );
      return { sent: false, skipped: "rejected" };
    }

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
