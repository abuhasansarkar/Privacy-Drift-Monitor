/**
 * @pdm/scanner — PLAN.md Part IV.
 *
 * Imported by BOTH the web app (URL validation, free-scan orchestration) and,
 * from Phase 2, the worker (real scans). Must stay independently testable
 * WITHOUT a database.
 *
 * Phase 1 ships only the SSRF guard. The browser pool, recorders, consent
 * adapters, rule engine, drift engine and scoring all arrive in Phases 2–3.
 */
export {
  assertSafeUrl,
  assertSafeRedirect,
  assertSafeAddress,
  SsrfBlockedError,
  SSRF_USER_MESSAGE,
  MAX_REDIRECT_HOPS,
  type PinnedTarget,
  type SsrfRejectionReason,
  type AssertSafeUrlOptions,
} from "./net/guard";

export {
  checkCnameCloaking,
  resolveCnameChain,
  clearCnameCache,
  KNOWN_CLOAKING_TARGETS,
  type CnameResolutionResult,
} from "./net/cname";

export {
  diagnosticHeaderNames,
  hashValue,
  redactValue,
  sanitizeConsoleMessage,
  sanitizeCookieValue,
  sanitizeStorageValue,
  sanitizeUrl,
  REDACTED,
  type SanitizedUrl,
  type SanitizedValue,
} from "./privacy/sanitize";

export {
  CONSENT_PHASES,
  deriveScanStatus,
  isRetryable,
  type CmpDetectionResult,
  type ConsentErrorCode,
  type ConsentMethod,
  type ConsentPhase,
  type PhaseResult,
  type PhaseStatus,
  type RecordedConsoleLog,
  type RecordedCookie,
  type RecordedRequest,
  type RecordedScreenshot,
  type RecordedStorageEntry,
  type ScanErrorCode,
  type ScanInput,
  type ScanResult,
  type ScreenshotKind,
  type SnapshotPoint,
  type ConsentModeFact,
  type RecordedConsentEvent,
  type DomGatingFact,
  type ButtonGeometryFact,
  type FingerprintFact,
  type FormSubmissionFact,
} from "./types";

export {
  CONSENT_MODE_INIT_SCRIPT,
  parseConsentModeEvents,
} from "./instrumentation/consent-mode";

export {
  FINGERPRINT_TRAP_SCRIPT,
  parseFingerprintCalls,
  type RecordedFingerprintCall,
} from "./instrumentation/fingerprint-trap";

export {
  measureDomGating,
  measureConsentButtonAsymmetry,
} from "./instrumentation/dom-gating";

export {
  resolveDestinationCountry,
  COUNTRY_CODE_MAP,
} from "./net/geoip";

export {
  runSyntheticFormInteraction,
} from "./consent/interactive-runner";

export {
  extractPolicyLinksFromHtml,
  selectBestPolicyLink,
  discoverPolicyFromPage,
  resolveSafePolicyUrl,
  COMMON_POLICY_PATHS,
  type DiscoveredLink,
} from "./policy/discovery";

export {
  decodeHtmlEntities,
  extractCleanText,
} from "./policy/extractor";


