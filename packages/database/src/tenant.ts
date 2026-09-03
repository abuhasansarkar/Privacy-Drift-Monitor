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
 * `packages/database/src/repositories/**` are the only exception.
 */

/**
 * Models that carry `agencyId` and are therefore tenant-scoped.
 *
 * ⚠️ ADDING A TENANT MODEL? Add it here. `src/__tests__/tenancy.test.ts` reads
 * the Prisma DMMF and fails CI if any model with an `agencyId` field is missing
 * from this list, or if any entry here does not name a real model.
 *
 * Entries are matched CASE-INSENSITIVELY against the Prisma model name, because
 * Prisma's client key only lowercases the FIRST character: model `AIRequest`
 * becomes `prisma.aIRequest`, not `prisma.aiRequest`. Comparing exact camelCase
 * silently dropped `AIRequest` out of scoping entirely.
 */
export const TENANT_MODELS = [
  "agencyMember",
  "invitation",
  "agencyBranding",
  "agencyScanSettings",
  "agencyAiSettings",
  "userPreference",
  "client",
  "websiteGroup",
  "website",
  "scan",
  "scanPhase",
  "scanPage",
  "networkRequest",
  "cnameResolution",
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
  "websiteJurisdictionConfig",
  "policyAudit",
  "sessionReplayAudit",
  "gpcAuditRecord",
] as const;

export type TenantModel = (typeof TENANT_MODELS)[number];

/**
 * Models that are deliberately GLOBAL. Never scoped, never in TENANT_MODELS.
 * Listed explicitly so "is this global?" is answered by the code, not by memory.
 */
export const GLOBAL_MODELS = [
  "user",
  "agency",
  "plan",
  "trackerVendor",
  "featureFlag",
  "stripeWebhookEvent",
  /** Carries a nullable `agencyId` for platform-level diagnostics — never scoped. */
  "systemLog",
  "freeScan",
  /**
   * §3.2's free-scanner blocklist. Global for the same reason `freeScan` is:
   * the surface is PRE-TENANT, and the domain rate limit and blocklist are
   * deliberately platform-wide — one agency's block protects every submitter,
   * and a per-tenant blocklist would let a distributed abuser walk around it.
   */
  "freeScanBlocklist",
] as const;

const TENANT_MODEL_SET: ReadonlySet<string> = new Set(
  TENANT_MODELS.map((m) => m.toLowerCase()),
);

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

/**
 * Bulk mutations. Unscoped, these would hit every tenant.
 *
 * DIVERGENCE FROM PLAN.md §5.5, deliberate: the plan specifies THROWING when a
 * bulk mutation carries no `agencyId` predicate. We inject the predicate
 * instead. Injection is strictly safer — throwing depends on the caller having
 * remembered to write a predicate, whereas injection is unconditional and the
 * database does the enforcing. A cross-tenant `updateMany` therefore matches
 * zero rows rather than relying on a runtime guard the caller could satisfy
 * with the WRONG agencyId. `tenancy.test.ts` asserts `count === 0`.
 */
const BULK_MUTATION_OPS = new Set([
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
]);

/**
 * Unique-key operations.
 *
 * Prisma's "extended where unique" (GA since Prisma 5, and we are on 6) allows
 * NON-unique filters alongside the unique selector in `where` for findUnique,
 * update, delete and upsert. So we inject `agencyId` directly into `where` and
 * the database does the enforcement atomically:
 *
 *   UPDATE websites SET ... WHERE id = $1 AND agency_id = $2
 *
 * A row belonging to another tenant simply does not match, so:
 *   - findUnique          → null
 *   - findUniqueOrThrow   → P2025
 *   - update / delete     → P2025, and NOTHING IS MUTATED
 *
 * This replaces an earlier mutate-then-verify approach that ran the operation
 * first and threw afterwards — which modified the other tenant's row before
 * rejecting, with no transaction to roll it back. Never reintroduce that shape.
 *
 * P2025 surfaces as 404, never 403 — a 403 would confirm the id exists in
 * another tenant (PLAN.md §6.2).
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
          // Lowercased whole-string, NOT camelCase. See TENANT_MODELS above:
          // Prisma turns `AIRequest` into `aIRequest`, so camelCasing here made
          // that model invisible to the scoping check.
          const modelKey = model ? model.toLowerCase() : "";

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
            // Unconditional — see BULK_MUTATION_OPS. Another tenant's rows
            // simply do not match, so `count` comes back 0.
            a.where = { ...((a.where as object) ?? {}), agencyId };
            return query(a);
          }

          if (UNIQUE_OPS.has(operation)) {
            // Inject the tenant predicate into `where` so the DATABASE enforces
            // ownership atomically. Another tenant's row never matches, so it is
            // never read and — critically — never mutated. See UNIQUE_OPS above.
            a.where = { ...((a.where as object) ?? {}), agencyId };

            // `upsert` can also CREATE. Stamp the tenant onto the create payload,
            // or an upsert-that-inserts would produce a row with no agencyId.
            if (operation === "upsert") {
              a.create = { ...((a.create as object) ?? {}), agencyId };
            }

            return query(a);
          }

          // FAIL CLOSED. Reaching here means Prisma introduced an operation
          // this extension does not know how to scope. Passing it through
          // unscoped would leak silently; refusing it is a loud, fixable bug.
          throw new TenantIsolationError(
            `Unscoped operation "${operation}" on tenant model "${model}". ` +
              `Add it to the operation sets in packages/database/src/tenant.ts.`,
          );
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
