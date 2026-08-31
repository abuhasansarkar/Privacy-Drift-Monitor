import type { ConsentPhase, Prisma, Scan, ScanStatus, ScanTrigger } from "@prisma/client";
import type { TenantClient } from "../tenant";

/**
 * SCAN REPOSITORY — PLAN.md Part IV §4.11, Part V §5.4, Phase 2 tasks 2.10/2.11.
 *
 * Owns the scan row and everything hanging off it. The scanner package knows
 * nothing about Prisma (feature doc 05: it must stay testable without a
 * database), so this is the boundary where a `ScanResult` becomes rows.
 *
 * ⚠️ EVIDENCE TABLES ARE INSERT-ONLY (§5.1 rule 2). Nothing here updates a
 * recorded request, cookie or storage entry. A correction supersedes with a new
 * scan; editing evidence would make a finding un-reproducible, which is the one
 * thing that would make the whole product unfalsifiable.
 */

/**
 * Row shapes, derived from Prisma's own generated create inputs minus the two
 * columns this repository supplies itself.
 *
 * ⚠️ Deriving rather than restating is load-bearing. A hand-written shape
 * silently drifts from the schema — a new evidence column would compile here
 * and be dropped on every insert. `Omit<…CreateManyInput>` cannot: adding a
 * required column breaks the build at the caller, which is where the value
 * would have to come from anyway.
 */
type Row<T> = Omit<T, "scanId" | "agencyId">;

export interface ScanEvidence {
  phases: Array<Row<Prisma.ScanPhaseCreateManyInput>>;
  requests: Array<Row<Prisma.NetworkRequestCreateManyInput>>;
  cookies: Array<Row<Prisma.CookieRecordCreateManyInput>>;
  storage: Array<Row<Prisma.StorageEntryCreateManyInput>>;
  consoleLogs: Array<Row<Prisma.ConsoleLogCreateManyInput>>;
  screenshots: Array<Row<Prisma.ScreenshotCreateManyInput>>;
}

export interface ScanCompletion {
  status: ScanStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  scannerVersion: string;
  browserVersion: string | null;
  workerId: string;
  userAgent: string;
  cmp: {
    cmpId: string;
    cmpName: string;
    version: string | null;
    confidence: number;
  } | null;
  pagesScanned: number;
  errorCode: string | null;
  errorMessage: string | null;
  errorPhase: string | null;
}

/**
 * Insert batch size.
 *
 * A busy page produces hundreds of requests per phase, and a single
 * `createMany` of a few thousand rows builds one enormous statement that can
 * exceed Postgres' parameter limit. Chunking keeps each statement bounded and
 * the transaction short — the transaction is what holds locks (§5.6).
 */
const BATCH = 500;

async function insertBatched<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    await insert(rows.slice(i, i + BATCH));
  }
}

