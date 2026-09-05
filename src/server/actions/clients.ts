"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { client as clientSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requirePermission } from "@/server/auth/context";
import { requireFeature } from "@/server/services/entitlement-guard";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * CLIENT ACTIONS — §3.7, Phase 1 tasks 1.5/1.11, feature 02.
 *
 * ⚠️ Authorization is re-checked inside each action; the proxy does not
 * reliably cover Server Actions (§6.1). See the note in `websites.ts`.
 *
 * ⚠️ There is no delete. A client's websites keep their scan history and their
 * reports stay retrievable, so archiving is the terminal operation and it is
 * reversible — deletion of monitoring history is not (feature 02).
 */

const createInput = clientSchemas.createClientSchema;

export async function createClient(
  input: z.infer<typeof createInput>,
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const ctx = await requirePermission("client:create");

    const parsed = createInput.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: `CREATE_CLIENT_SCHEMA:${parsed.error.issues[0]?.path.join(".")}`,
      });
    }

    const repos = repositoriesFor(ctx.agencyId);
    // The repository derives the slug and retries once on a lost race against
    // the (agencyId, slug) unique index, so no slug is passed here.
    const created = await repos.clients.create(parsed.data, { userId: ctx.userId });

    revalidatePath("/app/clients");
    revalidatePath("/app");

    return actionOk({ id: created.id, name: created.name });
  } catch (error) {
    return actionFromError(error, "createClient");
  }
}

const archiveInput = z.object({ clientId: z.uuid() });

export async function archiveClient(
  input: z.infer<typeof archiveInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    // `client:archive`, not a delete permission — the matrix has no such thing,
    // which is the RBAC restating the rule in the header note.
    const ctx = await requirePermission("client:archive");

    const parsed = archiveInput.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), { reason: "ARCHIVE_CLIENT_SCHEMA" });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const archived = await repos.clients.archive(parsed.data.clientId, {
      userId: ctx.userId,
    });

    // `null` covers both "no such client" and "belongs to another agency" — the
    // repository is tenant-scoped, so the two are indistinguishable here by
    // design (§6.2).
    if (!archived) {
      throw new ValidationError(t("error.notFound"), {
        reason: `CLIENT_MISSING:${parsed.data.clientId}`,
      });
    }

    revalidatePath("/app/clients");
    return actionOk({ id: archived.id });
  } catch (error) {
    return actionFromError(error, "archiveClient");
  }
}

export async function toggleClientPortal(
  input: z.infer<typeof clientSchemas.toggleClientPortalSchema>,
): Promise<ActionResult<{ id: string; portalEnabled: boolean }>> {
  try {
    const ctx = await requirePermission("client:portal_toggle");

    const parsed = clientSchemas.toggleClientPortalSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: `TOGGLE_CLIENT_PORTAL_SCHEMA:${parsed.error.issues[0]?.path.join(".")}`,
      });
    }

    if (parsed.data.enabled) {
      await requireFeature(ctx.agencyId, "clientPortal");
    }

    const repos = repositoriesFor(ctx.agencyId);
    const updated = await repos.clients.update(
      parsed.data.clientId,
      { portalEnabled: parsed.data.enabled },
      { userId: ctx.userId },
    );

    if (!updated) {
      throw new ValidationError(t("error.notFound"), {
        reason: `CLIENT_MISSING:${parsed.data.clientId}`,
      });
    }

    revalidatePath("/app/clients");
    revalidatePath(`/app/clients/${parsed.data.clientId}`);

    return actionOk({ id: updated.id, portalEnabled: updated.portalEnabled });
  } catch (error) {
    return actionFromError(error, "toggleClientPortal");
  }
}
