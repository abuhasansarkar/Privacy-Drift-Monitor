import type { BrowserContext, Page } from "playwright";
import type { BrowserPool } from "./browser/pool";
import {
  ConsoleRecorder,
  NetworkRecorder,
  snapshotCookies,
  snapshotStorage,
  type RecorderContext,
} from "./record/recorders";
import {
  DEFAULT_BUDGET,
  installRouteGuard,
  navigate,
  observe,
  type NavigationBudget,
  type UrlGuard,
} from "./navigate";
import { assertSafeUrl } from "./net/guard";
import { capture, type ScreenshotPolicy } from "./record/screenshots";
import type {
  ConsentMethod,
  ConsentPhase,
  PhaseResult,
  RecordedCookie,
  RecordedScreenshot,
} from "./types";
import {
  CONSENT_MODE_INIT_SCRIPT,
  type RecordedConsentEvent,
} from "./instrumentation/consent-mode";
import {
  FINGERPRINT_TRAP_SCRIPT,
  parseFingerprintCalls,
  type RecordedFingerprintCall,
} from "./instrumentation/fingerprint-trap";
import {
  measureDomGating,
  measureConsentButtonAsymmetry,
  type DomGatingFact,
  type ButtonGeometryFact,
} from "./instrumentation/dom-gating";
import type { FingerprintFact } from "./instrumentation/fingerprint-trap";

/**
 * PHASE RUNNER — PLAN.md Part IV §4.3, Phase 2 task 2.9 (single-phase half).
 *
 * Runs ONE consent journey in its own isolated context and returns what was
 * recorded. The four-phase orchestration composes this; keeping the single
 * phase separate is what makes it testable against a fixture without a queue,
 * a database or the other three phases.
 *
 * ⚠️ EVERY PHASE GETS A FRESH CONTEXT. Reusing one would let Accept-All's
 * cookies leak into the Reject-All recording, and the whole product is the
 * difference between those two states (§4.3). The pool enforces this — there is
 * no way to ask it for a context you keep.
 *
 * ⚠️ STATUS IS REPORTED, NEVER CHOSEN OPTIMISTICALLY. A phase that could not
 * perform its consent action returns UNDETERMINED, which propagates to a
 * PARTIAL scan and to "Could not be determined" in the UI. There is no code
 * path here that turns a failed action into EXECUTED (P5/P6).
 */

/**
 * What a phase does after the page loads. Returning `null` means "nothing to
 * do" — which is the NO_CONSENT phase, and is EXECUTED, because doing nothing
 * is the thing that phase is supposed to do.
 */
export interface ConsentAction {
  perform(page: Page): Promise<ConsentActionResult>;
}

export interface ConsentActionResult {
  performed: boolean;
  method: ConsentMethod | null;
  confidence: number | null;
  selectorUsed: string | null;
  elementText: string | null;
  inIframe: boolean;
  bannerDismissed: boolean | null;
  errorCode: PhaseResult["errorCode"];
  errorMessage: string | null;
}

export interface PhaseRunInput {
  phase: ConsentPhase;
  url: string;
  registrableDomain: string;
  budget?: NavigationBudget;
  blockMedia?: boolean;
  /** Null for NO_CONSENT — see `ConsentAction`. */
  action?: ConsentAction | null;
  /** §4.5. ON_CHANGE by default; NEVER in tests, where images cost time. */
  screenshotPolicy?: ScreenshotPolicy;
  screenshotChanged?: boolean;
  /**
   * ⚠️ THE SSRF GUARD, INJECTABLE FOR FIXTURES ONLY. Every §4.15 fixture is
   * served from `127.0.0.1`, which the guard blocks by design and must keep
   * blocking. Omitting this uses the real guard, so a production path that
   * forgets it fails CLOSED rather than open.
   */
  urlGuard?: UrlGuard;
}

