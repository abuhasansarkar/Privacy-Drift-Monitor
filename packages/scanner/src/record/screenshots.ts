import type { Page } from "playwright";
import type { ConsentPhase, RecordedScreenshot, ScreenshotKind } from "../types";

/**
 * SCREENSHOTS — PLAN.md Part IV §4.5, Phase 2 tasks 2.3/2.12.
 *
 * ⚠️ A SCREENSHOT IS CORROBORATION, NEVER THE FINDING. Every claim this product
 * makes comes from the network, cookie and storage recorders; an image is what
 * lets a human check the claim against what a visitor would have seen. Nothing
 * downstream may read a screenshot to establish a fact (P1/P6) — it is not
 * machine-readable evidence and must never be treated as such.
 *
 * ⚠️ THEY ARE THE MOST EXPENSIVE THING WE STORE. A full-page PNG of a real
 * marketing site is megabytes; four journeys × a screenshot each × a daily scan
 * is gigabytes per site per year. Hence the policy below, and hence viewport
 * captures by default rather than full-page.
 */

export type ScreenshotPolicy = "ALWAYS" | "ON_CHANGE" | "NEVER";

/** Viewport-sized by default. The banner is above the fold, which is the point. */
const VIEWPORT = { width: 1440, height: 900 };

export interface CaptureOptions {
  policy: ScreenshotPolicy;
  /**
   * True when this scan differs from the previous one. `ON_CHANGE` — the
   * default (§4.5) — captures only then, which is what keeps storage
   * proportional to what actually changed rather than to how often we look.
   */
  changed?: boolean;
}

export function shouldCapture(options: CaptureOptions): boolean {
  if (options.policy === "NEVER") return false;
  if (options.policy === "ALWAYS") return true;
  return options.changed === true;
}

/**
 * Captures one screenshot, or returns null.
 *
 * ⚠️ Never throws. A failed capture must not fail a scan: the evidence that
 * matters was already recorded by the network and cookie recorders, and losing
 * a corroborating image is not a reason to discard a good recording.
 */
export async function capture(
  page: Page,
  phase: ConsentPhase,
  kind: ScreenshotKind,
  options: CaptureOptions,
): Promise<RecordedScreenshot | null> {
  if (!shouldCapture(options)) return null;

  try {
    const body = await page.screenshot({
      // Viewport, not full page: a consent banner is above the fold by
      // definition, and full-page on a long marketing site is 10× the bytes
      // for the same corroboration.
      fullPage: kind === "full-page",
      type: "png",
      // Animations are a source of noise that makes two identical scans differ —
      // disabling them keeps a change in the image meaningful.
      animations: "disabled",
      timeout: 10_000,
    });

    return {
      consentPhase: phase,
      kind,
      body,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    };
  } catch {
    return null;
  }
}

/**
 * The S3 key for a screenshot.
 *
 * ⚠️ AGENCY-FIRST. The prefix makes a retention sweep or an agency deletion a
 * single prefix operation, and it makes a mis-scoped signed URL obvious in a
 * log line rather than invisible (§5.7, §10.6).
 */
export function screenshotKey(params: {
  agencyId: string;
  websiteId: string;
  scanId: string;
  phase: ConsentPhase;
  kind: ScreenshotKind;
}): string {
  return [
    "agencies",
    params.agencyId,
    "websites",
    params.websiteId,
    "scans",
    params.scanId,
    `${params.phase}-${params.kind}.png`,
  ].join("/");
}
