import type { Severity } from "@pdm/schemas";
import { DUPLICATE_WINDOW_MS, isDuplicate } from "./dedupe";
import { applyQuietHours } from "./quiet-hours";
import type {
  AlertEvent,
  AlertRuleSpec,
  DispatchContext,
  DispatchPlan,
  EmailDelivery,
  InAppDelivery,
  RecipientSpec,
} from "./types";

/**
 * THE DISPATCH DECISION — PLAN.md Part VI §6.6.
 *
 * ⚠️ PURE. No database, no queue, no `Date.now()`. Everything it needs arrives
 * as an argument, and everything it decides comes back as data the caller then
 * executes. That is what makes "does a HIGH alert at 02:00 in Sydney get
 * deferred to 07:00 on the morning the clocks change?" a unit test instead of
 * a production incident.
 *
 * ⚠️ IN-APP AND EMAIL ARE INDEPENDENT PATHS, and the order below enforces it:
 * in-app rows are decided BEFORE any email consideration and are never
 * cancelled by an email decision. §12.3 requires alerts to keep reaching
 * logged-in users during a Resend outage, and a shared code path is how that
 * requirement quietly stops holding.
 */

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export function meetsSeverity(actual: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[minimum];
}

/** Does the rule's scope cover the event's website? */
export function ruleMatchesScope(rule: AlertRuleSpec, event: AlertEvent): boolean {
  switch (rule.scopeType) {
    case "ALL":
      return true;
    case "WEBSITE":
      return rule.scopeId !== null && rule.scopeId === event.websiteId;
    case "GROUP":
      return rule.scopeId !== null && rule.scopeId === event.websiteGroupId;
    case "CLIENT":
      return rule.scopeId !== null && rule.scopeId === event.clientId;
    default:
      // Exhaustive today. A scope type added to the schema without a branch
      // here must NOT silently match everything.
      return false;
  }
}

export function ruleMatches(rule: AlertRuleSpec, event: AlertEvent): boolean {
  if (!rule.enabled) return false;
  if (!rule.triggerTypes.includes(event.type)) return false;
  if (!meetsSeverity(event.severity, rule.minSeverity)) return false;
  return ruleMatchesScope(rule, event);
}

/**
 * ⚠️ Empty `websiteScope` means ALL websites, not none — the same convention
 * as `permissions.ts`. Inverting it here would email a scoped developer about
 * every site in the portfolio, or nobody about anything.
 */
function recipientCoversWebsite(
  recipient: RecipientSpec,
  websiteId: string | null,
): boolean {
  if (recipient.websiteScope.length === 0) return true;
  if (websiteId === null) return true;
  return recipient.websiteScope.includes(websiteId);
}

/**
 * Builds the plan for one event.
 *
 * The duplicate window suppresses the whole event, including the in-app row:
 * a notification centre with the same line twelve times is as unusable as an
 * inbox with twelve copies of the same email.
 */
