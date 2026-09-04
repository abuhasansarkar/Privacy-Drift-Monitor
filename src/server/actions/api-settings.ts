"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth/context";
import { generateApiKey, revokeApiKey } from "@/server/services/api-keys";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
} from "@/server/services/webhook-service";
import { actionFromError, actionOk, type ActionResult } from "./result";

export async function createApiKeyAction(input: {
  name: string;
  scopes?: string[];
}): Promise<ActionResult<{ id: string; name: string; prefix: string; rawKey: string }>> {
  try {
    const ctx = await requirePermission("settings:update");
    const created = await generateApiKey(ctx.agencyId, {
      name: input.name,
      scopes: input.scopes,
    });
    revalidatePath("/app/settings/api");
    return actionOk({
      id: created.id,
      name: created.name,
      prefix: created.keyPrefix,
      rawKey: created.secretToken,
    });
  } catch (err) {
    return actionFromError(err, "createApiKeyAction");
  }
}

export async function revokeApiKeyAction(
  keyId: string,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const ctx = await requirePermission("settings:update");
    await revokeApiKey(ctx.agencyId, keyId);
    revalidatePath("/app/settings/api");
    return actionOk({ success: true });
  } catch (err) {
    return actionFromError(err, "revokeApiKeyAction");
  }
}

export async function createWebhookAction(input: {
  url: string;
  description?: string;
  events?: string[];
}): Promise<
  ActionResult<{
    id: string;
    url: string;
    secret: string;
    events: string[];
    description: string | null;
  }>
> {
  try {
    const ctx = await requirePermission("settings:update");
    const endpoint = await createWebhookEndpoint(ctx.agencyId, input);
    revalidatePath("/app/settings/api");
    return actionOk({
      id: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      events: endpoint.events,
      description: endpoint.description,
    });
  } catch (err) {
    return actionFromError(err, "createWebhookAction");
  }
}

export async function deleteWebhookAction(
  endpointId: string,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const ctx = await requirePermission("settings:update");
    await deleteWebhookEndpoint(ctx.agencyId, endpointId);
    revalidatePath("/app/settings/api");
    return actionOk({ success: true });
  } catch (err) {
    return actionFromError(err, "deleteWebhookAction");
  }
}
