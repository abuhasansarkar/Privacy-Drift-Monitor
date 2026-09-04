import "server-only";
import { randomBytes } from "node:crypto";
import { assertSafeUrl } from "@pdm/scanner";
import { forAgency } from "@pdm/database/tenant";
import {
  createRedisConnection,
  createWebhookQueue,
  enqueueWebhook,
} from "@pdm/scanner/queue/queues";
import {
  type WebhookEventType,
  type WebhookPayload,
} from "@pdm/shared";
import { NotFoundError, ValidationError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";

const log = childLogger({ component: "webhook-service" });

const globalForQueue = globalThis as unknown as {
  pdmWebhookQueue?: ReturnType<typeof createWebhookQueue>;
};

function getWebhookQueue() {
  if (!globalForQueue.pdmWebhookQueue) {
    const connection = createRedisConnection(
      process.env.REDIS_URL ?? "redis://localhost:6379",
    );
    globalForQueue.pdmWebhookQueue = createWebhookQueue(connection);
  }
  return globalForQueue.pdmWebhookQueue;
}

export interface CreateWebhookEndpointInput {
  url: string;
  description?: string | null;
  events?: string[];
}

export interface WebhookEndpointSummary {
  id: string;
  agencyId: string;
  url: string;
  description: string | null;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  recentDeliveries?: {
    id: string;
    event: string;
    statusCode: number | null;
    status: string;
    createdAt: Date;
  }[];
}

/**
 * Registers a new outbound webhook endpoint for an agency.
 * Verifies that the URL complies with the SSRF security guard.
 */
export async function createWebhookEndpoint(
  agencyId: string,
  input: CreateWebhookEndpointInput,
): Promise<WebhookEndpointSummary> {
  const url = input.url.trim();
  if (!url) {
    throw new ValidationError("Webhook destination URL is required", { details: { field: "url" } });
  }

  // 1. SSRF Safety Check: prevent customer from probing internal/loopback infrastructure
  await assertSafeUrl(url);

  // 2. Generate HMAC secret: whsec_<48 hex chars>
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const events = input.events && input.events.length > 0
    ? input.events
    : ["website.scan.completed", "privacy_drift.detected"];

  const db = forAgency(agencyId);
  const endpoint = await db.webhookEndpoint.create({
    data: {
      agencyId,
      url,
      description: input.description?.trim() ?? null,
      secret,
      events,
      isActive: true,
    },
  });

  return {
    id: endpoint.id,
    agencyId: endpoint.agencyId,
    url: endpoint.url,
    description: endpoint.description,
    secret: endpoint.secret,
    events: endpoint.events,
    isActive: endpoint.isActive,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

/**
 * Lists all registered webhook endpoints for an agency with recent delivery logs.
 */
export async function listWebhookEndpoints(
  agencyId: string,
): Promise<WebhookEndpointSummary[]> {
  const db = forAgency(agencyId);
  const endpoints = await db.webhookEndpoint.findMany({
    where: { agencyId },
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: {
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          event: true,
          statusCode: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  return endpoints.map((ep) => ({
    id: ep.id,
    agencyId: ep.agencyId,
    url: ep.url,
    description: ep.description,
    secret: ep.secret,
    events: ep.events,
    isActive: ep.isActive,
    createdAt: ep.createdAt,
    updatedAt: ep.updatedAt,
    recentDeliveries: ep.deliveries,
  }));
}

/**
 * Deletes a webhook endpoint.
 */
export async function deleteWebhookEndpoint(
  agencyId: string,
  endpointId: string,
): Promise<{ success: boolean }> {
  const db = forAgency(agencyId);
  const existing = await db.webhookEndpoint.findFirst({
    where: { id: endpointId, agencyId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundError("Webhook endpoint not found", { details: { endpointId } });
  }

  await db.webhookEndpoint.delete({
    where: { id: endpointId },
  });

  return { success: true };
}

/**
 * Dispatches an event to all subscribed, active webhook endpoints for an agency.
 */
export async function triggerOutboundWebhooks(
  agencyId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<{ dispatched: number }> {
  const db = forAgency(agencyId);
  const endpoints = await db.webhookEndpoint.findMany({
    where: {
      agencyId,
      isActive: true,
    },
  });

  const matchingEndpoints = endpoints.filter(
    (ep) => ep.events.length === 0 || ep.events.includes(event),
  );

  if (matchingEndpoints.length === 0) {
    return { dispatched: 0 };
  }

  const queue = getWebhookQueue();
  let dispatched = 0;

  for (const endpoint of matchingEndpoints) {
    const deliveryId = `whd_${randomBytes(16).toString("hex")}`;
    const payload: WebhookPayload = {
      id: deliveryId,
      event,
      createdAt: new Date().toISOString(),
      agencyId,
      data,
    };

    // 1. Create delivery tracking record in database
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

    // 2. Enqueue delivery job to BullMQ
    await enqueueWebhook(queue, {
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

  log.info({ agencyId, event, count: dispatched }, "outbound webhook jobs queued");
  return { dispatched };
}
