import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import type { ConsentPhase } from "@pdm/schemas";
import type { AgencyContext } from "@/server/auth/context";

/**
 * EVIDENCE BROWSER QUERIES — §3.8 ("Tab: Evidence"), Phase 2 task 2.15.
 *
 * ⚠️ THE SCAN IS RESOLVED AGAINST THE WEBSITE, not taken from the URL alone. A
 * `?scan=` parameter naming a scan of a DIFFERENT website in the same agency
 * would otherwise render that scan's evidence under this website's header —
 * technically in-tenant, and still wrong.
 *
 * ⚠️ SERVER-SIDE PAGING, NOT CLIENT VIRTUALISATION. §5.11 draws a virtualised
 * table, which is the right answer for a dataset already in the browser. Ours
 * is not: one scan of a busy site is thousands of rows, and shipping them to
 * virtualise locally is the cost virtualisation exists to avoid.
 */

const PER_PAGE = 100;

export type EvidenceKind =
  | "requests"
  | "cookies"
  | "storage"
  | "console"
  | "screenshots";

const KINDS: readonly EvidenceKind[] = [
  "requests",
  "cookies",
  "storage",
  "console",
  "screenshots",
];

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "" ? undefined : single;
}

export interface EvidenceFilters {
  kind: EvidenceKind;
  scanId: string | null;
  page: number;
  search?: string;
  consentPhase?: ConsentPhase;
  resourceType?: string;
  thirdPartyOnly: boolean;
  trackerOnly: boolean;
}

export function parseEvidenceFilters(
  raw: Record<string, string | string[] | undefined>,
): EvidenceFilters {
  const kindParam = first(raw.kind);
  const pageParam = Number(first(raw.page) ?? "1");

  return {
    kind: KINDS.includes(kindParam as EvidenceKind)
      ? (kindParam as EvidenceKind)
      : "requests",
    scanId: first(raw.scan) ?? null,
    // A malformed page falls back to the first, like every other list — a bad
    // link should show evidence, not a 500.
    page: Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1,
    search: first(raw.q),
    consentPhase: first(raw.phase) as ConsentPhase | undefined,
    resourceType: first(raw.type),
    thirdPartyOnly: first(raw.thirdParty) === "1",
    trackerOnly: first(raw.tracker) === "1",
  };
}

export async function getEvidence(
  ctx: AgencyContext,
  websiteId: string,
  filters: EvidenceFilters,
) {
  const repos = repositoriesFor(ctx.agencyId);

  // The scan selector's options, and the resolution of `?scan=`.
  const scans = await repos.scans.listForWebsite(websiteId, 25);
  const selected =
    (filters.scanId ? scans.find((scan) => scan.id === filters.scanId) : null) ??
    scans[0] ??
    null;

  if (!selected) {
    return { scans, selected: null, resourceTypes: [], rows: null, total: 0, perPage: PER_PAGE };
  }

  const skip = (filters.page - 1) * PER_PAGE;
  const paging = { skip, take: PER_PAGE };

  const resourceTypes =
    filters.kind === "requests"
      ? await repos.scans.evidenceResourceTypes(selected.id)
      : [];

  switch (filters.kind) {
    case "cookies": {
      const { items, total } = await repos.scans.evidenceCookies(selected.id, paging);
      return { scans, selected, resourceTypes, rows: { kind: "cookies" as const, items }, total, perPage: PER_PAGE };
    }
    case "storage": {
      const { items, total } = await repos.scans.evidenceStorage(selected.id, paging);
      return { scans, selected, resourceTypes, rows: { kind: "storage" as const, items }, total, perPage: PER_PAGE };
    }
    case "console": {
      const { items, total } = await repos.scans.evidenceConsole(selected.id, paging);
      return { scans, selected, resourceTypes, rows: { kind: "console" as const, items }, total, perPage: PER_PAGE };
    }
    case "screenshots": {
      const items = await repos.scans.evidenceScreenshots(selected.id);
      return {
        scans,
        selected,
        resourceTypes,
        rows: { kind: "screenshots" as const, items },
        total: items.length,
        perPage: PER_PAGE,
      };
    }
    default: {
      const { items, total } = await repos.scans.evidenceRequests(selected.id, {
        ...paging,
        search: filters.search,
        consentPhase: filters.consentPhase,
        resourceType: filters.resourceType,
        thirdPartyOnly: filters.thirdPartyOnly,
        trackerOnly: filters.trackerOnly,
      });
      return { scans, selected, resourceTypes, rows: { kind: "requests" as const, items }, total, perPage: PER_PAGE };
    }
  }
}