export function planDispatch(params: {
  event: AlertEvent;
  rules: readonly AlertRuleSpec[];
  recipients: readonly RecipientSpec[];
  context: DispatchContext;
  /** Overridable for tests; §6.6 fixes it at 4 hours in production. */
  duplicateWindowMs?: number;
}): DispatchPlan {
  const { event, rules, recipients, context } = params;
  const plan: DispatchPlan = { inApp: [], emails: [], suppressed: [], rolledUp: false };

  if (
    isDuplicate(
      context.lastSentAt,
      context.now,
      params.duplicateWindowMs ?? DUPLICATE_WINDOW_MS,
    )
  ) {
    plan.suppressed.push({ reason: "duplicate_window" });
    return plan;
  }

  const matching = rules.filter((rule) => ruleMatches(rule, event));
  if (matching.length === 0) {
    plan.suppressed.push({ reason: "no_matching_rule" });
    return plan;
  }

  /*
   * ⚠️ CRITICAL PIERCES QUIET HOURS BY DEFAULT (§6.6), and the opt-out is
   * per rule. When several rules match, the MOST PERMISSIVE wins — a rule the
   * agency wrote specifically to be woken by must not be silenced by a broader
   * rule they forgot about.
   */
  const overridesQuietHours =
    event.severity === "CRITICAL" &&
    matching.some((rule) => rule.criticalOverridesQuietHours);

  // The tightest quiet-hours window among the matching rules, so an alert is
  // never sent inside a window the agency configured on any of them.
  const quietRule =
    matching.find((rule) => rule.quietHoursStart && rule.quietHoursEnd) ?? null;

  const emailSeen = new Set<string>();

  for (const recipient of recipients) {
    if (!recipientCoversWebsite(recipient, event.websiteId)) {
      plan.suppressed.push({
        reason: "out_of_website_scope",
        detail: recipient.userId,
      });
      continue;
    }

    // ── In-app: decided first, and never gated on the email decision ──────
    if (recipient.inApp && recipient.digest !== "NEVER") {
      plan.inApp.push(toInApp(recipient.userId, event));
    }

    // ── Email ────────────────────────────────────────────────────────────
    if (!recipient.email_ || recipient.digest === "NEVER") {
      plan.suppressed.push({
        reason: "recipient_opted_out",
        detail: recipient.userId,
      });
      continue;
    }
    if (recipient.emailUndeliverable) {
      plan.suppressed.push({
        reason: "email_undeliverable",
        detail: recipient.email,
      });
      continue;
    }
    if (!matching.some((rule) => rule.channels.includes("email"))) continue;

    emailSeen.add(recipient.email);
    plan.emails.push(
      buildEmail({
        ruleId: matching[0]?.id ?? null,
        userId: recipient.userId,
        email: recipient.email,
        digest: recipient.digest,
        event,
        context,
        quietRule,
        overridesQuietHours,
      }),
    );
  }

  /*
   * Explicit `recipients` on a rule are addresses OUTSIDE the member list — a
   * shared inbox, a client-side contact. They have no `NotificationPreference`
   * row and no website scope, so they receive whatever the rule matched, and
   * always immediately: a digest preference belongs to a person with an
   * account, not to an address on a rule.
   */
  for (const rule of matching) {
    if (!rule.channels.includes("email")) continue;
    for (const address of rule.recipients) {
      if (emailSeen.has(address)) continue;
      emailSeen.add(address);
      plan.emails.push(
        buildEmail({
          ruleId: rule.id,
          userId: null,
          email: address,
          digest: "IMMEDIATE",
          event,
          context,
          quietRule: rule.quietHoursStart && rule.quietHoursEnd ? rule : null,
          overridesQuietHours,
        }),
      );
    }
  }

  return plan;
}

function toInApp(userId: string, event: AlertEvent): InAppDelivery {
  return {
    userId,
    type: event.type,
    severity: event.severity,
    title: event.title,
    body: event.body,
    linkUrl: event.linkUrl,
    entityType: event.entityType,
    entityId: event.entityId,
  };
}

function buildEmail(params: {
  ruleId: string | null;
  userId: string | null;
  email: string;
  digest: RecipientSpec["digest"];
  event: AlertEvent;
  context: DispatchContext;
  quietRule: Pick<AlertRuleSpec, "quietHoursStart" | "quietHoursEnd"> | null;
  overridesQuietHours: boolean;
}): EmailDelivery {
  const base = {
    ruleId: params.ruleId,
    userId: params.userId,
    email: params.email,
    type: params.event.type,
  };

  /*
   * A digest recipient is NOT quiet-hours-deferred: the digest already lands at
   * 08:00 agency time, which is outside any sane quiet window, and deferring it
   * a second time would push it out of the day it summarises.
   */
  if (params.digest === "DAILY" || params.digest === "WEEKLY") {
    return {
      ...base,
      deliverAt: null,
      deferredByQuietHours: false,
      digest: params.digest,
    };
  }

  const decision = params.quietRule
    ? applyQuietHours(
        params.context.now,
        {
          start: params.quietRule.quietHoursStart,
          end: params.quietRule.quietHoursEnd,
          timeZone: params.context.timeZone,
        },
        params.overridesQuietHours,
      )
    : ({ deferred: false } as const);

  return {
    ...base,
    deliverAt: decision.deferred ? decision.deliverAt : null,
    deferredByQuietHours: decision.deferred,
    digest: null,
  };
}
