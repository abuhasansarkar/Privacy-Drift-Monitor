import { chromium, type Browser } from "playwright";
import { ReportGenerationError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";
import type { Branding } from "@pdm/shared/branding";
import { footerTemplate, headerTemplate } from "./templates/styles";

/**
 * PDF RENDERER — PLAN.md Part VI §6.8, Part IV §4.2 (browser lifecycle).
 *
 * ⚠️ A SEPARATE BROWSER FROM THE SCANNER POOL (§6.8). A long PDF render must
 * never starve scanning: the scan pool's slots are the scarcest resource in the
 * system, and a 90-second render of a 60-page evidence appendix would hold one
 * of them. This module owns exactly one browser, reused across renders and
 * recycled on age, and it is launched lazily so a worker with
 * `WORKER_ROLES=scan` never starts a second Chromium at all.
 *
 * ⚠️ EVERY RENDER CLOSES ITS CONTEXT IN `finally` (§4.2 cleanup contract). A
 * leaked context takes a worker down within hours, and the report worker runs
 * for weeks.
 *
 * ⚠️ THE PAGE LOADS NO NETWORK RESOURCES. `setContent` with a fully inlined
 * document, and every external request is aborted: a report renders identically
 * regardless of device (§11.5), and a template that silently depended on a CDN
 * would produce a differently-shaped PDF the day the CDN was slow. Logos are
 * embedded as data URIs by the caller for the same reason.
 */

const MAX_BROWSER_AGE_MS = Number(process.env.REPORT_BROWSER_MAX_AGE_MS ?? 30 * 60 * 1000);
const RENDER_TIMEOUT_MS = Number(process.env.REPORT_RENDER_TIMEOUT_MS ?? 90_000);

let browser: Browser | null = null;
let launchedAt = 0;

const log = childLogger({ component: "reports" });

async function getBrowser(): Promise<Browser> {
  const now = Date.now();

  if (browser && (!browser.isConnected() || now - launchedAt > MAX_BROWSER_AGE_MS)) {
    const stale = browser;
    browser = null;
    // Not awaited into the render path: recycling is maintenance, and a slow
    // close should not add latency to the report someone is waiting for.
    void stale.close().catch((error) => log.warn({ err: error }, "stale browser close failed"));
  }

  if (!browser) {
    browser = await chromium.launch({
      args: [
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // ⚠️ No `--no-sandbox` here. §10.5 keeps the Chromium sandbox on, and a
        // report renderer loads our OWN markup — it has even less reason to
        // drop it than the scanner does.
      ],
    });
    launchedAt = now;
    log.info("report browser launched");
  }

  return browser;
}

export interface PdfResult {
  buffer: Buffer;
  pageCount: number;
  sizeBytes: number;
}

export interface RenderPdfOptions {
  html: string;
  branding: Branding;
  /** Running-header text — the report name. */
  title: string;
  timeoutMs?: number;
}

export async function renderPdf(options: RenderPdfOptions): Promise<PdfResult> {
  const instance = await getBrowser();
  const context = await instance.newContext({
    // Fixed viewport and scale factor: two agencies rendering the same report
    // must get byte-comparable output, and a device-dependent PDF is a support
    // ticket nobody can reproduce.
    viewport: { width: 1240, height: 1754 },
    deviceScaleFactor: 2,
    javaScriptEnabled: false,
  });

  try {
    const page = await context.newPage();

    // Everything is inlined. Anything still asking for the network is a bug in
    // a template, and aborting makes it fail loudly in development rather than
    // hanging the render in production.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") return route.continue();
      log.warn({ url }, "report template requested a network resource; aborted");
      return route.abort();
    });

    await page.setContent(options.html, {
      waitUntil: "load",
      timeout: options.timeoutMs ?? RENDER_TIMEOUT_MS,
    });

    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(options.branding, options.title),
      footerTemplate: footerTemplate(options.branding.reportFooterText),
      // The header and footer templates carry their own padding; the margin box
      // is what reserves room for them.
      margin: { top: "14mm", bottom: "14mm", left: "0mm", right: "0mm" },
    });

    return {
      buffer,
      pageCount: countPdfPages(buffer),
      sizeBytes: buffer.byteLength,
    };
  } catch (error) {
    throw new ReportGenerationError(
      "We couldn't generate this report. Nothing was charged against your report allowance.",
      { cause: error, reason: "PDF_RENDER_FAILED" },
    );
  } finally {
    // ⚠️ ALWAYS. See the cleanup contract note at the top of this file.
    await context.close().catch((error) => {
      log.error({ err: error }, "report context close failed");
    });
  }
}

/**
 * Counts pages by scanning the PDF's own object stream.
 *
 * Cheaper and more reliable than asking Chromium: the `/Type /Page` count is
 * written by the producer, and the alternative (re-opening the PDF in a
 * viewer) means another dependency for one integer.
 */
export function countPdfPages(buffer: Buffer): number {
  const matches = buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 1;
}

/** Called from the worker's SIGTERM path, after the queue has drained. */
export async function closeReportBrowser(): Promise<void> {
  if (!browser) return;
  const instance = browser;
  browser = null;
  await instance.close().catch((error) => log.warn({ err: error }, "browser close failed"));
}

/** For `/api/health/ready` and the admin system-health page. */
export function reportBrowserState(): "idle" | "running" {
  return browser?.isConnected() ? "running" : "idle";
}
