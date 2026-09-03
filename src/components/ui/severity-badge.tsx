import type { ReactNode } from "react";
import type { Severity } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ShieldAlertIcon,
} from "./icons";

/**
 * SEVERITY & STATUS BADGES — §11.6, WCAG 1.4.1.
 *
 * ⚠️ THE RULE THIS FILE EXISTS TO ENFORCE: severity is never conveyed by colour
 * alone. Every badge below is colour **plus** icon **plus** text, and the text
 * is not optional — there is no `iconOnly` prop and there must not be one. A
 * colour-blind user, a greyscale print of a report and a screen reader all get
 * the same information.
 *
 * Each severity gets a DISTINCT icon shape, not one icon recoloured, so the
 * distinction survives greyscale.
 */

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: "bg-severity-critical-bg text-severity-critical",
  HIGH: "bg-severity-high-bg text-severity-high",
  MEDIUM: "bg-severity-medium-bg text-severity-medium",
  LOW: "bg-severity-low-bg text-severity-low",
  INFO: "bg-severity-info-bg text-severity-info",
};

const SEVERITY_ICON: Record<Severity, typeof AlertCircleIcon> = {
  CRITICAL: ShieldAlertIcon,
  HIGH: AlertTriangleIcon,
  MEDIUM: AlertCircleIcon,
  LOW: AlertCircleIcon,
  INFO: AlertCircleIcon,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: t("severity.critical"),
  HIGH: t("severity.high"),
  MEDIUM: t("severity.medium"),
  LOW: t("severity.low"),
  INFO: t("severity.info"),
};

const CHIP =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-caption font-semibold whitespace-nowrap";

export function SeverityBadge({
  severity,
  count,
}: {
  severity: Severity;
  /** When present the badge reads "2 High" rather than "High". */
  count?: number;
}) {
  const Glyph = SEVERITY_ICON[severity];
  const label = SEVERITY_LABEL[severity];
  return (
    <span className={cn(CHIP, SEVERITY_STYLE[severity])}>
      <Glyph className="size-3.5" />
      {count === undefined ? label : `${count} ${label}`}
    </span>
  );
}

/**
 * A neutral chip for counts and secondary facts — carries no severity meaning.
 *
 * ⚠️ `label` IS NOT OPTIONAL POLISH WHEREVER THE NUMBER IS AMBIGUOUS. A bare
 * chip reading "1" beside a "1 Critical" badge tells a sighted reader nothing
 * about what the second number counts, and tells a screen-reader user even
 * less — it announces "one". Pass `label` and the chip carries it as both a
 * tooltip and its accessible name.
 */
export function MutedBadge({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <span
      className={cn(CHIP, "bg-muted text-muted-foreground font-medium")}
      title={label}
      aria-label={label}
    >
      {children}
    </span>
  );
}

type Tone = "success" | "warning" | "danger" | "info" | "muted";

const TONE_STYLE: Record<Tone, string> = {
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning",
  danger: "bg-danger-muted text-danger",
  info: "bg-info-muted text-info",
  muted: "bg-muted text-muted-foreground",
};

const TONE_ICON: Record<Tone, typeof CheckIcon | null> = {
  success: CheckIcon,
  warning: AlertTriangleIcon,
  danger: AlertCircleIcon,
  info: ClockIcon,
  muted: null,
};

/**
 * Status chip for non-severity state (scan outcome, monitoring state).
 *
 * Same contract as severity: the tone never carries the meaning on its own —
 * `label` is required and an icon accompanies every tone that has one.
 */
export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  const Glyph = TONE_ICON[tone];
  return (
    <span className={cn(CHIP, TONE_STYLE[tone])}>
      {Glyph ? <Glyph className="size-3.5" /> : null}
      {label}
    </span>
  );
}