export async function runPhase(
  pool: BrowserPool,
  input: PhaseRunInput,
): Promise<PhaseResult> {
  const budget = input.budget ?? DEFAULT_BUDGET;
  const startedAt = new Date();

  const contextOptions = {
    ...(input.phase === "GLOBAL_PRIVACY_CONTROL"
      ? {
          extraHTTPHeaders: {
            "Sec-GPC": "1",
            "DNT": "1",
          },
        }
      : {}),
  };

  return pool.withContext(async (context: BrowserContext) => {
    const page = await context.newPage();

    const recorderCtx: RecorderContext = {
      phase: input.phase,
      pageUrl: input.url,
      registrableDomain: input.registrableDomain,
      startedAt: Date.now(),
    };

    const network = new NetworkRecorder(recorderCtx);
    const consoleRecorder = new ConsoleRecorder();
    const detachNetwork = network.attach(context);
    const detachConsole = consoleRecorder.attach(page);

    const cookies: RecordedCookie[] = [];
    const screenshots: RecordedScreenshot[] = [];
    let consentEvents: RecordedConsentEvent[] = [];
    const shot = {
      policy: input.screenshotPolicy ?? "ON_CHANGE",
      changed: input.screenshotChanged,
    } as const;
    let action: ConsentActionResult | null = null;
    let errorCode: PhaseResult["errorCode"] = null;
    let errorMessage: string | null = null;

    try {
      /*
       * ⚠️ ONE ROUTE HANDLER DOES BOTH JOBS (§10.3 R4/R5 and §4.4's media
       * blocking). Playwright dispatches to the most recently registered
       * matching handler and does not chain, so registering two
       * `page.route("**​/*")` handlers means one of them silently never runs —
       * and the one that would have been dropped here is the security control.
       */
      let blockedUrl: string | null = null;
      await installRouteGuard(page, {
        blockMedia: input.blockMedia !== false,
        guard: input.urlGuard ?? assertSafeUrl,
        onBlocked: (url, reason) => {
          blockedUrl = `${reason}:${url}`;
        },
      });

      await page.addInitScript(CONSENT_MODE_INIT_SCRIPT);
      await page.addInitScript(FINGERPRINT_TRAP_SCRIPT);

      const outcome = await navigate(page, input.url, budget, {
        guard: input.urlGuard ?? assertSafeUrl,
        blocked: () => blockedUrl,
      });
      if (!outcome.ok) {
        // Navigation failure is a SCAN-level fact, not a consent one. The phase
        // reports FAILED and the orchestrator maps the reason to a ScanErrorCode
        // — a phase must not invent a consent error for a network problem.
        return finish("FAILED", null, null, outcome.reason);
      }

      cookies.push(...(await snapshotCookies(context, recorderCtx, "after_nav")));

      // Observation window BEFORE the consent action: this is the pre-consent
      // evidence, and it is the single most important recording the product
      // makes. Anything that fires here fired without being asked.
      await observe(page, budget);
      cookies.push(...(await snapshotCookies(context, recorderCtx, "after_settle")));

      let domGating: DomGatingFact | null = null;
      let buttonGeometry: ButtonGeometryFact | null = null;
      if (input.phase === "NO_CONSENT" || input.phase === "REJECT_ALL") {
        domGating = await measureDomGating(page).catch(() => null);
        buttonGeometry = await measureConsentButtonAsymmetry(page).catch(() => null);
      }

      // The banner as the visitor first sees it — the corroboration a human
      // checks a pre-consent finding against.
      const initial = await capture(page, input.phase, "banner-initial", shot);
      if (initial) screenshots.push(initial);

      if (input.action) {
        action = await input.action.perform(page);
        if (!action.performed) {
          // Could not click Reject. NOT a pass — the phase is UNDETERMINED and
          // the scan becomes PARTIAL. This is the branch P5 exists for.
          errorCode = action.errorCode;
          errorMessage = action.errorMessage;
          consentEvents = await page
            .evaluate<RecordedConsentEvent[]>(
              `(() => Array.isArray(window.__pdm_consent_events) ? window.__pdm_consent_events : [])()`,
            )
            .catch(() => []);
          const rawFp = await page
            .evaluate<RecordedFingerprintCall[]>(
              `(() => Array.isArray(window.__pdm_fingerprint_calls) ? window.__pdm_fingerprint_calls : [])()`,
            )
            .catch(() => []);
          const fingerprint = parseFingerprintCalls(rawFp);
          cookies.push(
            ...(await snapshotCookies(context, recorderCtx, "phase_end")),
          );
          return finish("UNDETERMINED", action, null, null, { domGating, buttonGeometry, fingerprint });
        }

        cookies.push(...(await snapshotCookies(context, recorderCtx, "after_action")));
        // A second observation window: the whole point of Accept All is what
        // fires afterwards.
        await observe(page, budget);

        const after = await capture(page, input.phase, "post-reject", shot);
        if (after) screenshots.push(after);
      }

      consentEvents = await page
        .evaluate<RecordedConsentEvent[]>(
          `(() => Array.isArray(window.__pdm_consent_events) ? window.__pdm_consent_events : [])()`,
        )
        .catch(() => []);
      const rawFp = await page
        .evaluate<RecordedFingerprintCall[]>(
          `(() => Array.isArray(window.__pdm_fingerprint_calls) ? window.__pdm_fingerprint_calls : [])()`,
        )
        .catch(() => []);
      const fingerprint = parseFingerprintCalls(rawFp);
      cookies.push(...(await snapshotCookies(context, recorderCtx, "phase_end")));
      return finish("EXECUTED", action, await snapshotStorage(page, recorderCtx), null, {
        domGating,
        buttonGeometry,
        fingerprint,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      return finish("FAILED", action, null, null);
    } finally {
      // Detach before the context closes, so a late event cannot push into an
      // array the caller has already been handed.
      detachNetwork();
      detachConsole();

      /*
       * ⚠️ UNROUTE BEFORE CLOSING, or the pool leaks a context and hangs.
       * `installMediaBlocking` registers a `page.route("**​/*")` handler, and
       * closing a page with routes still registered makes Playwright wait for
       * in-flight route handlers that will never resolve — which showed up as a
       * scan of an HTTP-500 page hanging forever and `activeContexts` stuck at 1.
       * That is precisely the leak the pool exists to prevent, arriving through
       * the one door the pool cannot close for us.
       */
      await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await page.close().catch(() => {});
    }

    function finish(
      phaseStatus: PhaseResult["status"],
      actionResult: ConsentActionResult | null,
      storage: Awaited<ReturnType<typeof snapshotStorage>> | null,
      navReason: string | null,
      extraFacts?: {
        domGating?: DomGatingFact | null;
        buttonGeometry?: ButtonGeometryFact | null;
        fingerprint?: FingerprintFact | null;
      },
    ): PhaseResult {
      const finishedAt = new Date();
      if (navReason && !errorMessage) errorMessage = navReason;

      return {
        phase: input.phase,
        status: phaseStatus,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        actionMethod: actionResult?.method ?? null,
        actionConfidence: actionResult?.confidence ?? null,
        selectorUsed: actionResult?.selectorUsed ?? null,
        elementText: actionResult?.elementText ?? null,
        inIframe: actionResult?.inIframe ?? false,
        bannerDismissed: actionResult?.bannerDismissed ?? null,
        errorCode,
        errorMessage,
        requests: network.drain(),
        cookies,
        storage: storage ?? [],
        consoleLogs: consoleRecorder.drain(),
        screenshots,
        consentEvents,
        domGating: extraFacts?.domGating ?? null,
        buttonGeometry: extraFacts?.buttonGeometry ?? null,
        fingerprint: extraFacts?.fingerprint ?? null,
      };
    }
  }, contextOptions);
}
