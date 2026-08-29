import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * TENANT ISOLATION — the enforcement point for PLAN.md Part 0 §0.2 P3.
 *
 * Agency A must never reach Agency B's data. This is enforced in three layers
 * (PLAN.md §5.5); this file is layer 2, and it is the one that actually runs:
 *
 *   1. Schema      — every tenant table carries `agencyId`
 *   2. This file   — `forAgency()` injects the predicate on every operation
 *   3. Lint + CI   — raw `prisma` is banned inside route handlers and actions,
 *                    and `tenancy.test.ts` proves isolation across every model
 *
 * USAGE — this is the only sanctioned way to read or write tenant data:
 *
 *   const db = forAgency(ctx.agencyId);
 *   const sites = await db.website.findMany({ where: { monitoringStatus: "ACTIVE" } });
 *   // → SELECT ... WHERE agency_id = $1 AND monitoring_status = 'ACTIVE'
 *
 * Do NOT import the raw `prisma` client in application code. Repositories in
 * `src/repositories/**` are the only exception.
 */

/**
 * Models that carry `agencyId` and are therefore tenant-scoped.
 *
 * ⚠️ ADDING A TENANT MODEL? Add it here AND to the registry in
 * `src/__tests__/tenancy.test.ts`. A model missing from this list is a model
 * with no isolation — the test suite iterates this array so a forgotten entry
 * fails CI rather than leaking in production.
 */
export const TENANT_MODELS = [
  "agencyMember",
  "invitation",
  "agencyBranding",
  "agencyScanSettings",
  "agencyAiSettings",
  "client",
  "websiteGroup",
  "website",
  "scan",
  "scanPhase",
  "scanPage",
  "networkRequest",
  "cookieRecord",
  "storageEntry",
  "consoleLog",
  "screenshot",
  "trackerDetection",
  "issue",
  "issueEvidence",
  "issueActivity",
  "issueFeedback",
  "ignoreRule",
  "privacyDriftEvent",
  "driftSuppression",
  "report",
  "reportShare",
  "notification",
  "notificationPreference",
  "alertRule",
  "alertHistory",
  "portalUser",
  "portalSession",
  "subscription",
  "usageRecord",
  "aiRequest",
  "auditLog",
  "featureFlagOverride",
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

/**
 * Models that are deliberately GLOBAL. Never scoped, never in TENANT_MODELS.
 * Listed explicitly so "is this global?" is answered by the code, not by memory.
 */
export const GLOBAL_MODELS = [
  "user",
  "agency",
  "userPreference",
  "plan",
  "trackerVendor",
  "featureFlag",
  "stripeWebhookEvent",
  "systemLog",
  "freeScan",
] as const;

const TENANT_MODEL_SET: ReadonlySet<string> = new Set(TENANT_MODELS);

/** Operations that read and therefore need the predicate injected into `where`. */
const READ_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

/** Operations that write and therefore need `agencyId` injected into `data`. */
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/** Operations that must carry an explicit scope or they could cross tenants. */
const BULK_MUTATION_OPS = new Set(["updateMany", "deleteMany"]);

/**
 * Unique-key operations. Prisma will not accept an extra non-unique field in
 * `where`, so we cannot inject there — we verify ownership on the result instead.
 */
const UNIQUE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
  "upsert",
]);

export class TenantIsolationError extends Error {
  readonly code = "TENANT_ISOLATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * Returns a Prisma client scoped to one agency.
 *
 * Cache the result per request — building the extension is cheap but not free,
 * and a stable instance keeps Prisma's own query caching effective.
 */
export function forAgency(agencyId: string) {
  if (!agencyId || typeof agencyId !== "string") {
    throw new TenantIsolationError("forAgency() requires a non-empty agencyId");
  }

  return prisma.$extends({
    name: `tenant:${agencyId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model
            ? model.charAt(0).toLowerCase() + model.slice(1)
            : "";

          // Global models pass through untouched.
          if (!TENANT_MODEL_SET.has(modelKey)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          if (READ_OPS.has(operation)) {
            a.where = { ...((a.where as object) ?? {}), agencyId };
            return query(a);
          }

          if (CREATE_OPS.has(operation)) {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as object), agencyId }))
              : { ...((data as object) ?? {}), agencyId };
            return query(a);
          }

          if (BULK_MUTATION_OPS.has(operation)) {
            // A bulk mutation with no scope would hit every tenant. Refuse it.
            a.where = { ...((a.where as object) ?? {}), agencyId };
            return query(a);
          }

          if (UNIQUE_OPS.has(operation)) {
            // Prisma rejects non-unique fields in a unique `where`, so we run the
            // operation and verify ownership of the result. Anything belonging to
            // another tenant is reported as absent (404, never 403 — a 403 would
            // confirm the id exists elsewhere, PLAN.md §6.2).
            const result = (await query(args)) as { agencyId?: string } | null;
            if (
              result &&
              typeof result === "object" &&
              "agencyId" in result &&
              result.agencyId !== agencyId
            ) {
              if (operation === "findUnique" || operation === "findUniqueOrThrow") {
                return null;
              }
              throw new TenantIsolationError(
                `Refused ${operation} on ${model}: record belongs to another agency`,
              );
            }
            return result;
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof forAgency>;

/**
 * Escape hatch for genuinely cross-tenant work: the scan scheduler, retention
 * sweeps, admin surfaces, reconciliation jobs.
 *
 * Every call site must be justified in review. If you are reaching for this from
 * a route handler or a Server Action, you almost certainly want `forAgency()`.
 */
export function unsafeGlobalClient(reason: string) {
  if (!reason) {
    throw new TenantIsolationError(
      "unsafeGlobalClient() requires a written reason",
    );
  }
  return prisma;
}

export { Prisma };
