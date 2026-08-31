import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { notification as notificationSchemas } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * ALERT QUERIES — §3.11 (`/app/alerts`, two tabs).
 *
 * The Rules tab needs the scope targets to render a rule as "Acme Dental"
 * rather than as a uuid, so both are loaded together — a rule list that renders
 * ids is a list nobody can audit.
 */

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

export async function getAlertRules(ctx: AgencyContext) {
  const repos = repositoriesFor(ctx.agencyId);
  const [rules, clients, websites, groups] = await Promise.all([
    repos.alerts.listRules(),
    repos.db.client.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    repos.db.website.findMany({
      where: { archivedAt: null },
      select: { id: true, url: true, label: true },
      orderBy: { url: "asc" },
    }),
    repos.db.websiteGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const scopeNames = new Map<string, string>();
  for (const client of clients) scopeNames.set(client.id, client.name);
  for (const website of websites) scopeNames.set(website.id, website.label ?? website.url);
  for (const group of groups) scopeNames.set(group.id, group.name);

  return { rules, clients, websites, groups, scopeNames };
}

export async function getAlertHistory(
  ctx: AgencyContext,
  raw: Record<string, string | string[] | undefined>,
) {
  const parsed = notificationSchemas.alertHistoryQuerySchema.safeParse({
    type: first(raw.type),
    status: first(raw.status),
    cursor: first(raw.cursor),
    limit: first(raw.limit),
  });

  const query = parsed.success
    ? parsed.data
    : notificationSchemas.alertHistoryQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  return { query, page: await repos.alerts.listHistory(query) };
}
