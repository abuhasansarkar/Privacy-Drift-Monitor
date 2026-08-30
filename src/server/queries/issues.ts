import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { issue as issueSchemas } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * ISSUE QUERIES — §3.8 (issue queue), §3.10 (issue detail).
 *
 * Filters are parsed from the URL here, the same way the website and client
 * lists do it, so a filtered queue is a shareable link (§3.6).
 */

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

function many(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined || value === "") return undefined;
  return Array.isArray(value) ? value : [value];
}

export async function getIssueList(
  ctx: AgencyContext,
  raw: Record<string, string | string[] | undefined>,
) {
  const parsed = issueSchemas.issueListQuerySchema.safeParse({
    status: many(raw.status),
    severity: many(raw.severity),
    websiteId: first(raw.website),
    search: first(raw.search),
    page: first(raw.page),
    perPage: first(raw.perPage),
  });

  // A malformed query falls back to defaults rather than erroring: a bad link
  // should show the queue, not a 500.
  const query = parsed.success
    ? parsed.data
    : issueSchemas.issueListQuerySchema.parse({});

  const repos = repositoriesFor(ctx.agencyId);
  const [page, counts] = await Promise.all([
    repos.issues.list(query),
    repos.issues.countsBySeverity(),
  ]);

  return { query, page, counts };
}

export async function getIssueDetail(ctx: AgencyContext, issueId: string) {
  const repos = repositoriesFor(ctx.agencyId);
  return repos.issues.findById(issueId);
}
