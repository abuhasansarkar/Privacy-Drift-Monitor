"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logger } from "@pdm/shared/logger";
import { auditAdminRead, requireSuperAdmin } from "./context";
import {
  drainQueue,
  pauseQueue,
  removeJob,
  resumeQueue,
  retryAllFailed,
  retryJob,
} from "./queue";

/**
 * ADMIN SERVER ACTIONS — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ **EVERY ACTION RE-CHECKS `requireSuperAdmin()`.** A Server Action POSTs to
 * the route that invoked it, so the `(admin)` layout is not in the request path
 * at all — AGENTS.md states this for the proxy and feature doc 19 calls gating
 * only in the layout "a classic hole". Without the line below, any authenticated
 * user who knows the action id can drain the email queue.
 *
 * ⚠️ EVERY ACTION IS AUDIT-LOGGED WITH THE OPERATOR NAMED. "Who drained the
 * email queue" gets asked exactly once, and needs an answer.
 *
 * ⚠️ THE DESTRUCTIVE TWO CONFIRM BY TYPING, in the UI. That is not decoration:
 * `drain` discards work a customer is waiting for and cannot be undone.
 */

const queueAction = z.object({
  queue: z.string().min(1).max(64),
  jobId: z.string().min(1).max(200).optional(),
  /** The queue name, typed by the operator. Guards the destructive two. */
  confirm: z.string().max(64).optional(),
});

async function audited(
  action: string,
  queue: string,
  metadata: Record<string, unknown> = {},
) {
  const admin = await requireSuperAdmin();
  await auditAdminRead(admin, {
    // A queue is platform infrastructure, not one tenant's data.
    agencyId: null,
    entityType: "queue",
    entityId: queue,
    action,
    metadata,
  });
  logger.warn({ component: "admin-queue", action, queue, admin: admin.email, ...metadata },
    "admin queue action");
  return admin;
}

export async function retryJobAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({
    queue: formData.get("queue"),
    jobId: formData.get("jobId"),
  });
  if (!parsed.jobId) return;

  await audited("admin.queue.retry_job", parsed.queue, { jobId: parsed.jobId });
  await retryJob(parsed.queue, parsed.jobId);
  revalidatePath("/admin/queue");
}

export async function removeJobAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({
    queue: formData.get("queue"),
    jobId: formData.get("jobId"),
  });
  if (!parsed.jobId) return;

  await audited("admin.queue.remove_job", parsed.queue, { jobId: parsed.jobId });
  await removeJob(parsed.queue, parsed.jobId);
  revalidatePath("/admin/queue");
}

export async function pauseQueueAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({ queue: formData.get("queue") });
  await audited("admin.queue.pause", parsed.queue);
  await pauseQueue(parsed.queue);
  revalidatePath("/admin/queue");
}

export async function resumeQueueAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({ queue: formData.get("queue") });
  await audited("admin.queue.resume", parsed.queue);
  await resumeQueue(parsed.queue);
  revalidatePath("/admin/queue");
}

/**
 * ⚠️ THE TYPED CONFIRMATION IS CHECKED ON THE SERVER, NOT ONLY IN THE DIALOG.
 * A confirm-by-typing that lives only in the browser is a speed bump; the
 * action is reachable directly, and this is the one that loses customer work.
 */
export async function retryAllFailedAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({
    queue: formData.get("queue"),
    confirm: formData.get("confirm"),
  });
  if (parsed.confirm !== parsed.queue) {
    throw new Error("confirmation does not match the queue name");
  }

  await audited("admin.queue.retry_all", parsed.queue);
  const retried = await retryAllFailed(parsed.queue);
  logger.warn({ component: "admin-queue", queue: parsed.queue, retried }, "retried failed jobs");
  revalidatePath("/admin/queue");
}

export async function drainQueueAction(formData: FormData): Promise<void> {
  const parsed = queueAction.parse({
    queue: formData.get("queue"),
    confirm: formData.get("confirm"),
  });
  if (parsed.confirm !== parsed.queue) {
    throw new Error("confirmation does not match the queue name");
  }

  await audited("admin.queue.drain", parsed.queue);
  await drainQueue(parsed.queue);
  revalidatePath("/admin/queue");
}

/* ─────────────────── Tracker vendor CRUD (§3.12) ─────────────────── */

