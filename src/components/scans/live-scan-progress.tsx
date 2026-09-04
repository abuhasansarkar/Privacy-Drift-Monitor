"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ConsentPhase } from "@pdm/schemas";
import { t } from "@pdm/shared/copy";
import { ScanProgress, type ProgressStage } from "./scan-progress";
import type { ScanProgressPayload } from "@/app/api/v1/scans/[id]/progress/route";

/**
 * LIVE SCAN PROGRESS — §3.9, Phase 2 task 2.16.
 *
 * Polls while the scan is in flight and refreshes the server component once it
 * reaches a terminal state, so the page swaps from "running" to the recorded
 * evidence without the user reloading.
 *
 * ⚠️ THE BAR IS DERIVED FROM PHASE ROWS, never from elapsed time. A time-based
 * bar on a job whose duration we cannot predict is a progress bar that lies —
 * it reaches 90% and sits there. Four journeys, N recorded: that number is real.
 *
 * ⚠️ A JOURNEY IN FLIGHT SHOWS NO COUNTS. `ScanProgress` renders totals only
 * for finished stages: a partial count read as a final one is a fact the
 * scanner has not established (P1).
 */

const PHASE_ORDER: ConsentPhase[] = [
  "NO_CONSENT",
  "REJECT_ALL",
  "ACCEPT_ALL",
  "WITHDRAW",
];

const PHASE_LABEL: Record<ConsentPhase, string> = {
  NO_CONSENT: t("scans.phaseNoConsent"),
  REJECT_ALL: t("scans.phaseRejectAll"),
  ACCEPT_ALL: t("scans.phaseAcceptAll"),
  WITHDRAW: t("scans.phaseWithdraw"),
  GLOBAL_PRIVACY_CONTROL: t("scans.phaseGpc"),
  INTERACTIVE_ACTION: t("scans.phaseInteractive"),
};

/** Terminal states — polling stops and the page refreshes. */
const TERMINAL = new Set(["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]);

const POLL_MS = 3_000;

export function LiveScanProgress({
  scanId,
  initialStatus,
}: {
  scanId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<ScanProgressPayload | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const status = payload?.status ?? initialStatus;

  useEffect(() => {
    if (TERMINAL.has(status)) return;

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/v1/scans/${scanId}/progress`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as ScanProgressPayload;
        if (cancelled) return;
        setPayload(next);

        if (TERMINAL.has(next.status)) {
          // Re-render the server component so the recorded evidence replaces
          // this widget. `refresh()` rather than a full reload keeps scroll
          // position and avoids a flash of the empty page.
          router.refresh();
        }
      } catch {
        // A failed poll is not worth surfacing: the next one is three seconds
        // away, and an error banner over a running scan would be noise.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [scanId, status, router]);

  // Elapsed is computed client-side from the scan's own start, so it keeps
  // ticking between polls rather than jumping every three seconds.
  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const startedAt = payload?.startedAt ? new Date(payload.startedAt).getTime() : null;
    if (!startedAt) return;

    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [payload?.startedAt, status]);

  const recorded = new Map(
    (payload?.phases ?? []).map((phase) => [phase.phase, phase]),
  );

  // The first phase with no row yet is the one in flight — the worker writes a
  // phase row when it finishes, so "absent" and "running" are the same thing
  // until the scan itself is terminal.
  const runningIndex = PHASE_ORDER.findIndex((phase) => !recorded.has(phase));

  const stages: ProgressStage[] = PHASE_ORDER.map((phase, index) => {
    const row = recorded.get(phase);
    if (row) {
      return {
        id: phase,
        title: PHASE_LABEL[phase],
        detail: row.errorMessage ?? t(`phaseStatus.${row.status}`),
        state: "done",
      };
    }
    return {
      id: phase,
      title: PHASE_LABEL[phase],
      detail: index === runningIndex ? t("scans.running") : t("scans.queued"),
      state: index === runningIndex && status === "RUNNING" ? "running" : "waiting",
    };
  });

  const done = recorded.size;
  const percent = Math.round((done / PHASE_ORDER.length) * 100);
  const currentLabel =
    status === "QUEUED"
      ? t("scans.queued")
      : `${t("scans.running")} · ${PHASE_LABEL[PHASE_ORDER[Math.min(runningIndex, 3)] ?? "NO_CONSENT"]}`;

  return (
    <ScanProgress
      stages={stages}
      percent={percent}
      elapsedSeconds={elapsed}
      currentLabel={currentLabel}
    />
  );
}
