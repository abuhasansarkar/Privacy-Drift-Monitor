import type { ConsentPhase, PhaseStatus, ScanStatus } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { AlertTriangleIcon, CheckIcon, ClockIcon, XIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/severity-badge";

/**
 * SCAN OUTCOME SURFACES — §3.9, §4.3, Phase 2 tasks 2.15/2.16.
 *
 * ⚠️ THE RULE THESE COMPONENTS EXIST TO ENFORCE (P6): `PARTIAL` is a
 * first-class outcome, and an incomplete scan NEVER renders a clean verdict. A
 * journey that did not run reads "Could not be determined" — it is never
 * omitted, never collapsed into COMPLETED, and never rendered as an absence
 * that a reader would take for "nothing found".
 *
 * These are presentational only: they take recorded facts as props and add
 * nothing. The scan repository and the pipeline that fills them are Phase 2 —
 * this is the render layer waiting for them, so nothing downstream is tempted
 * to invent a friendlier status.
 */

export interface ScanPhaseView {
  phase: ConsentPhase;
  status: PhaseStatus;
  requestCount: number;
  cookieCount: number;
  /** Why the phase did not execute. Shown verbatim; never inferred. */
  detail?: string;
}

const PHASE_LABEL: Record<ConsentPhase, string> = {
  NO_CONSENT: t("scans.phaseNoConsent"),
  ACCEPT_ALL: t("scans.phaseAcceptAll"),
  REJECT_ALL: t("scans.phaseRejectAll"),
  WITHDRAW: t("scans.phaseWithdraw"),
  GLOBAL_PRIVACY_CONTROL: t("scans.phaseGpc"),
  INTERACTIVE_ACTION: t("scans.phaseInteractive"),
};

/**
 * There is deliberately no "passed" wording here. EXECUTED records that the
 * journey RAN; whether the result was clean is the rule engine's answer, not
 * this component's.
 */
const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  EXECUTED: t("outcome.detected"),
  UNDETERMINED: t("outcome.undetermined"),
  SKIPPED: t("outcome.undetermined"),
  FAILED: t("outcome.undetermined"),
};

const PHASE_ICON: Record<PhaseStatus, typeof CheckIcon> = {
  EXECUTED: CheckIcon,
  UNDETERMINED: AlertTriangleIcon,
  SKIPPED: ClockIcon,
  FAILED: XIcon,
};

export function ScanPhaseGrid({ phases }: { phases: ScanPhaseView[] }) {
  return (
    <section aria-label={t("scan.phasesTitle")}>
      <h2 className="sr-only">{t("scan.phasesTitle")}</h2>
      {/* 1 → 2 → 4: four journeys never squeeze onto a phone. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {phases.map((phase) => {
          const incomplete = phase.status !== "EXECUTED";
          const Glyph = PHASE_ICON[phase.status];
          return (
            <li
              key={phase.phase}
              className={cn(
                "rounded-lg border p-3.5",
                incomplete
                  ? "border-warning-muted bg-warning-muted"
                  : "border-border bg-card",
              )}
            >
              <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                {PHASE_LABEL[phase.phase]}
              </p>
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 text-small font-semibold",
                  incomplete && "text-warning",
                )}
              >
                <Glyph className={cn("size-3.5", !incomplete && "text-success")} />
                {PHASE_STATUS_LABEL[phase.status]}
              </p>
              <p className="mt-1 text-caption tabular-nums text-muted-foreground">
                {incomplete
                  ? (phase.detail ?? "")
                  : `${formatNumber(phase.requestCount)} · ${formatNumber(phase.cookieCount)}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The banner that must appear above any PARTIAL scan's results.
 *
 * Rendering results without it is the single most damaging bug this product
 * could ship: a reader would take "no issues listed" for "no issues exist",
 * when in fact a consent journey never ran.
 */
export function PartialScanBanner({ phases }: { phases: ScanPhaseView[] }) {
  const missing = phases.filter((phase) => phase.status !== "EXECUTED");
  if (missing.length === 0) return null;

  return (
    <div
      role="status"
      className="flex gap-3 rounded-lg border border-warning-muted bg-warning-muted p-4 text-small text-warning"
    >
      <AlertTriangleIcon className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{t("scan.partialTitle")}</p>
        <p className="mt-1">
          {t("scan.partialBody")}{" "}
          <span className="font-medium">
            {missing.map((phase) => PHASE_LABEL[phase.phase]).join(" · ")}
          </span>
        </p>
      </div>
    </div>
  );
}

const SCAN_STATUS: Record<ScanStatus, { tone: "success" | "warning" | "danger" | "info" | "muted"; label: string }> = {
  QUEUED: { tone: "info", label: t("scanStatus.queued") },
  RUNNING: { tone: "info", label: t("scanStatus.running") },
  COMPLETED: { tone: "success", label: t("scanStatus.completed") },
  PARTIAL: { tone: "warning", label: t("scanStatus.partial") },
  FAILED: { tone: "danger", label: t("scanStatus.failed") },
  CANCELLED: { tone: "muted", label: t("scanStatus.cancelled") },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const { tone, label } = SCAN_STATUS[status];
  return <StatusBadge tone={tone} label={label} />;
}
