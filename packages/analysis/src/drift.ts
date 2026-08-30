/**
 * PRIVACY DRIFT — PLAN.md Part IV §4.10, Phase 3 task 3.6.
 *
 * The product's namesake: what CHANGED since we last looked. A finding tells an
 * agency their client's site has a problem; a drift event tells them it started
 * on Tuesday, which is the thing they can actually act on.
 *
 * ⚠️ NEVER COMPARE AGAINST A `PARTIAL` SCAN. §4.10 and the schema comment both
 * say it, and it is the single most likely source of false drift: an incomplete
 * scan recorded fewer things, so every journey that did not run shows up as a
 * page full of "removed" events. `pickBaseline` below is the only sanctioned
 * way to choose the other side of the diff, and it filters for COMPLETED.
 *
 * ⚠️ NORMALIZE BEFORE DIFFING. Rotating cookie names (`_gcl_au_1712`),
 * cache-busted script URLs (`app.4f2c1.js`) and session ids in paths change on
 * every load. Diffing them raw produces drift on a site nobody touched, which
 * trains users to ignore the feed — the one outcome that makes this feature
 * worthless.
 */

export type DriftChangeType =
  | "TRACKER_ADDED"
  | "TRACKER_REMOVED"
  | "UNKNOWN_VENDOR_ADDED"
  | "COOKIE_ADDED"
  | "COOKIE_REMOVED"
  | "THIRD_PARTY_DOMAIN_ADDED"
  | "THIRD_PARTY_DOMAIN_REMOVED"
  | "CONSENT_REGRESSION"
  | "CMP_CHANGED"
  | "CMP_REMOVED"
  | "SCORE_DROP";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/**
 * A scan reduced to comparable sets. This is what gets stored on the scan as
 * `fingerprints` so a later diff never has to re-read the evidence tables.
 */
export interface ScanFingerprint {
  scanId: string;
  /** `vendorSlug@phase` — the phase is part of identity (§4.10). */
  trackers: string[];
  /** Normalized cookie names, per phase. */
  cookies: string[];
  /** Third-party registrable domains, per phase. */
  domains: string[];
  cmpId: string | null;
  healthScore: number | null;
}

export interface DriftEvent {
  changeType: DriftChangeType;
  severity: Severity;
  summary: string;
  addedItems: string[];
  removedItems: string[];
  beforeValue: string | null;
  afterValue: string | null;
}

/* ── Normalization ───────────────────────────────────────────────────────── */

/**
 * Rules for collapsing values that vary between scans without anything having
 * changed. Each one exists because of a real pattern, named in the comment —
 * a normalizer without a reason is a normalizer that hides real drift.
 */
const NORMALIZERS: Array<{ pattern: RegExp; replacement: string; because: string }> = [
  {
    // Google's `_gcl_au`, `_gac_UA-123`, Facebook's `_fbc_1712…`: a stable
    // prefix plus a rotating suffix.
    pattern: /^(_ga|_gid|_gat|_gcl_[a-z]+|_gac|_fbp|_fbc|_uetsid|_uetvid)[_-].*/i,
    replacement: "$1_*",
    because: "vendor cookie with a rotating suffix",
  },
  {
    // Cache-busted bundles: `app.4f2c1a.js`, `main-8ac31f2.js`.
    pattern: /^(.*?)[.-][0-9a-f]{6,}\.(js|css)$/i,
    replacement: "$1.*.$2",
    because: "cache-busted asset filename",
  },
  {
    // Anything that is only a long hex or base64-ish run is an identifier.
    pattern: /^[0-9a-f]{16,}$/i,
    replacement: "*",
    because: "opaque identifier",
  },
];

/**
 * Normalizes one comparable value.
 *
 * ⚠️ Applied to BOTH sides of every diff, always. Normalizing one side only
 * turns every value into a change.
 */
export function normalize(value: string): string {
  for (const rule of NORMALIZERS) {
    if (rule.pattern.test(value)) {
      return value.replace(rule.pattern, rule.replacement).toLowerCase();
    }
  }
  return value.toLowerCase();
}

/* ── Baseline selection ──────────────────────────────────────────────────── */

export interface BaselineCandidate {
  scanId: string;
  status: string;
  finishedAt: Date | null;
}

/**
 * Picks the scan to diff against.
 *
 * ⚠️ COMPLETED ONLY. A PARTIAL scan is not a failed scan — it holds real
 * evidence for the journeys that ran — but it is not a complete OBSERVATION of
 * the site, and diffing a complete scan against it reports everything the
 * incomplete one missed as a removal. Returns null rather than falling back to
 * "the most recent whatever": no baseline means no drift events, which is
 * correct and quiet, where phantom drift is wrong and loud.
 */
export function pickBaseline(
  candidates: readonly BaselineCandidate[],
): BaselineCandidate | null {
  const complete = candidates
    .filter((candidate) => candidate.status === "COMPLETED" && candidate.finishedAt)
    .sort(
      (a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0),
    );
  return complete[0] ?? null;
}

/* ── Diff ────────────────────────────────────────────────────────────────── */

function diffSets(before: readonly string[], after: readonly string[]) {
  const beforeSet = new Set(before.map(normalize));
  const afterSet = new Set(after.map(normalize));
  return {
    added: [...afterSet].filter((item) => !beforeSet.has(item)).sort(),
    removed: [...beforeSet].filter((item) => !afterSet.has(item)).sort(),
  };
}

/** `vendor@PHASE` → readable, and the phase is what carries the meaning. */
function describe(key: string): string {
  const [subject, phase] = key.split("@");
  if (!phase) return subject ?? key;
  return `${subject} (${phase.replace(/_/g, " ").toLowerCase()})`;
}