/**
 * ⚠️ ACCEPTANCE CRITERION: "an admin can add a tracker vendor and it takes
 * effect **without a deploy**." That is why the vendor catalogue is a table and
 * not a constant: the classifier loads it on every analysis run, so a vendor
 * created here names its domain on the very next scan.
 *
 * ⚠️ PATTERNS ARE GLOBS, NOT REGULAR EXPRESSIONS, and `classify.ts` says why:
 * they are curated data edited by a non-engineer, and a regex from that surface
 * is both a footgun and a ReDoS vector on a hot path that runs over thousands
 * of requests per scan. The schema below accepts strings and the matcher treats
 * them as globs — there is nothing to escape.
 */
const vendorInput = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "lower-case letters, digits and hyphens only"),
  category: z.enum([
    "ANALYTICS",
    "MARKETING",
    "SOCIAL",
    "ADVERTISING",
    "FUNCTIONAL",
    "ESSENTIAL",
    "SECURITY",
    "CDN",
    "UNKNOWN",
  ]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  /** Newline- or comma-separated in the form; split here, once. */
  domainPatterns: z.string().max(2_000),
  documentationUrl: z.string().url().max(500).optional().or(z.literal("")),
  isEssentialCandidate: z.coerce.boolean().optional(),
});

function splitPatterns(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export async function createTrackerVendorAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();

  const parsed = vendorInput.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    category: formData.get("category"),
    riskLevel: formData.get("riskLevel"),
    domainPatterns: formData.get("domainPatterns"),
    documentationUrl: formData.get("documentationUrl") ?? "",
    isEssentialCandidate: formData.get("isEssentialCandidate") === "on",
  });

  const patterns = splitPatterns(parsed.domainPatterns);
  if (patterns.length === 0) throw new Error("at least one domain pattern is required");

  const { adminDb } = await import("./context");
  await adminDb().trackerVendor.upsert({
    where: { slug: parsed.slug },
    create: {
      slug: parsed.slug,
      name: parsed.name,
      category: parsed.category as never,
      riskLevel: parsed.riskLevel as never,
      domainPatterns: patterns,
      scriptPatterns: [],
      cookiePatterns: [],
      storagePatterns: [],
      requestPathPatterns: [],
      documentationUrl: parsed.documentationUrl || null,
      isEssentialCandidate: parsed.isEssentialCandidate ?? false,
    },
    update: {
      name: parsed.name,
      category: parsed.category as never,
      riskLevel: parsed.riskLevel as never,
      domainPatterns: patterns,
      documentationUrl: parsed.documentationUrl || null,
      isEssentialCandidate: parsed.isEssentialCandidate ?? false,
    },
  });

  await auditAdminRead(admin, {
    // The vendor catalogue is GLOBAL — it belongs to no tenant, and every
    // tenant's findings change when it does.
    agencyId: null,
    entityType: "tracker_vendor",
    entityId: parsed.slug,
    action: "admin.tracker_vendor.saved",
    metadata: { patterns: patterns.length },
  });

  logger.warn(
    { component: "admin", admin: admin.email, slug: parsed.slug },
    "tracker vendor saved",
  );
  revalidatePath("/admin/trackers");
}

/* ─────────────────── Feature flags (§3.12, §11.13) ─────────────────── */

const flagInput = z.object({
  key: z.string().min(1).max(80),
  enabled: z.coerce.boolean(),
  rolloutPercentage: z.coerce.number().int().min(0).max(100).optional(),
});

/**
 * ⚠️ ACCEPTANCE CRITERION: "feature-flag kill switches take effect within the
 * 60 s cache window." The flag resolver caches; this action writes the row and
 * the next resolution picks it up. It does NOT try to bust the cache — a flag
 * that only takes effect after an explicit invalidation is a flag that stays on
 * when the invalidation is the thing that is broken.
 */
