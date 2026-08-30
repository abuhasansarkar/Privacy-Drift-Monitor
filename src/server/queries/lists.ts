import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { client as clientSchemas, website as websiteSchemas } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * LIST READS — §3.6, §3.7.
 *
 * ⚠️ Search params are USER INPUT and are Zod-parsed here, before they reach a
 * repository. `sort` is the one that matters: the repositories take a
 * whitelisted union, and parsing is what stops a crafted `?sort=` reaching
 * Prisma's `orderBy` (§6.4). Unparseable params fall back to the schema
 * defaults rather than erroring — a stale bookmark should render the list, not
 * a 422.
 */

type RawParams = Record<string, string | string[] | undefined>;

/**
 * Search params arrive as `string | string[]`; every schema here wants one value.
 *
 * ⚠️ An EMPTY string becomes `undefined`, and that is load-bearing. A GET filter
 * form submits every field, so an unset `<select>` sends `?status=` — and `""`
 * is not a member of the enum, so the whole query object would fail to parse
 * and fall back to defaults, silently discarding the search term the user typed
 * beside it. Absent and blank mean the same thing here: no filter.
 */
function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

export async function getClientList(ctx: AgencyContext, raw: RawParams) {
  const parsed = clientSchemas.clientListQuerySchema.safeParse({
    search: first(raw.search),
    includeArchived: first(raw.archived) === "1",
    sort: first(raw.sort),
    direction: first(raw.direction),
    page: first(raw.page),
    perPage: first(raw.perPage),
    ...(first(raw.portal) === undefined
      ? {}
      : { portalEnabled: first(raw.portal) === "1" }),
  });

  const query = parsed.success
    ? parsed.data
    : clientSchemas.clientListQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  return { query, page: await repos.clients.list(query) };
}

export async function getWebsiteList(ctx: AgencyContext, raw: RawParams) {
  const parsed = websiteSchemas.websiteListQuerySchema.safeParse({
    search: first(raw.search),
    clientId: first(raw.client),
    groupId: first(raw.group),
    status: first(raw.status),
    minHealthScore: first(raw.minHealth),
    maxHealthScore: first(raw.maxHealth),
    includeArchived: first(raw.archived) === "1",
    sort: first(raw.sort),
    direction: first(raw.direction),
    page: first(raw.page),
    perPage: first(raw.perPage),
  });

  const query = parsed.success
    ? parsed.data
    : websiteSchemas.websiteListQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  return {
    query,
    // §6.2 — a member restricted to specific sites sees only those. Passed
    // through rather than applied here: the repository composes it into the
    // same `where` as the filters, so it cannot be forgotten by a caller.
    page: await repos.websites.list({ ...query, websiteScope: ctx.websiteScope }),
  };
}
