import "server-only";
import { dedupeKey, renderCopy, type AlertEvent } from "@pdm/notifications";
import { enqueueNotification } from "@pdm/scanner/queue/queues";
import type { NotificationType, Severity } from "@pdm/schemas";
import { childLogger } from "@pdm/shared/logger";
import { notificationQueue } from "./queues";

/**
 * THE APP'S ALERT ENTRY POINT — PLAN.md Part VI §6.6.
 *
 * Server Actions that change something an agency should hear about call this;
 * the worker's dispatcher decides who gets it and when. Nothing in a request
 * path resolves alert rules, applies quiet hours or talks to Resend — a user
 * clicking "Generate report" must not wait on a mail provider.
 *
 * ⚠️ A FAILED ENQUEUE NEVER FAILS THE ACTION THAT CAUSED IT. Losing a
 * notification is a degraded experience; failing the mutation that produced it
 * loses the user's work. The error is logged and swallowed here, deliberately,
 * and every caller relies on that.
 */

export interface NotifyInput {
  agencyId: string;
  type: NotificationType;
  severity?: Severity;
  /** Overrides the standard copy. Rule- or action-authored, never AI (P1). */
  title?: string;
  body?: string;
  linkUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  websiteId?: string | null;
  websiteGroupId?: string | null;
  clientId?: string | null;
  websiteLabel?: string | null;
}

export async function notify(input: NotifyInput): Promise<void> {
  const copy = renderCopy(input.type, input.websiteLabel ?? null);

  const event: AlertEvent = {
    agencyId: input.agencyId,
    type: input.type,
    severity: input.severity ?? "INFO",
    title: input.title ?? copy.title,
    body: input.body ?? copy.body,
    linkUrl: input.linkUrl ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    websiteId: input.websiteId ?? null,
    websiteGroupId: input.websiteGroupId ?? null,
    clientId: input.clientId ?? null,
    websiteLabel: input.websiteLabel ?? null,
  };

  try {
    await enqueueNotification(notificationQueue(), {
      ...event,
      dedupeKey: dedupeKey({
        agencyId: event.agencyId,
        type: event.type,
        entityId: event.entityId,
      }),
    });
  } catch (error) {
    childLogger({ agencyId: input.agencyId, component: "alerts" }).error(
      { err: error, type: input.type },
      "could not enqueue notification; the action itself succeeded",
    );
  }
}