export async function setFeatureFlagAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = flagInput.parse({
    key: formData.get("key"),
    enabled: formData.get("enabled") === "true",
    rolloutPercentage: formData.get("rolloutPercentage") ?? undefined,
  });

  const { adminDb } = await import("./context");
  await adminDb().featureFlag.update({
    where: { key: parsed.key },
    data: {
      enabled: parsed.enabled,
      ...(parsed.rolloutPercentage === undefined
        ? {}
        : { rolloutPercent: parsed.rolloutPercentage }),
    },
  });

  await auditAdminRead(admin, {
    agencyId: null,
    entityType: "feature_flag",
    entityId: parsed.key,
    action: "admin.feature_flag.updated",
    metadata: { enabled: parsed.enabled, rollout: parsed.rolloutPercentage },
  });

  logger.warn(
    { component: "admin", admin: admin.email, flag: parsed.key, enabled: parsed.enabled },
    "feature flag updated",
  );
  revalidatePath("/admin/feature-flags");
}

/* ─────────────────── Agency support actions (§3.12) ─────────────────── */

const agencyAction = z.object({
  agencyId: z.string().uuid(),
  /** Required for every action that changes what a customer can do. */
  reason: z.string().min(8).max(500),
  credits: z.coerce.number().int().min(1).max(100_000).optional(),
});

/**
 * ⚠️ EVERY ACTION HERE REQUIRES A REASON, AND THE MINIMUM LENGTH IS DELIBERATE.
 * "ok", "fix" and "." are not reasons, and an audit trail full of them is an
 * audit trail nobody can use six months later when a customer asks why their
 * account was suspended. Eight characters does not guarantee a good reason; it
 * does guarantee somebody typed a sentence fragment rather than pressing space.
 */
export async function suspendAgencyAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = agencyAction.parse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
  });

  const { adminDb } = await import("./context");
  const before = await adminDb().agency.findUniqueOrThrow({
    where: { id: parsed.agencyId },
    select: { status: true },
  });

  await adminDb().agency.update({
    where: { id: parsed.agencyId },
    data: { status: "SUSPENDED" },
  });

  await auditAdminRead(admin, {
    agencyId: parsed.agencyId,
    entityType: "agency",
    entityId: parsed.agencyId,
    action: "admin.agency.suspended",
    metadata: { reason: parsed.reason, from: before.status },
  });

  logger.warn(
    { component: "admin", admin: admin.email, agencyId: parsed.agencyId },
    "agency suspended",
  );
  revalidatePath(`/admin/agencies/${parsed.agencyId}`);
}

export async function reactivateAgencyAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = agencyAction.parse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
  });

  const { adminDb } = await import("./context");
  await adminDb().agency.update({
    where: { id: parsed.agencyId },
    data: { status: "ACTIVE" },
  });

  await auditAdminRead(admin, {
    agencyId: parsed.agencyId,
    entityType: "agency",
    entityId: parsed.agencyId,
    action: "admin.agency.reactivated",
    metadata: { reason: parsed.reason },
  });
  revalidatePath(`/admin/agencies/${parsed.agencyId}`);
}

/**
 * §3.12's "extend trial".
 *
 * ⚠️ IT MOVES `trialEndsAt` AND NOTHING ELSE — it does not touch `status`, and
 * it does not tell Stripe. §9.1 makes Stripe authoritative for subscription
 * state and the webhook its only writer; a support extension is OUR grace on
 * OUR projection, and pushing it into Stripe would mean two systems each
 * believing they own the trial date. If the extension needs to survive a
 * reconciliation, it belongs in `entitlementOverrides`, not here.
 */
export async function extendTrialAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = agencyAction.parse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
  });

  const { adminDb } = await import("./context");
  const subscription = await adminDb().subscription.findFirst({
    where: { agencyId: parsed.agencyId },
    select: { id: true, trialEndsAt: true },
  });
  if (!subscription) throw new Error("no subscription to extend");

  // From TODAY when the trial has already lapsed, otherwise from its end — so
  // extending a trial that expired last week gives fourteen usable days rather
  // than seven days in the past.
  const base =
    subscription.trialEndsAt && subscription.trialEndsAt > new Date()
      ? subscription.trialEndsAt
      : new Date();
  const trialEndsAt = new Date(base.getTime() + 14 * 86_400_000);

  await adminDb().subscription.update({
    where: { id: subscription.id },
    data: { trialEndsAt, status: "TRIALING" },
  });

  await auditAdminRead(admin, {
    agencyId: parsed.agencyId,
    entityType: "subscription",
    entityId: subscription.id,
    action: "admin.agency.trial_extended",
    metadata: { reason: parsed.reason, trialEndsAt: trialEndsAt.toISOString() },
  });
  revalidatePath(`/admin/agencies/${parsed.agencyId}`);
}

