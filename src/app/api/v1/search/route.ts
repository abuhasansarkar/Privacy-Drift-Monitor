import { z } from "zod";
import { repositoriesFor } from "@pdm/database/repositories";
import { requireAgencyContext } from "@/server/auth/context";
import { withApiErrors } from "../_lib/with-errors";

/**
 * COMMAND PALETTE SEARCH — §3.3, Phase 1 task 1.3.
 *
 * ⚠️ TENANT-SCOPED, like every other read. The palette is the one surface where
 * a scoping mistake would be least visible — a stray result from another agency
 * looks like a search quirk, not a breach. `repositoriesFor` makes that
 * impossible to write by accident (P4).
 *
 * ⚠️ Results are CAPPED per type, not overall. A query matching forty websites
 * must not push the one matching client off the list — the palette's job is to
 * get you somewhere, and a single relevant client beats the fortieth website.
 */

const querySchema = z.object({ q: z.string().trim().min(1).max(100) });

const PER_TYPE = 5;

export interface SearchResult {
  type: "website" | "client" | "issue";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

async function handleGET(request: Request) {
  const ctx = await requireAgencyContext();

  const parsed = querySchema.safeParse({
    q: new URL(request.url).searchParams.get("q") ?? "",
  });
  // An empty query is not an error — it is the palette before you type.
  if (!parsed.success) return Response.json({ results: [] });

  const term = parsed.data.q;
  const { db } = repositoriesFor(ctx.agencyId);
  const contains = { contains: term, mode: "insensitive" as const };

  const [websites, clients, issues] = await Promise.all([
    db.website.findMany({
      where: { archivedAt: null, OR: [{ url: contains }, { label: contains }] },
      select: { id: true, url: true, label: true },
      take: PER_TYPE,
    }),
    db.client.findMany({
      where: { archivedAt: null, name: contains },
      select: { id: true, name: true },
      take: PER_TYPE,
    }),
    db.issue.findMany({
      where: { title: contains, status: { notIn: ["IGNORED"] } },
      select: { id: true, title: true, website: { select: { url: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: PER_TYPE,
    }),
  ]);

  const results: SearchResult[] = [
    ...websites.map((website) => ({
      type: "website" as const,
      id: website.id,
      title: website.url.replace(/^https?:\/\//, ""),
      subtitle: website.label,
      href: `/app/websites/${website.id}`,
    })),
    ...clients.map((client) => ({
      type: "client" as const,
      id: client.id,
      title: client.name,
      subtitle: null,
      href: `/app/clients/${client.id}`,
    })),
    ...issues.map((issue) => ({
      type: "issue" as const,
      id: issue.id,
      title: issue.title,
      subtitle: issue.website.url.replace(/^https?:\/\//, ""),
      href: `/app/issues/${issue.id}`,
    })),
  ];

  return Response.json({ results });
}

export const GET = withApiErrors(handleGET);
