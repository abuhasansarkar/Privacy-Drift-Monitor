"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { notification as notificationSchemas } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ValidationError } from "@pdm/shared/errors";
import { requireAgencyContext } from "@/server/auth/context";
import { actionFromError, actionOk, type ActionResult } from "./result";

/**
 * NOTIFICATION ACTIONS — §3.11.
 *
 * ⚠️ `requireAgencyContext()` FIRST, in every action. Next 16's proxy does not
 * reliably cover Server Actions — they POST to the invoking route — so the
 * proxy is a first line of defence and never the only one (§6.1).
 *
 * ⚠️ NO PERMISSION GATE BEYOND MEMBERSHIP, deliberately. A notification belongs
 * to the reader, and every role can read their own; the repository scopes on
 * `ctx.userId`, so there is nothing here a Viewer could reach that is not
 * already theirs.
 */

export async function markNotificationsRead(
  raw: z.infer<typeof notificationSchemas.markNotificationsReadSchema>,
): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireAgencyContext();

    const parsed = notificationSchemas.markNotificationsReadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: "MARK_NOTIFICATIONS_SCHEMA",
      });
    }

    const repos = repositoriesFor(ctx.agencyId);
    const now = new Date();

    const count = parsed.data.all
      ? await repos.notifications.markAllRead(ctx.userId, now)
      : await repos.notifications.markRead(ctx.userId, parsed.data.ids, now);

    revalidatePath("/app/notifications");
    // The bell lives in the shell, so every authenticated page shows a stale
    // count until its layout re-renders.
    revalidatePath("/app", "layout");
    return actionOk({ count });
  } catch (error) {
    return actionFromError(error, "markNotificationsRead");
  }
}

export async function updateNotificationPreferences(
  raw: z.infer<typeof notificationSchemas.updateNotificationPreferencesSchema>,
): Promise<ActionResult<{ count: number }>> {
  try {
    const ctx = await requireAgencyContext();

    const parsed =
      notificationSchemas.updateNotificationPreferencesSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError(t("error.validation"), {
        reason: "NOTIFICATION_PREFERENCES_SCHEMA",
      });
    }

    const repos = repositoriesFor(ctx.agencyId);
    for (const preference of parsed.data.preferences) {
      await repos.notifications.upsertPreference({
        userId: ctx.userId,
        type: preference.type,
        inApp: preference.inApp,
        email: preference.email,
        digest: preference.digest,
      });
    }

    revalidatePath("/app/settings/notifications");
    return actionOk({ count: parsed.data.preferences.length });
  } catch (error) {
    return actionFromError(error, "updateNotificationPreferences");
  }
}
