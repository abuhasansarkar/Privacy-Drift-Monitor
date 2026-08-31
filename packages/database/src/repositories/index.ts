import { forAgency, type TenantClient } from "../tenant";
import { aiRepository, type AIRepository } from "./ai.repository";
import { alertRepository, type AlertRepository } from "./alert.repository";
import { auditRepository, type AuditRepository } from "./audit.repository";
import { brandingRepository, type BrandingRepository } from "./branding.repository";
import { clientRepository, type ClientRepository } from "./client.repository";
import {
  notificationRepository,
  type NotificationRepository,
} from "./notification.repository";
import { portalRepository, type PortalRepository } from "./portal.repository";
import { reportRepository, type ReportRepository } from "./report.repository";
import { issueRepository, type IssueRepository } from "./issue.repository";
import { scanRepository, type ScanRepository } from "./scan.repository";
import { teamRepository, type TeamRepository } from "./team.repository";
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
  scans: ScanRepository;
  issues: IssueRepository;
  team: TeamRepository;
  audit: AuditRepository;
  notifications: NotificationRepository;
  alerts: AlertRepository;
  reports: ReportRepository;
  branding: BrandingRepository;
  portal: PortalRepository;
  /** Phase 5 — the AI call log, response cache and metering ledger (§8.9). */
  ai: AIRepository;
}

export function repositoriesFor(agencyId: string): Repositories {
  const db = forAgency(agencyId);
  return {
    db,
    agencyId,
    websites: websiteRepository(db, agencyId),
    clients: clientRepository(db, agencyId),
    scans: scanRepository(db, agencyId),
    issues: issueRepository(db, agencyId),
    team: teamRepository(db, agencyId),
    audit: auditRepository(db),
    notifications: notificationRepository(db, agencyId),
    alerts: alertRepository(db, agencyId),
    reports: reportRepository(db, agencyId),
    branding: brandingRepository(db, agencyId),
    portal: portalRepository(db, agencyId),
    ai: aiRepository(db, agencyId),
  };
}

export {
  aiRepository,
  alertRepository,
  auditRepository,
  brandingRepository,
  clientRepository,
  notificationRepository,
  portalRepository,
  reportRepository,
  issueRepository,
  scanRepository,
  teamRepository,
  websiteRepository,
};
export type {
  AIRepository,
  AlertRepository,
  AuditRepository,
  BrandingRepository,
  ClientRepository,
  NotificationRepository,
  PortalRepository,
  ReportRepository,
  IssueRepository,
  ScanRepository,
  TeamRepository,
  WebsiteRepository,
};
export type { AuditAction, AuditEntry } from "./audit.repository";
export type { ClientListRow } from "./client.repository";
export type { ScanCompletion, ScanEvidence } from "./scan.repository";
export type {
  EvidenceInput,
  FindingInput,
  FindingWithEvidence,
  UpsertResult,
} from "./issue.repository";
export type { WebsiteListRow } from "./website.repository";
export type { AlertHistoryInput, AlertRuleInput } from "./alert.repository";
export type { AIRequestRecord } from "./ai.repository";
export type { BrandingInput } from "./branding.repository";
export type { NotificationInput } from "./notification.repository";
export type { ReportCreateInput, ReportListQuery } from "./report.repository";
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