/**
 * A tracker appearing in the REJECT_ALL phase that was not there before is a
 * CONSENT_REGRESSION, not a plain addition: the control used to work and now
 * does not. That distinction is the most valuable single output of this engine.
 */
function isRejectPhase(key: string): boolean {
  /*
   * ⚠️ Compared LOWERCASE, because `diffSets` runs every value through
   * `normalize()` first — which lowercases. An uppercase `@REJECT_ALL` check
   * here never matched, so consent regressions were silently downgraded to
   * ordinary "tracker added" events: the highest-value signal this engine
   * produces, lost to a case mismatch.
   */
  return key.toLowerCase().endsWith("@reject_all");
}

export interface DiffInput {
  previous: ScanFingerprint;
  current: ScanFingerprint;
}

export function diffScans(input: DiffInput): DriftEvent[] {
  const events: DriftEvent[] = [];

  const trackers = diffSets(input.previous.trackers, input.current.trackers);
  const regressions = trackers.added.filter(isRejectPhase);
  const plainAdditions = trackers.added.filter((key) => !isRejectPhase(key));

  if (regressions.length > 0) {
    events.push({
      changeType: "CONSENT_REGRESSION",
      // The highest severity this engine emits, and the only one that always
      // is: it means a control that previously honoured a rejection stopped.
      severity: "CRITICAL",
      summary: `${regressions.length} ${regressions.length === 1 ? "tracker" : "trackers"} now fires after Reject All`,
      addedItems: regressions.map(describe),
      removedItems: [],
      beforeValue: null,
      afterValue: null,
    });
  }

  if (plainAdditions.length > 0) {
    events.push({
      changeType: "TRACKER_ADDED",
      severity: "HIGH",
      summary: `${plainAdditions.length} new ${plainAdditions.length === 1 ? "tracker" : "trackers"} detected`,
      addedItems: plainAdditions.map(describe),
      removedItems: [],
      beforeValue: null,
      afterValue: null,
    });
  }

  if (trackers.removed.length > 0) {
    events.push({
      changeType: "TRACKER_REMOVED",
      // Removal is reported but is not a problem — it is usually the agency's
      // own fix landing, and flagging it as a concern would be noise.
      severity: "INFO",
      summary: `${trackers.removed.length} ${trackers.removed.length === 1 ? "tracker" : "trackers"} no longer detected`,
      addedItems: [],
      removedItems: trackers.removed.map(describe),
      beforeValue: null,
      afterValue: null,
    });
  }

  const cookies = diffSets(input.previous.cookies, input.current.cookies);
  if (cookies.added.length > 0) {
    events.push({
      changeType: "COOKIE_ADDED",
      severity: "MEDIUM",
      summary: `${cookies.added.length} new ${cookies.added.length === 1 ? "cookie" : "cookies"} observed`,
      addedItems: cookies.added.map(describe),
      removedItems: [],
      beforeValue: null,
      afterValue: null,
    });
  }
  if (cookies.removed.length > 0) {
    events.push({
      changeType: "COOKIE_REMOVED",
      severity: "INFO",
      summary: `${cookies.removed.length} ${cookies.removed.length === 1 ? "cookie" : "cookies"} no longer observed`,
      addedItems: [],
      removedItems: cookies.removed.map(describe),
      beforeValue: null,
      afterValue: null,
    });
  }

  const domains = diffSets(input.previous.domains, input.current.domains);
  if (domains.added.length > 0) {
    events.push({
      changeType: "THIRD_PARTY_DOMAIN_ADDED",
      severity: "MEDIUM",
      summary: `${domains.added.length} new third-party ${domains.added.length === 1 ? "domain" : "domains"} contacted`,
      addedItems: domains.added.map(describe),
      removedItems: [],
      beforeValue: null,
      afterValue: null,
    });
  }

  /*
   * A CMP change is worth its own event: it usually means the site swapped
   * consent vendor, which explains a burst of other drift on the same day and
   * saves someone an hour of confusion.
   */
  if (input.previous.cmpId !== input.current.cmpId) {
    if (input.current.cmpId === null) {
      events.push({
        changeType: "CMP_REMOVED",
        severity: "HIGH",
        summary: "Consent banner no longer detected",
        addedItems: [],
        removedItems: [],
        beforeValue: input.previous.cmpId,
        afterValue: null,
      });
    } else if (input.previous.cmpId !== null) {
      events.push({
        changeType: "CMP_CHANGED",
        severity: "MEDIUM",
        summary: `Consent platform changed from ${input.previous.cmpId} to ${input.current.cmpId}`,
        addedItems: [],
        removedItems: [],
        beforeValue: input.previous.cmpId,
        afterValue: input.current.cmpId,
      });
    }
  }

  /*
   * Only a DROP. A score going up needs no alert — it is the fix working, and
   * a feed that celebrates improvements buries the regressions.
   *
   * The 5-point floor keeps single-finding noise out: one medium issue moves
   * the score by 5, and a feed that fires on every one of those is a feed
   * nobody reads.
   */
  const before = input.previous.healthScore;
  const after = input.current.healthScore;
  if (before !== null && after !== null && before - after >= 5) {
    events.push({
      changeType: "SCORE_DROP",
      severity: before - after >= 20 ? "HIGH" : "MEDIUM",
      summary: `Health score dropped ${before - after} points`,
      addedItems: [],
      removedItems: [],
      beforeValue: String(before),
      afterValue: String(after),
    });
  }

  return events;
}
