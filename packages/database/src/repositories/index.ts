import { forAgency, type TenantClient } from "../tenant";
import { auditRepository, type AuditRepository } from "./audit.repository";
import { clientRepository, type ClientRepository } from "./client.repository";
import { websiteRepository, type WebsiteRepository } from "./website.repository";

/**
 * REPOSITORY ENTRY POINT — PLAN.md §12.1.
 *
 * One call site, one tenant scope:
 *
 *   const ctx = await requirePermission("website:create");
 *   const repos = repositoriesFor(ctx.agencyId);
 *   const site = await repos.websites.create(input, { userId: ctx.userId });
 *
 * Building the extension is cheap but not free, and a stable instance keeps
 * Prisma's own query caching effective, so resolve this ONCE per request and
 * pass it down rather than calling it per query.
 */

export interface Repositories {
  /** The scoped client itself, for the rare read no repository covers yet. */
  db: TenantClient;
  agencyId: string;
  websites: WebsiteRepository;
  clients: ClientRepository;
  audit: AuditRepository;
}

export function repositoriesFor(agencyId: string): Repositories {
  const db = forAgency(agencyId);
  return {
    db,
    agencyId,
    websites: websiteRepository(db, agencyId),
    clients: clientRepository(db, agencyId),
    audit: auditRepository(db),
  };
}

export { auditRepository, clientRepository, websiteRepository };
export type { AuditRepository, ClientRepository, WebsiteRepository };
export type { AuditAction, AuditEntry } from "./audit.repository";
export type { ClientListRow } from "./client.repository";
export type { WebsiteListRow } from "./website.repository";
export {
  cursorSlice,
  isPrismaError,
  PRISMA_NOT_FOUND,
  PRISMA_UNIQUE_CONFLICT,
  skipTake,
  slugify,
  toOffsetPage,
} from "./types";
export type {
  CursorPage,
  CursorPageRequest,
  OffsetPage,
  OffsetPageRequest,
} from "./types";
