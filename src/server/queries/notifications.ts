import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { notification as notificationSchemas } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * NOTIFICATION QUERIES — §3.11.
 *
 * ⚠️ EVERY READ IS SCOPED BY `userId` AS WELL AS BY TENANT. A notification is
 * addressed to a person, not to an agency: showing one member another's unread
 * count is a small bug with a confusing symptom, and showing them the CONTENT
 * would leak findings a scoped developer is not supposed to see (§6.2).
 */

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

export async function getNotificationList(
  ctx: AgencyContext,
  raw: Record<string, string | string[] | undefined>,
) {
  const parsed = notificationSchemas.notificationListQuerySchema.safeParse({
    unreadOnly: first(raw.unread) === "1",
    type: first(raw.type),
    cursor: first(raw.cursor),
    limit: first(raw.limit),
  });

  // A malformed link shows the centre, not a 500 — the same rule as the issue
  // queue.
  const query = parsed.success
    ? parsed.data
    : notificationSchemas.notificationListQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  const [page, unread] = await Promise.all([
    repos.notifications.listForUser(ctx.userId, {
      unreadOnly: query.unreadOnly,
      type: query.type,
      cursor: query.cursor,
      limit: query.limit,
    }),
    repos.notifications.unreadCount(ctx.userId),
  ]);

  return { query, page, unread };
}

/** The header bell: a count and the latest five (§3.11). */
export async function getNotificationBell(ctx: AgencyContext) {
  const repos = repositoriesFor(ctx.agencyId);
  const [unread, latest] = await Promise.all([
    repos.notifications.unreadCount(ctx.userId),
    repos.notifications.latestForUser(ctx.userId, 5),
  ]);
  return { unread, latest };
}

export async function getNotificationPreferences(ctx: AgencyContext) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.notifications.preferencesFor(ctx.userId);
}
