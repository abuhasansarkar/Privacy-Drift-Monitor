/**
 * SCANNER DOMAIN TYPES — PLAN.md Part IV.
 *
 * `packages/scanner` must stay independently testable **without a database**
 * (feature doc 05), so nothing here imports Prisma. The worker maps these onto
 * rows; the scanner itself only knows about browsers and evidence.
 *
 * The enum member names deliberately match the Prisma enums character for
 * character, so the mapping is a cast and not a translation table that can
 * silently disagree.
 */

/** The four consent journeys. Every recorded artifact carries one. */
export type ConsentPhase =
  | "NO_CONSENT"
  | "REJECT_ALL"
  | "ACCEPT_ALL"
  | "WITHDRAW";

export const CONSENT_PHASES: readonly ConsentPhase[] = [
  "NO_CONSENT",
  "REJECT_ALL",
  "ACCEPT_ALL",
  "WITHDRAW",
];

/**
 * ⚠️ There is no `PASSED`. A phase runner records whether the action RAN;
 * whether the result was clean is the rule engine's answer, not its own
 * (Part 0 §0.2 P1 — nothing downstream of the collector may add facts, and
 * nothing upstream of the rules may pre-judge them).
 *
 * `UNDETERMINED` is the load-bearing member: a phase we could not execute is
 * never a pass. It propagates to `PARTIAL` at the scan level and to "Could not
 * be determined" in the UI (P6).
 */
export type PhaseStatus = "EXECUTED" | "UNDETERMINED" | "SKIPPED" | "FAILED";

/** Where in a phase a cookie snapshot was taken (§4.5). */
export type SnapshotPoint =
  | "after_nav"
  | "after_settle"
  | "after_action"
  | "phase_end";

/**
 * How a consent control was located. Ordered by descending trustworthiness —
 * an `api_call` we verified beats a `dom_heuristic` guess, and the UI shows the
 * difference rather than presenting both as "we clicked Reject".
 */
export type ConsentMethod =
  | "adapter_selector"
  | "api_call"
  | "accessible_name"
  | "text_match"
  | "dom_heuristic";

export type ConsentErrorCode =
  | "CONSENT_NO_BANNER_FOUND"
  | "CONSENT_BANNER_TIMEOUT"
  | "CONSENT_BUTTON_NOT_FOUND"
  | "CONSENT_CLICK_FAILED"
  | "CONSENT_BANNER_NOT_DISMISSED"
  | "CONSENT_IFRAME_NOT_FOUND"
  | "CONSENT_SHADOW_ROOT_CLOSED"
  | "CONSENT_API_THREW"
  | "CONSENT_AMBIGUOUS_CONTROL"
  | "CONSENT_LOW_CONFIDENCE"
  | "CONSENT_PREFERENCES_UNREACHABLE"
  | "CONSENT_WITHDRAW_UNSUPPORTED";

/**
 * Scan-level failures.
 *
 * Split into TRANSIENT and DETERMINISTIC below, because that split decides
 * whether we retry. Retrying a deterministic failure wastes browser time — the
 * scarcest resource in the system — and delays real work (§4.4).
 */
export type ScanErrorCode =
  // transient — worth retrying
  | "BROWSER_POOL_TIMEOUT"
  | "BROWSER_CRASHED"
  | "NAV_TIMEOUT"
  | "NETWORK_RESET"
  | "HTTP_SERVER_ERROR"
  | "SCAN_TIMEOUT"
  // deterministic — never retried
  | "DNS_NXDOMAIN"
  | "SSRF_BLOCKED"
  | "HTTP_CLIENT_ERROR"
  | "TLS_NAME_MISMATCH"
  | "TLS_INVALID_CERT"
  | "ROBOTS_DISALLOWED"
  | "BOT_CHALLENGE"
  | "WEBSITE_ARCHIVED"
  | "ENTITLEMENT_REVOKED";

/**
 * The retry decision, as data rather than as scattered `if` statements.
 *
 * A code missing from this map is treated as deterministic — failing closed
 * here means a new error class does not silently start consuming three browser
 * slots per occurrence.
 */
const TRANSIENT_ERRORS: ReadonlySet<ScanErrorCode> = new Set<ScanErrorCode>([
  "BROWSER_POOL_TIMEOUT",
  "BROWSER_CRASHED",
  "NAV_TIMEOUT",
  "NETWORK_RESET",
  "HTTP_SERVER_ERROR",
]);

export function isRetryable(code: ScanErrorCode): boolean {
  return TRANSIENT_ERRORS.has(code);
}

/** Screenshot kinds, and when each is taken (§4.5). */
export type ScreenshotKind =
  | "banner-initial"
  | "banner-preferences"
  | "post-reject"
  | "full-page";

