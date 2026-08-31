/**
 * @pdm/reports — PLAN.md Part VI §6.8, §6.9.
 *
 * The branding resolver, the five report templates, and the Playwright PDF
 * renderer. Data collection lives in the app's services, because it is
 * repository work and the templates must stay pure (§6.9).
 */
export {
  resolveBranding,
  invalidateBranding,
  resetBrandingCache,
  toBrandingSnapshot,
  fromBrandingSnapshot,
} from "./branding";
export type { ResolveOptions } from "./branding";
export { renderReportHtml, ReportDocumentView } from "./render";
export {
  renderPdf,
  closeReportBrowser,
  countPdfPages,
  reportBrowserState,
} from "./pdf";
export type { PdfResult, RenderPdfOptions } from "./pdf";
export { reportCopy } from "./copy/en";
export { scoreBand, severityStyle } from "./templates/styles";

/**
 * ⚠️ EXPLICIT NAMED RE-EXPORTS, NOT `export *`. The worker runs TypeScript
 * directly under Node's ESM loader via tsx, which cannot see through a
 * `export * from "./types"` in a `.ts` barrel — it failed at boot on
 * `DEFAULT_REPORT_OPTIONS`. Same reason as `@pdm/notifications` and
 * `@pdm/database`.
 */
export { DEFAULT_REPORT_OPTIONS } from "./types";
export type {
  ConsentMatrixRow,
  CookieLine,
  DriftLine,
  EvidenceLine,
  IssueLine,
  IssueReportData,
  MonthlyMonitoringData,
  PrivacyDriftData,
  ReportDocument,
  ReportMeta,
  ReportOptions,
  ReportPayload,
  ScanReportData,
  ScanSummaryLine,
  ScoreBreakdownLine,
  TrackerLine,
  WebsiteHealthData,
} from "./types";
