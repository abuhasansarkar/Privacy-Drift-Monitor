export { classify, type Detection, type VendorPattern, type SignalType } from "./classify";
export {
  applyPrecedence,
  evaluateRules,
  fingerprint,
  RULES,
  type Finding,
  type IssueCategory,
  type Rule,
  type RuleContext,
  type Severity,
} from "./rules";
export {
  assertConsistent,
  bandFor,
  computeScore,
  type ScoreComponent,
  type ScoreConfidence,
  type ScoreResult,
} from "./score";
export {
  diffScans,
  normalize,
  pickBaseline,
  type DriftChangeType,
  type DriftEvent,
  type ScanFingerprint,
} from "./drift";
