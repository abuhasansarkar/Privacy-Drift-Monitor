import type { Page } from "playwright";
import type { BrowserPool } from "./browser/pool";
import { resolveAdapter, type ConsentAdapter } from "./consent/adapter";
import { CMP_ADAPTERS } from "./consent/cmp-adapters";
import { GENERIC_ADAPTER } from "./consent/generic-adapter";
import { DEFAULT_BUDGET, type NavigationBudget, type UrlGuard } from "./navigate";
import { runPhase, type ConsentAction } from "./phase-runner";
import {
  deriveScanStatus,
  type CmpDetectionResult,
  type ConsentPhase,
  type PhaseResult,
  type ScanErrorCode,
  type ScanInput,
  type ScanResult,
} from "./types";

/**
 * SCAN ORCHESTRATION — PLAN.md Part IV §4.3, Phase 2 tasks 2.9/2.10.
 *
 * Runs the four consent journeys, each in its own isolated context, and derives
 * the scan status from what actually happened.
 *
 * ⚠️ PHASE ORDER IS NOT ARBITRARY. NO_CONSENT first, because it is the only
 * phase whose recording is meaningless if anything has touched the site
 * beforehand. REJECT_ALL before ACCEPT_ALL, so that if the scan dies partway we
 * still hold the more valuable of the two — "what fires after rejection" is the
 * finding agencies act on. WITHDRAW last, because it needs a prior consent
 * state to withdraw from.
 *
 * ⚠️ THE SCAN NEVER SHORT-CIRCUITS TO "CLEAN". A phase that could not run is
 * UNDETERMINED and the scan is PARTIAL (P5/P6). `deriveScanStatus` is the only
 * place status is computed, precisely so no code path here can talk itself into
 * COMPLETED on a scan where Reject All never happened.
 */

/** Ordered. See the note above — do not reorder without reading it. */
export const PHASE_ORDER: readonly ConsentPhase[] = [
  "NO_CONSENT",
  "REJECT_ALL",
  "ACCEPT_ALL",
  "WITHDRAW",
];

export interface ScanDeps {
  pool: BrowserPool;
  /** Overridable so tests can inject a single adapter. */
  adapters?: readonly ConsentAdapter[];
  budget?: NavigationBudget;
  scannerVersion?: string;
  workerId?: string;
  /**
   * ⚠️ THE SSRF GUARD, INJECTABLE FOR FIXTURES ONLY (§10.3 R4/R5). §4.15's
   * fixtures are served from `127.0.0.1`, which the guard blocks by design.
   * Omitting it uses the real guard, so production fails CLOSED.
   */
  urlGuard?: UrlGuard;
}

/**
 * Maps a phase-level navigation failure onto a scan error code.
 *
 * Kept as a table rather than inline `if`s because the retry decision hangs off
 * it (§4.4): a wrong mapping either wastes browser slots retrying a permanent
 * failure, or drops a transient one that would have succeeded.
 */
function scanErrorFor(message: string | null): ScanErrorCode {
  if (message === "NAV_TIMEOUT") return "NAV_TIMEOUT";
  if (message === "HTTP_ERROR") return "HTTP_CLIENT_ERROR";
  /*
   * ⚠️ SSRF_BLOCKED IS DETERMINISTIC AND MUST NEVER BE RETRIED. §4.4's split
   * decides how many browser slots a failure costs, and the answer for a
   * refused address is one: it will be refused identically on every attempt,
   * and three tries against an address someone is probing is three times the
   * log noise for the same non-event.
   */
  if (message === "SSRF_BLOCKED") return "SSRF_BLOCKED";
  return "NETWORK_RESET";
}

/** The adapter cascade: known CMPs first, generic last (§4.6). */
function defaultAdapters(): readonly ConsentAdapter[] {
  return [...CMP_ADAPTERS, GENERIC_ADAPTER];
}

/**
 * Builds the consent action for a phase.
 *
 * NO_CONSENT returns null — "do nothing" is what that phase is for, and it is
 * EXECUTED when nothing was done. Every other phase resolves an adapter on the
 * live page, because the CMP can only be detected once the page has loaded.
 */
function actionFor(
  phase: ConsentPhase,
  adapters: readonly ConsentAdapter[],
  onDetect: (detection: CmpDetectionResult) => void,
): ConsentAction | null {
  if (phase === "NO_CONSENT") return null;

  const intent =
    phase === "ACCEPT_ALL" ? "accept" : phase === "REJECT_ALL" ? "reject" : "withdraw";

  return {
    async perform(page: Page) {
      const resolved = await resolveAdapter(page, adapters);
      if (!resolved) {
        return {
          performed: false,
          method: null,
          confidence: null,
          selectorUsed: null,
          elementText: null,
          inIframe: false,
          bannerDismissed: null,
          errorCode: "CONSENT_NO_BANNER_FOUND" as const,
          errorMessage: "no consent banner detected",
        };
      }

      onDetect(resolved.detection);
      return resolved.adapter.perform(page, intent);
    },
  };
}

export async function runScan(input: ScanInput, deps: ScanDeps): Promise<ScanResult> {
  const startedAt = new Date();
  const adapters = deps.adapters ?? defaultAdapters();
  const budget = deps.budget ?? DEFAULT_BUDGET;
  const phasesToRun = input.phases ?? PHASE_ORDER;

  const phases: PhaseResult[] = [];
  let cmp: CmpDetectionResult | null = null;
  let navigationSucceeded = false;
  let errorCode: ScanErrorCode | null = null;
  let errorMessage: string | null = null;
  let errorPhase: ConsentPhase | null = null;

  for (const phase of phasesToRun) {
    const result = await runPhase(deps.pool, {
      phase,
      url: input.url,
      registrableDomain: input.registrableDomain,
      budget,
      blockMedia: input.blockMedia,
      urlGuard: deps.urlGuard,
      action: actionFor(phase, adapters, (detection) => {
        // First detection wins and is recorded on the scan. A CMP that reports
        // differently in a later phase is drift, not a correction.
        cmp ??= detection;
      }),
    });

    phases.push(result);

    if (result.status === "FAILED" && !navigationSucceeded) {
      // Navigation never worked. Later phases would fail identically and would
      // cost three more browser contexts to prove it.
      errorCode = scanErrorFor(result.errorMessage);
      errorMessage = result.errorMessage;
      errorPhase = phase;
      break;
    }

    navigationSucceeded = true;
  }

  const finishedAt = new Date();

  return {
    scanId: input.scanId,
    // The ONE place status is decided. See the header note.
    status: deriveScanStatus(phases, navigationSucceeded),
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    scannerVersion: deps.scannerVersion ?? "1.0.0",
    browserVersion: null,
    workerId: deps.workerId ?? "local",
    userAgent: "",
    cmp,
    phases,
    pagesScanned: navigationSucceeded ? 1 : 0,
    errorCode,
    errorMessage,
    errorPhase,
  };
}
