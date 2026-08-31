import type {
  DigestFrequency,
  NotificationType,
  Severity,
} from "@pdm/schemas";

/**
 * ALERT DISPATCH TYPES — PLAN.md Part VI §6.6.
 *
 * ⚠️ EVERY TYPE HERE IS PLAIN DATA. `policy.ts` is a pure function over these,
 * with no database, no queue and no clock of its own — quiet hours across DST
 * and duplicate suppression are exactly the logic that has to be testable
 * without standing up Postgres and Redis to move time around.
 */

/** Scope of an alert rule. Mirrors `AlertRule.scopeType`, which is a String column. */
export type AlertScopeType = "ALL" | "GROUP" | "CLIENT" | "WEBSITE";

export const ALERT_SCOPE_TYPES: readonly AlertScopeType[] = [
  "ALL",
  "GROUP",
  "CLIENT",
  "WEBSITE",
];

export type AlertChannel = "in_app" | "email";

/** The thing that happened. Produced by analysis, scanning or billing. */
export interface AlertEvent {
  agencyId: string;
  type: NotificationType;
  severity: Severity;
  /** Rule-authored or copy-authored. Never AI-generated (P2). */
  title: string;
  body: string;
  /** Deep link into the app. Relative — the email layer prefixes the origin. */
  linkUrl: string | null;
  entityType: string | null;
  entityId: string | null;
  /** Used to match `WEBSITE`-scoped and `GROUP`-scoped rules. */
  websiteId: string | null;
  websiteGroupId: string | null;
  clientId: string | null;
  websiteLabel: string | null;
}

/** An `AlertRule` row, narrowed to what the decision needs. */
export interface AlertRuleSpec {
  id: string;
  enabled: boolean;
  scopeType: AlertScopeType;
  scopeId: string | null;
  triggerTypes: readonly NotificationType[];
  minSeverity: Severity;
  channels: readonly string[];
  digest: DigestFrequency;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  criticalOverridesQuietHours: boolean;
  /** Explicit extra addresses. Empty means "the agency's members". */
  recipients: readonly string[];
}

/** A member who could receive this, plus their per-type preference. */
export interface RecipientSpec {
  userId: string;
  email: string;
  /** True once a hard bounce was recorded (§9.5) — we stop emailing. */
  emailUndeliverable: boolean;
  /**
   * Website scope from `AgencyMember.websiteScope`. Empty means ALL websites,
   * NOT none — the same convention as `permissions.ts`.
   */
  websiteScope: readonly string[];
  inApp: boolean;
  email_: boolean;
  digest: DigestFrequency;
}

export interface DispatchContext {
  now: Date;
  /** Agency timezone. Quiet hours and digests are both computed in it (§6.6). */
  timeZone: string;
  /** Last time this (agency, type, entity) alerted, for the 4-hour window. */
  lastSentAt: Date | null;
}

/** In-app rows to insert. Always immediate — it is free and non-intrusive (§6.6). */
export interface InAppDelivery {
  userId: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  linkUrl: string | null;
  entityType: string | null;
  entityId: string | null;
}

/** One email to send, or to hold for a digest. */
export interface EmailDelivery {
  ruleId: string | null;
  userId: string | null;
  email: string;
  type: NotificationType;
  /** `null` means send now; a date means enqueue delayed until then. */
  deliverAt: Date | null;
  /** Set when quiet hours moved it, for the alert-history reason column. */
  deferredByQuietHours: boolean;
  /** Rolled into the next digest instead of sent on its own. */
  digest: Exclude<DigestFrequency, "IMMEDIATE" | "NEVER"> | null;
}

export type SuppressionReason =
  | "duplicate_window"
  | "no_matching_rule"
  | "severity_below_threshold"
  | "recipient_opted_out"
  | "email_undeliverable"
  | "out_of_website_scope";

export interface DispatchPlan {
  inApp: InAppDelivery[];
  emails: EmailDelivery[];
  /** Why nothing (or less than expected) was sent. Recorded, never silent. */
  suppressed: { reason: SuppressionReason; detail?: string }[];
  /** True when this scan's issues collapsed into one message (§6.6). */
  rolledUp: boolean;
}
