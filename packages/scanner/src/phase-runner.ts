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
  installMediaBlocking,
  navigate,
  observe,
  type NavigationBudget,
} from "./navigate";
import { capture, type ScreenshotPolicy } from "./record/screenshots";
import type {
  ConsentMethod,
  ConsentPhase,
  PhaseResult,
  RecordedCookie,
  RecordedScreenshot,
} from "./types";

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
}

export async function runPhase(
  pool: BrowserPool,
  input: PhaseRunInput,
): Promise<PhaseResult> {
  const budget = input.budget ?? DEFAULT_BUDGET;
  const startedAt = new Date();

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
    const shot = {
      policy: input.screenshotPolicy ?? "ON_CHANGE",
      changed: input.screenshotChanged,
    } as const;
    let action: ConsentActionResult | null = null;
    let errorCode: PhaseResult["errorCode"] = null;
    let errorMessage: string | null = null;

    try {
      if (input.blockMedia !== false) await installMediaBlocking(page);

      const outcome = await navigate(page, input.url, budget);
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
          cookies.push(
            ...(await snapshotCookies(context, recorderCtx, "phase_end")),
          );
          return finish("UNDETERMINED", action, null, null);
        }

        cookies.push(...(await snapshotCookies(context, recorderCtx, "after_action")));
        // A second observation window: the whole point of Accept All is what
        // fires afterwards.
        await observe(page, budget);

        const after = await capture(page, input.phase, "post-reject", shot);
        if (after) screenshots.push(after);
      }

      cookies.push(...(await snapshotCookies(context, recorderCtx, "phase_end")));
      return finish("EXECUTED", action, await snapshotStorage(page, recorderCtx), null);
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
      };
    }
  });
}
