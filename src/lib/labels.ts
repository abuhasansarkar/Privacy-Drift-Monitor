import type { MonitoringStatus, ScanFrequency } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";

/**
 * ENUM → LABEL maps, in one place.
 *
 * These were previously inlined per page, which is how a value ends up reading
 * "Manual" in the websites table and "MANUAL" in the Add Website wizard. A
 * `Record<Enum, string>` also fails to compile when the enum gains a member, so
 * a new scan frequency cannot ship with a missing label.
 */

export const FREQUENCY_LABEL: Record<ScanFrequency, string> = {
  DAILY: t("frequency.daily"),
  WEEKLY: t("frequency.weekly"),
  MONTHLY: t("frequency.monthly"),
  MANUAL: t("frequency.manual"),
};

export const MONITORING_LABEL: Record<MonitoringStatus, string> = {
  ACTIVE: t("monitoring.active"),
  PAUSED: t("monitoring.paused"),
  ERROR: t("monitoring.error"),
};

/** Paired with MONITORING_LABEL — colour never carries the state alone (§11.6). */
export const MONITORING_TONE = {
  ACTIVE: "success",
  PAUSED: "muted",
  ERROR: "warning",
} as const satisfies Record<MonitoringStatus, string>;