export function scanRepository(db: TenantClient, agencyId: string) {
  return {
    /**
     * Creates the QUEUED row. Called BEFORE the job is enqueued, so the queue
     * always references a scan that exists.
     *
     * `idempotencyKey` is globally unique in the schema, so a double-submitted
     * manual scan collides here rather than producing two runs (§7.4).
     */
    async enqueue(input: {
      websiteId: string;
      trigger: ScanTrigger;
      triggeredById?: string | null;
      idempotencyKey?: string | null;
      scannerVersion: string;
    }): Promise<Scan> {
      return db.scan.create({
        data: {
          agencyId,
          websiteId: input.websiteId,
          trigger: input.trigger,
          triggeredById: input.triggeredById ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          scannerVersion: input.scannerVersion,
          status: "QUEUED",
        },
      });
    },

    /** Marks a scan RUNNING as the worker picks it up (§4.11 state machine). */
    async markRunning(scanId: string, workerId: string): Promise<void> {
      const startedAt = new Date();
      await db.scan.update({
        where: { id: scanId },
        data: { status: "RUNNING", startedAt, workerId },
      });
    },

    /**
     * Writes the finished scan and ALL of its evidence in one transaction.
     *
     * ⚠️ ONE TRANSACTION IS THE POINT. A scan row that says COMPLETED while its
     * requests are half-written is worse than no scan at all: the rule engine
     * would read the partial evidence and report "no trackers detected". Either
     * the whole recording lands or none of it does.
     *
     * ⚠️ NO QUEUE JOB IS ENQUEUED FROM IN HERE (§5.6). Analysis is enqueued by
     * the caller after this commits — a job created inside a transaction that
     * later rolls back would operate on data that was never committed.
     */
    async complete(
      scanId: string,
      completion: ScanCompletion,
      evidence: ScanEvidence,
    ): Promise<void> {
      const thirdPartyDomains = new Set(
        evidence.requests
          .filter((request) => request.isThirdParty)
          .map((request) => request.registrableDomain),
      );

      await db.$transaction(
        async (tx) => {
          await tx.scan.update({
            where: { id: scanId },
            data: {
              status: completion.status,
              startedAt: completion.startedAt,
              finishedAt: completion.finishedAt,
              durationMs: completion.durationMs,
              scannerVersion: completion.scannerVersion,
              browserVersion: completion.browserVersion,
              workerId: completion.workerId,
              userAgent: completion.userAgent,
              detectedCmpId: completion.cmp?.cmpId ?? null,
              detectedCmpName: completion.cmp?.cmpName ?? null,
              detectedCmpVersion: completion.cmp?.version ?? null,
              cmpConfidence: completion.cmp?.confidence ?? null,
              pagesScanned: completion.pagesScanned,
              // Denormalized counters, maintained in the SAME transaction as
              // the rows they count (§5.4) — a counter written afterwards is a
              // counter that disagrees with the table it summarises.
              requestCount: evidence.requests.length,
              thirdPartyDomainCount: thirdPartyDomains.size,
              cookieCount: evidence.cookies.length,
              storageKeyCount: evidence.storage.length,
              errorCode: completion.errorCode,
              errorMessage: completion.errorMessage,
              errorPhase: completion.errorPhase,
            },
          });

          await tx.scanPhase.createMany({
            data: evidence.phases.map((row) => ({ ...row, scanId, agencyId })),
          });

          await insertBatched(evidence.requests, (chunk) =>
            tx.networkRequest.createMany({
              data: chunk.map((row) => ({ ...row, scanId, agencyId })),
            }),
          );
          await insertBatched(evidence.cookies, (chunk) =>
            tx.cookieRecord.createMany({
              data: chunk.map((row) => ({ ...row, scanId, agencyId })),
            }),
          );
          await insertBatched(evidence.storage, (chunk) =>
            tx.storageEntry.createMany({
              data: chunk.map((row) => ({ ...row, scanId, agencyId })),
            }),
          );
          await insertBatched(evidence.consoleLogs, (chunk) =>
            tx.consoleLog.createMany({
              data: chunk.map((row) => ({ ...row, scanId, agencyId })),
            }),
          );
          await tx.screenshot.createMany({
            data: evidence.screenshots.map((row) => ({ ...row, scanId, agencyId })),
          });

          // The website's summary fields follow the scan, in the same
          // transaction, so the list page can never show a last-scan time for a
          // scan whose evidence is not there.
          const scan = await tx.scan.findUniqueOrThrow({
            where: { id: scanId },
            select: { websiteId: true },
          });

          await tx.website.update({
            where: { id: scan.websiteId },
            data: {
              lastScanId: scanId,
              lastScanAt: completion.finishedAt,
              // ⚠️ Only a COMPLETED scan updates this. A PARTIAL scan is not a
              // successful observation of the site and must never become the
              // drift baseline (§4.10).
              ...(completion.status === "COMPLETED"
                ? { lastSuccessfulScanAt: completion.finishedAt, consecutiveFailures: 0 }
                : {}),
              ...(completion.status === "FAILED"
                ? { consecutiveFailures: { increment: 1 } }
                : {}),
            },
          });
        },
        // Evidence batches make this longer than a normal write. Still bounded:
        // a transaction that never times out is a transaction that holds locks
        // through an outage.
        { timeout: 120_000 },
      );
    },

    /** Terminal failure that produced no evidence — a crash, not a scan. */
    async fail(
      scanId: string,
      errorCode: string,
      errorMessage: string,
    ): Promise<void> {
      await db.scan.update({
        where: { id: scanId },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorCode,
          errorMessage,
        },
      });
    },

    async findById(scanId: string): Promise<Scan | null> {
      return db.scan.findUnique({ where: { id: scanId } });
    },

    /** Newest first — the website detail page's scan history. */
    async listForWebsite(websiteId: string, limit = 20) {
      return db.scan.findMany({
        where: { websiteId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: { phases: { orderBy: { phase: "asc" } } },
      });
    },

    async withPhases(scanId: string) {
      return db.scan.findUnique({
        where: { id: scanId },
        include: {
          phases: { orderBy: { phase: "asc" } },
          // `consecutiveFailures` is here for PDM-R023, which must read the
          // count rather than derive it — a rule that queried history would be
          // a rule that can produce a fact (P6).
          website: {
            select: {
              id: true,
              url: true,
              registrableDomain: true,
              consecutiveFailures: true,
            },
          },
        },
      });
    },

    /**
     * Evidence for the scan detail page, paginated.
     *
     * A busy site records thousands of requests, so this is never loaded whole
     * — the viewer virtualises and this returns one window (§3.9).
     */
    /**
     * FACETED EVIDENCE BROWSER — §3.8 ("Tab: Evidence"), Phase 2 task 2.15.
     *
     * ⚠️ FILTERED AND PAGED IN THE DATABASE, not in the page. One scan of a
     * busy site records thousands of requests; shipping them all to the browser
     * to filter client-side is the difference between a fast tab and one that
     * locks a laptop. Every filter below has an index behind it (§5.3).
     */
    async evidenceRequests(
      scanId: string,
      params: {
        skip: number;
        take: number;
        search?: string;
        consentPhase?: ConsentPhase;
        resourceType?: string;
        thirdPartyOnly?: boolean;
        trackerOnly?: boolean;
      },
    ) {
      const where = {
        scanId,
        ...(params.consentPhase ? { consentPhase: params.consentPhase } : {}),
        ...(params.resourceType ? { resourceType: params.resourceType } : {}),
        ...(params.thirdPartyOnly ? { isThirdParty: true } : {}),
        ...(params.trackerOnly ? { trackerVendorId: { not: null } } : {}),
        ...(params.search
          ? {
              OR: [
                { host: { contains: params.search, mode: "insensitive" as const } },
                { url: { contains: params.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        db.networkRequest.findMany({
          where,
          orderBy: [{ timestampMs: "asc" }, { id: "asc" }],
          skip: params.skip,
          take: params.take,
        }),
        db.networkRequest.count({ where }),
      ]);

      return { items, total };
    },

    /** Distinct resource types present on this scan, for the filter dropdown. */
    async evidenceResourceTypes(scanId: string): Promise<string[]> {
      const rows = await db.networkRequest.groupBy({
        by: ["resourceType"],
        where: { scanId },
        orderBy: { resourceType: "asc" },
      });
      return rows.map((row) => row.resourceType);
    },

    async evidenceCookies(scanId: string, params: { skip: number; take: number }) {
      const [items, total] = await Promise.all([
        db.cookieRecord.findMany({
          where: { scanId },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          skip: params.skip,
          take: params.take,
        }),
        db.cookieRecord.count({ where: { scanId } }),
      ]);
      return { items, total };
    },

    async evidenceStorage(scanId: string, params: { skip: number; take: number }) {
      const [items, total] = await Promise.all([
        db.storageEntry.findMany({
          where: { scanId },
          orderBy: [{ key: "asc" }, { id: "asc" }],
          skip: params.skip,
          take: params.take,
        }),
        db.storageEntry.count({ where: { scanId } }),
      ]);
      return { items, total };
    },

    async evidenceConsole(scanId: string, params: { skip: number; take: number }) {
      const [items, total] = await Promise.all([
        db.consoleLog.findMany({
          where: { scanId },
          orderBy: { createdAt: "asc" },
          skip: params.skip,
          take: params.take,
        }),
        db.consoleLog.count({ where: { scanId } }),
      ]);
      return { items, total };
    },

    async evidenceScreenshots(scanId: string) {
      return db.screenshot.findMany({
        where: { scanId },
        orderBy: [{ consentPhase: "asc" }, { kind: "asc" }],
      });
    },

    async requests(scanId: string, params: { skip: number; take: number }) {
      const where: Prisma.NetworkRequestWhereInput = { scanId };
      const [total, items] = await Promise.all([
        db.networkRequest.count({ where }),
        db.networkRequest.findMany({
          where,
          orderBy: { timestampMs: "asc" },
          skip: params.skip,
          take: params.take,
        }),
      ]);
      return { total, items };
    },
  };
}

export type ScanRepository = ReturnType<typeof scanRepository>;
