import { randomBytes } from "node:crypto";
import { forAgency } from "@pdm/database/tenant";
import { enqueueWebhook, type WebhookJobData } from "@pdm/scanner/queue/queues";
import type { WebhookEventType, WebhookPayload } from "@pdm/shared";
import { childLogger } from "@pdm/shared/logger";
import type { Queue } from "bullmq";

const log = childLogger({ component: "worker-webhook-trigger" });

/**
 * Dispatches outbound webhook events from the worker background pipeline.
 */
export async function triggerWorkerWebhooks(
  agencyId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
  webhookQueue: Queue<WebhookJobData>,
): Promise<number> {
  const db = forAgency(agencyId);
  const endpoints = await db.webhookEndpoint.findMany({
    where: {
      agencyId,
      isActive: true,
    },
  });

  const matching = endpoints.filter(
    (ep) => ep.events.length === 0 || ep.events.includes(event),
  );

  if (matching.length === 0) {
    return 0;
  }

  let dispatched = 0;
  for (const endpoint of matching) {
    const deliveryId = `whd_${randomBytes(16).toString("hex")}`;
    const payload: WebhookPayload = {
      id: deliveryId,
      event,
      createdAt: new Date().toISOString(),
      agencyId,
      data,
    };

    await db.webhookDelivery.create({
      data: {
        id: deliveryId,
        endpointId: endpoint.id,
        event,
        payload: payload as unknown as Record<string, unknown>,
        status: "PENDING",
        attempt: 1,
      },
    });

    await enqueueWebhook(webhookQueue, {
      deliveryId,
      endpointId: endpoint.id,
      endpointUrl: endpoint.url,
      secret: endpoint.secret,
      event,
      payload: payload as unknown as Record<string, unknown>,
      attempt: 1,
    });

    dispatched++;
  }

  log.info({ agencyId, event, dispatched }, "dispatched outbound webhooks from worker");
  return dispatched;
}