/* ── Evidence shapes ─────────────────────────────────────────────────────── */

export interface RecordedRequest {
  pageUrl: string;
  consentPhase: ConsentPhase;
  /** Already through `sanitizeUrl()` — no query string, no tokens (§10.6). */
  url: string;
  method: string;
  resourceType: string;
  host: string;
  registrableDomain: string;
  isThirdParty: boolean;
  status: number | null;
  failureText: string | null;
  initiatorType: string | null;
  initiatorUrl: string | null;
  /** Offset from navigation start, NOT wall-clock — makes scans comparable. */
  timestampMs: number;
  transferSize: number | null;
  redirectChain: string[];
  /** Count only. Header values are never stored (§10.6). */
  setCookieCount: number;
}

export interface RecordedCookie {
  consentPhase: ConsentPhase;
  snapshotPoint: SnapshotPoint;
  name: string;
  domain: string;
  path: string;
  isSession: boolean;
  durationDays: number | null;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  isThirdParty: boolean;
  valueHash: string | null;
  valueLength: number;
  /** Only for allowlisted consent-signal cookies (§10.6). */
  valueRaw: string | null;
}

export interface RecordedStorageEntry {
  consentPhase: ConsentPhase;
  storageType: "local" | "session" | "indexeddb";
  key: string;
  valueLength: number;
  valueHash: string | null;
  origin: string;
}

export interface RecordedConsoleLog {
  level: "error" | "warning";
  /** Redacted and truncated to 500 chars (§10.6). */
  message: string;
  source: string | null;
}

export interface RecordedScreenshot {
  consentPhase: ConsentPhase;
  kind: ScreenshotKind;
  /** Raw bytes; the worker uploads and replaces this with an S3 key. */
  body: Buffer;
  width: number;
  height: number;
}

/* ── Phase and scan results ──────────────────────────────────────────────── */

export interface PhaseResult {
  phase: ConsentPhase;
  status: PhaseStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  actionMethod: ConsentMethod | null;
  actionConfidence: number | null;
  selectorUsed: string | null;
  elementText: string | null;
  inIframe: boolean;
  bannerDismissed: boolean | null;
  errorCode: ConsentErrorCode | null;
  errorMessage: string | null;
  requests: RecordedRequest[];
  cookies: RecordedCookie[];
  storage: RecordedStorageEntry[];
  consoleLogs: RecordedConsoleLog[];
  screenshots: RecordedScreenshot[];
}

export interface CmpDetectionResult {
  cmpId: string;
  cmpName: string;
  version: string | null;
  confidence: number;
  signals: string[];
}

export interface ScanInput {
  scanId: string;
  websiteId: string;
  agencyId: string;
  /** Canonical monitored URL. Still re-validated by the SSRF guard. */
  url: string;
  registrableDomain: string;
  monitoredPaths: string[];
  /** Per-site adapter and selector overrides — the bespoke-CMP escape hatch. */
  consentOverride?: Record<string, unknown> | null;
  respectRobots: boolean;
  blockMedia: boolean;
  /** The free public scanner runs ONE phase with a tighter budget (§10.4). */
  phases?: readonly ConsentPhase[];
  timeoutMs?: number;
}

/**
 * ⚠️ `status` is derived, never chosen by a phase.
 *
 *   every phase EXECUTED           → COMPLETED
 *   any phase UNDETERMINED/FAILED  → PARTIAL
 *   navigation never succeeded     → FAILED
 *
 * `PARTIAL` is a first-class outcome (P6). A PARTIAL scan must never render a
 * clean verdict and must never be used as a drift baseline (§4.10).
 */
export interface ScanResult {
  scanId: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  scannerVersion: string;
  browserVersion: string | null;
  workerId: string;
  userAgent: string;
  cmp: CmpDetectionResult | null;
  phases: PhaseResult[];
  pagesScanned: number;
  errorCode: ScanErrorCode | null;
  errorMessage: string | null;
  /** Which phase we died in, when we died. Null on success. */
  errorPhase: ConsentPhase | null;
}

/**
 * Derives the scan status from its phases.
 *
 * Centralised so no call site can talk itself into `COMPLETED` on a scan where
 * Reject All never ran — the single most damaging bug this product could ship.
 */
export function deriveScanStatus(
  phases: readonly PhaseResult[],
  navigationSucceeded: boolean,
): ScanResult["status"] {
  if (!navigationSucceeded || phases.length === 0) return "FAILED";
  return phases.every((p) => p.status === "EXECUTED") ? "COMPLETED" : "PARTIAL";
}
