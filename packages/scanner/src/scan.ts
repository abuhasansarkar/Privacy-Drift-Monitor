import type { Page } from "playwright";
import type { BrowserPool } from "./browser/pool";
import { resolveAdapter, type ConsentAdapter } from "./consent/adapter";
import { CMP_ADAPTERS } from "./consent/cmp-adapters";
import { GENERIC_ADAPTER } from "./consent/generic-adapter";
import { runSyntheticFormInteraction } from "./consent/interactive-runner";
import { DEFAULT_BUDGET, type NavigationBudget, type UrlGuard } from "./navigate";
import { runPhase, type ConsentAction } from "./phase-runner";
import { checkCnameCloaking, type CnameResolutionResult } from "./net/cname";
import { parseConsentModeEvents } from "./instrumentation/consent-mode";
import {
  deriveScanStatus,
  type CmpDetectionResult,
  type ConsentPhase,
  type PhaseResult,
  type ScanErrorCode,
  type ScanInput,
  type ScanResult,
  type CnameChecker,
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
  /**
   * Injected so the fixture suite needs no live DNS. The default is the real
   * resolver, so a forgotten parameter records nothing rather than faking a
   * clean result.
   */
  cnameChecker?: CnameChecker;
}

/**
 * Maps a phase-level navigation failure onto a scan error code.
 *
 * Kept as a table rather than inline `if`s because the retry decision hangs off
 * it (§4.4): a wrong mapping either wastes browser slots retrying a permanent
 * failure, or drops a transient one that would have succeeded.
 */
function scanErrorFor(message: string | null): ScanErrorCode {
  if (!message) return "NETWORK_RESET";
  if (message === "NAV_TIMEOUT") return "NAV_TIMEOUT";
  if (message === "HTTP_SERVER_ERROR") return "HTTP_SERVER_ERROR";
  if (message === "HTTP_CLIENT_ERROR" || message === "HTTP_ERROR") return "HTTP_CLIENT_ERROR";
  if (message === "DNS_NXDOMAIN") return "DNS_NXDOMAIN";
  if (message === "NETWORK_RESET") return "NETWORK_RESET";
  if (message === "TLS_NAME_MISMATCH") return "TLS_NAME_MISMATCH";
  if (message === "TLS_INVALID_CERT") return "TLS_INVALID_CERT";
  if (message === "SSRF_BLOCKED") return "SSRF_BLOCKED";
  return "NETWORK_RESET";
}

/** The adapter cascade: known CMPs first, generic last (§4.6). */
function defaultAdapters(): readonly ConsentAdapter[] {
  return [...CMP_ADAPTERS, GENERIC_ADAPTER];
}

/**
 * The window after a synthetic form submission during which a third-party
 * burst is attributed to the submission (PDM-R043). Long enough to catch
 * conversion pixels' deferred beacons; bounded so a poller cannot stretch the
 * phase indefinitely.
 */
const FORM_BURST_WINDOW_MS = 3_000;

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
  if (phase === "NO_CONSENT" || phase === "GLOBAL_PRIVACY_CONTROL") return null;

  if (phase === "INTERACTIVE_ACTION") {
    return {
      async perform(page: Page) {
        const resolved = await resolveAdapter(page, adapters);
        if (resolved) {
          onDetect(resolved.detection);
          await resolved.adapter.perform(page, "accept").catch(() => {});
        }
        await page
          .evaluate<void>(
            `(() => {
              window.scrollTo(0, document.body.scrollHeight * 0.25);
              window.scrollTo(0, document.body.scrollHeight * 0.5);
              window.scrollTo(0, document.body.scrollHeight * 0.75);
              window.scrollTo(0, document.body.scrollHeight);
            })()`,
          )
          .catch(() => {});
        await page.waitForTimeout(500).catch(() => {});

        /*
         * Synthetic form interaction (PDM-R043). The DOM facts come from the
         * runner; the burst count is filled in by the PHASE RUNNER from its own
         * network recorder across the bounded post-submission window — the
         * recorder is the only thing that can see the requests (P1/P6). Until
         * then the burst fields carry neutral values, and the phase runner
         * overwrites `formSubmission` on the result before finishing.
         */
        const form = await runSyntheticFormInteraction(page);
        await page.waitForTimeout(FORM_BURST_WINDOW_MS).catch(() => {});

        return {
          performed: true,
          method: "dom_heuristic" as const,
          confidence: 1.0,
          selectorUsed: null,
          elementText: null,
          inIframe: false,
          bannerDismissed: true,
          errorCode: null,
          errorMessage: null,
          formInteraction: form,
        };
      },
    };
  }

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
/**
 * Resolves the CNAME chain for every FIRST-PARTY host the scan actually
 * contacted — PLAN-V2 Part III, dev-doc2 Module 22.
 *
 * ⚠️ THIS RUNS AT SCAN TIME, NOT AT ANALYSIS TIME, AND THAT IS P6. A CNAME is
 * a DNS fact that changes without warning: resolving it while interpreting
 * stored evidence would mean re-running analysis over the same scan could
 * produce a different answer, which is exactly the replayability the
 * evidence/interpretation split exists to guarantee. So it is RECORDED here,
 * beside the requests it describes, and the rule engine only reads it.
 *
 * ⚠️ FIRST-PARTY HOSTS ONLY. Cloaking is the practice of pointing a
 * first-party subdomain at a third-party tracking network so the request looks
 * same-site to the browser. A host that is already third-party has nothing to
 * cloak, and resolving every third-party host would mean dozens of DNS lookups
 * per scan for a question nobody asked.
 *
 * ⚠️ BOUNDED AND FAILURE-TOLERANT. DNS is the slowest thing in this pipeline
 * and the one most likely to hang. The host count is capped, the whole step is
 * time-boxed, and any failure yields NO fact rather than a wrong one — a scan
 * must never be downgraded because a resolver was slow.
 */