/**
 * §3.12's "grant credits".
 *
 * ⚠️ IT RAISES THE ENTITLEMENT, IT DOES NOT DECREMENT THE LEDGER. `UsageRecord`
 * is what the customer actually consumed and is billing evidence; editing it to
 * hand out credits would rewrite history and make the reconciliation job report
 * a discrepancy nobody can explain. The grant belongs in
 * `entitlementOverrides`, which `resolveEntitlements` layers over the plan —
 * one service, no plan logic anywhere else (§9.2).
 */
export async function grantCreditsAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = agencyAction.parse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
    credits: formData.get("credits"),
  });
  if (!parsed.credits) throw new Error("credits required");

  const { adminDb } = await import("./context");
  const subscription = await adminDb().subscription.findFirst({
    where: { agencyId: parsed.agencyId },
    include: { plan: true },
  });
  if (!subscription) throw new Error("no subscription");

  const overrides = (subscription.entitlementOverrides ?? {}) as Record<string, unknown>;
  const planCredits =
    (subscription.plan.entitlements as Record<string, unknown>).aiCreditsPerMonth ?? 0;
  const current =
    typeof overrides.aiCreditsPerMonth === "number"
      ? overrides.aiCreditsPerMonth
      : Number(planCredits);

  await adminDb().subscription.update({
    where: { id: subscription.id },
    data: {
      entitlementOverrides: {
        ...overrides,
        aiCreditsPerMonth: current + parsed.credits,
      },
    },
  });

  await auditAdminRead(admin, {
    agencyId: parsed.agencyId,
    entityType: "subscription",
    entityId: subscription.id,
    action: "admin.agency.credits_granted",
    metadata: { reason: parsed.reason, credits: parsed.credits, newCap: current + parsed.credits },
  });
  revalidatePath(`/admin/agencies/${parsed.agencyId}`);
}

/* ─────────────────── Stripe webhook replay (§3.12, §9.1) ─────────────────── */

/**
 * ⚠️ REPLAY RE-RUNS OUR HANDLER OVER A STORED PAYLOAD; IT DOES NOT ASK STRIPE
 * TO RESEND. That distinction matters twice: the stored payload is what we
 * actually received (so a replay reproduces the original conditions exactly),
 * and processing is idempotent on `stripeEventId` (§9.1), so a replay of an
 * already-processed event is a no-op rather than a double-charge.
 */
export async function replayWebhookAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const stripeEventId = z.string().min(1).max(200).parse(formData.get("stripeEventId"));

  const { adminDb } = await import("./context");
  const event = await adminDb().stripeWebhookEvent.findUnique({
    where: { stripeEventId },
  });
  if (!event) throw new Error("event not found");

  const { replayStripeEvent } = await import("@/server/services/billing-webhook");
  await replayStripeEvent(event.payload);

  await auditAdminRead(admin, {
    agencyId: null,
    entityType: "stripe_webhook_event",
    entityId: stripeEventId,
    action: "admin.billing.webhook_replayed",
    metadata: { type: event.type },
  });
  revalidatePath("/admin/billing");
}

/* ─────────────────── Impersonation (§3.12) ─────────────────── */

/**
 * ⚠️ THE REASON IS MANDATORY AND IS RECORDED AGAINST THE **CUSTOMER'S** AGENCY,
 * so it appears in that agency's own audit log. See the note in
 * `admin/impersonation.ts`: a customer who asks "did anyone from your company
 * look at my account" can see the answer themselves.
 */
export async function startImpersonationAction(formData: FormData): Promise<void> {
  const admin = await requireSuperAdmin();
  const parsed = agencyAction.parse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
  });

  const { startImpersonation } = await import("./impersonation");
  await startImpersonation(admin, parsed.agencyId, parsed.reason);

  // Straight into the customer's dashboard — support is here to see a screen,
  // not to admire a confirmation.
  redirect("/app");
}

export async function stopImpersonationAction(): Promise<void> {
  const { stopImpersonation } = await import("./impersonation");
  await stopImpersonation();
  redirect("/admin/agencies");
}