const MAX_CNAME_HOSTS = 25;
const CNAME_STEP_TIMEOUT_MS = 5_000;

async function resolveCnames(
  phases: readonly PhaseResult[],
  registrableDomain: string,
  check: CnameChecker,
): Promise<CnameResolutionResult[]> {
  const hosts = new Set<string>();
  for (const phase of phases) {
    for (const request of phase.requests) {
      if (request.isThirdParty) continue;
      hosts.add(request.host.toLowerCase());
      if (hosts.size >= MAX_CNAME_HOSTS) break;
    }
    if (hosts.size >= MAX_CNAME_HOSTS) break;
  }

  if (hosts.size === 0) return [];

  const work = Promise.all(
    [...hosts].map((host) =>
      check(host, registrableDomain).catch(() => null),
    ),
  );

  // A timeout yields an empty set, never a partial one presented as complete.
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), CNAME_STEP_TIMEOUT_MS).unref?.(),
  );

  const settled = await Promise.race([work, timeout]);
  if (!settled) return [];

  return settled.filter((entry): entry is CnameResolutionResult => entry !== null);
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

  /*
   * ⚠️ THE SCAN DEADLINE (F-007), HONOURED HERE — FOR THE FIRST TIME. The free
   * scanner passed `timeoutMs: 45_000` and the field was silently dropped; a
   * hostile page (an anti-bot `while(true){}` inside an evaluate) could hang a
   * phase forever, holding the pool permit and the BullMQ slot indefinitely
   * while the database-side reaper failed only the ROW. The deadline now bounds
   * the phase loop itself.
   *
   * ⚠️ HOW IT FAILS, AND WHAT IT DOES NOT DO. On expiry the loop stops and the
   * scan is returned PARTIAL with `SCAN_TIMEOUT` — the phases that ran keep
   * their evidence (P5: an incomplete scan reports what it saw). The deadline
   * does NOT close the browser context: that is the phase runner's `finally`,
   * which owns cleanup and cannot be raced from outside. A phase stuck INSIDE
   * the loop is terminated by its own budget timeouts; the deadline bounds how
   * long we keep STARTING work, and `remainingMs` shrinks the budget of later
   * phases so a slow first phase cannot hand the last phase an unbounded run.
   */
  const deadline = input.timeoutMs
    ? startedAt.getTime() + input.timeoutMs
    : Number.POSITIVE_INFINITY;

  for (const phase of phasesToRun) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      errorCode = "SCAN_TIMEOUT";
      errorMessage = `scan deadline (${input.timeoutMs}ms) reached before phase ${phase}`;
      break;
    }

    const result = await runPhase(deps.pool, {
      phase,
      url: input.url,
      registrableDomain: input.registrableDomain,
      budget: {
        ...budget,
        // Later phases inherit the remaining time, never the full budget.
        navTimeoutMs: Math.max(1_000, Math.min(budget.navTimeoutMs, remainingMs)),
      },
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

    if (Date.now() >= deadline) {
      errorCode = "SCAN_TIMEOUT";
      errorMessage = `scan deadline (${input.timeoutMs}ms) reached after phase ${phase}`;
      break;
    }
  }

  /*
   * Recorded only when navigation worked. A scan that never loaded the page
   * observed no hosts, and resolving the entry URL alone would produce a fact
   * about a site we failed to reach. Skipped on deadline expiry — the scan is
   * already ending, and DNS is the slowest step in the pipeline.
   */
  const deadlineExpired = errorCode === "SCAN_TIMEOUT";
  const cnameResolutions =
    navigationSucceeded && !deadlineExpired
      ? await resolveCnames(
          phases,
          input.registrableDomain,
          deps.cnameChecker ?? checkCnameCloaking,
        )
      : [];

  const consentModeAudit = navigationSucceeded
    ? parseConsentModeEvents(
        phases.map((p) => ({
          phase: p.phase,
          events: p.consentEvents ?? [],
        })),
      )
    : undefined;

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
    pagesScanned: navigationSucceeded
      ? Math.max(
          1,
          Math.min(
            input.maxPagesPerScan ?? input.sitemapConfig?.selectedUrls?.length ?? 1,
            input.sitemapConfig?.selectedUrls?.length ?? 1,
          ),
        )
      : 0,
    errorCode,
    errorMessage,
    errorPhase,
    cnameResolutions,
    consentModeAudit,
  };
}
