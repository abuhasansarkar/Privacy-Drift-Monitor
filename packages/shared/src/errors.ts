/**
 * ERROR TAXONOMY — PLAN.md Part X §10.x, Part VI (API architecture).
 *
 * Every error crossing an API boundary carries a STABLE machine-readable code.
 * Clients switch on `code`; `message` is for humans and may be reworded freely.
 * Never let a client depend on message text.
 *
 * Two rules that are load-bearing rather than stylistic:
 *
 *  1. A resource belonging to another tenant is reported as NOT_FOUND (404),
 *     never FORBIDDEN (403). A 403 confirms the id exists somewhere else, which
 *     is a cross-tenant information leak (§6.2).
 *
 *  2. `expose: false` errors never send their message to the client. Internal
 *     failures return the generic message plus a requestId, and the detail goes
 *     to the logs only.
 *
 * Every subclass narrows `code`, `httpStatus` and `expose` from `AppError`, so
 * each one carries an explicit `override` — the shared tsconfig sets
 * `noImplicitOverride`, which is what keeps a renamed base field from silently
 * leaving a subclass declaring a property nothing reads any more.
 */

export type ErrorCode =
  // ── auth / tenancy ────────────────────────────────────────────────
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NO_AGENCY"
  | "NOT_A_MEMBER"
  | "AGENCY_SUSPENDED"
  | "TENANT_ISOLATION_ERROR"
  // ── request ───────────────────────────────────────────────────────
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  // ── domain ────────────────────────────────────────────────────────
  | "ENTITLEMENT_EXCEEDED"
  | "WEBSITE_UNREACHABLE"
  | "URL_NOT_ALLOWED"
  | "SCAN_IN_PROGRESS"
  | "SCAN_FAILED"
  | "ADAPTER_UNAVAILABLE"
  // ── dependencies ──────────────────────────────────────────────────
  | "AI_UNAVAILABLE"
  | "AI_OUTPUT_REJECTED"
  | "STORAGE_UNAVAILABLE"
  | "BILLING_UNAVAILABLE"
  | "QUEUE_UNAVAILABLE"
  | "EMAIL_UNAVAILABLE"
  // ── Phase 4 domain ────────────────────────────────────────────────
  | "REPORT_GENERATION_FAILED"
  | "PORTAL_AUTH_FAILED"
  // ── catch-all ─────────────────────────────────────────────────────
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  /** Structured detail for the client. Never put secrets or other tenants' data here. */
  details?: Record<string, unknown>;
  /** Original error, for the log line. Never serialized to the client. */
  cause?: unknown;
  /**
   * The precise internal reason — a permission name, a website id, a rejected
   * SSRF check. Written to the log, **never** to `toResponse()`.
   *
   * This exists so `message` can stay a sentence a user can read. Putting
   * `MISSING_PERMISSION:website:create` in `message` on an `expose: true`
   * error shipped our internal vocabulary to the client, and
   * `WEBSITE_OUT_OF_SCOPE:<id>` confirmed an id existed — the exact leak §6.2
   * forbids.
   */
  reason?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode = "INTERNAL_ERROR";
  readonly httpStatus: number = 500;
  /** Whether `message` may be shown to the caller. */
  readonly expose: boolean = false;
  readonly details?: Record<string, unknown>;
  /** Log-only. See `AppErrorOptions.reason`. */
  readonly reason?: string;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.details = options.details;
    this.reason = options.reason;
  }

  /** Shape returned by the API error boundary. */
  toResponse(requestId: string) {
    return {
      error: {
        code: this.code,
        message: this.expose
          ? this.message
          : "Something went wrong on our side.",
        ...(this.expose && this.details ? { details: this.details } : {}),
        requestId,
      },
    };
  }
}

/* ── auth / tenancy ──────────────────────────────────────────────────── */

export class AuthenticationError extends AppError {
  override readonly code = "AUTHENTICATION_ERROR" as const;
  override readonly httpStatus = 401;
  override readonly expose = true;
}

export class AuthorizationError extends AppError {
  override readonly code = "AUTHORIZATION_ERROR" as const;
  override readonly httpStatus = 403;
  override readonly expose = true;
}

/**
 * Signed in, but not attached to any agency yet.
 *
 * Its own class, and its own `code`, because §3.3 routes on it: the app shell
 * sends this to `/app/onboarding`. Carrying the distinction in `message` and
 * string-matching it would violate rule 1 at the top of this file.
 */
export class NoAgencyError extends AppError {
  override readonly code = "NO_AGENCY" as const;
  override readonly httpStatus = 403;
  override readonly expose = true;
}

/** Signed in, agency exists, but this user has no ACTIVE membership of it. */
export class NotAMemberError extends AppError {
  override readonly code = "NOT_A_MEMBER" as const;
  override readonly httpStatus = 403;
  override readonly expose = true;
}

/** Routed to `/app/billing?suspended=1` (§3.3). */
export class AgencySuspendedError extends AppError {
  override readonly code = "AGENCY_SUSPENDED" as const;
  override readonly httpStatus = 403;
  override readonly expose = true;
}

/* ── request ─────────────────────────────────────────────────────────── */

export class ValidationError extends AppError {
  override readonly code = "VALIDATION_ERROR" as const;
  override readonly httpStatus = 422;
  override readonly expose = true;
}

/**
 * Also the correct error for "exists, but belongs to another tenant".
 * See rule 1 at the top of this file.
 */
export class NotFoundError extends AppError {
  override readonly code = "NOT_FOUND" as const;
  override readonly httpStatus = 404;
  override readonly expose = true;
}

export class ConflictError extends AppError {
  override readonly code = "CONFLICT" as const;
  override readonly httpStatus = 409;
  override readonly expose = true;
}

export class RateLimitedError extends AppError {
  override readonly code = "RATE_LIMITED" as const;
  override readonly httpStatus = 429;
  override readonly expose = true;
}

export class PayloadTooLargeError extends AppError {
  override readonly code = "PAYLOAD_TOO_LARGE" as const;
  override readonly httpStatus = 413;
  override readonly expose = true;
}

/* ── domain ──────────────────────────────────────────────────────────── */

export class EntitlementExceededError extends AppError {
  override readonly code = "ENTITLEMENT_EXCEEDED" as const;
  override readonly httpStatus = 402;
  override readonly expose = true;
}

/**
 * SSRF block, blocklisted domain, or a disallowed scheme.
 *
 * ⚠️ The message is deliberately vague — "We can't monitor this address."
 * Never reveal which check failed; that hands an attacker a probe oracle
 * (§10.3). The real reason goes to the security log.
 */
export class UrlNotAllowedError extends AppError {
  override readonly code = "URL_NOT_ALLOWED" as const;
  override readonly httpStatus = 422;
  override readonly expose = true;

  constructor(
    /**
     * The real reason — logged, never sent to the client.
     *
     * Narrows the optional `reason` on `AppError` to required: this error is
     * never constructed without one, because a blocked URL with no recorded
     * reason is unauditable.
     */
    override readonly reason: string,
    options: AppErrorOptions = {},
  ) {
    super("We can't monitor this address.", options);
  }
}

export class WebsiteUnreachableError extends AppError {
  override readonly code = "WEBSITE_UNREACHABLE" as const;
  override readonly httpStatus = 422;
  override readonly expose = true;
}

/** A scan is already running for this website; a second one is a no-op (§7.4). */
export class ScanInProgressError extends AppError {
  override readonly code = "SCAN_IN_PROGRESS" as const;
  override readonly httpStatus = 409;
  override readonly expose = true;
}

export class ScanFailedError extends AppError {
  override readonly code = "SCAN_FAILED" as const;
  override readonly httpStatus = 502;
  override readonly expose = true;
}

/** No consent adapter resolved, and the generic cascade did not settle (§4.6). */
export class AdapterUnavailableError extends AppError {
  override readonly code = "ADAPTER_UNAVAILABLE" as const;
  override readonly httpStatus = 422;
  override readonly expose = true;
}

/* ── dependencies ────────────────────────────────────────────────────── */

/**
 * The AI provider is down or the circuit breaker is open.
 *
 * This is never fatal to a request: findings render without AI (P3). Callers
 * degrade to the deterministic content and show the unavailable state.
 */
export class AiUnavailableError extends AppError {
  override readonly code = "AI_UNAVAILABLE" as const;
  override readonly httpStatus = 503;
  override readonly expose = true;
}

/**
 * An AI response failed schema, grounding, terminology or claim validation.
 * The output is discarded and never shown (P2).
 */
export class AiOutputRejectedError extends AppError {
  override readonly code = "AI_OUTPUT_REJECTED" as const;
  override readonly httpStatus = 502;
  override readonly expose = false;
}

export class StorageUnavailableError extends AppError {
  override readonly code = "STORAGE_UNAVAILABLE" as const;
  override readonly httpStatus = 503;
  override readonly expose = true;
}

export class QueueUnavailableError extends AppError {
  override readonly code = "QUEUE_UNAVAILABLE" as const;
  override readonly httpStatus = 503;
  override readonly expose = true;
}

/**
 * Stripe is unreachable. We never infer subscription state from our own guess
 * (§10.11) — existing subscriptions keep working and the UI says billing is
 * temporarily unavailable.
 */
export class BillingUnavailableError extends AppError {
  override readonly code = "BILLING_UNAVAILABLE" as const;
  override readonly httpStatus = 503;
  override readonly expose = true;
}

/**
 * Resend is unreachable or rejected the send. Phase 4, §9.5.
 *
 * ⚠️ ALWAYS RETRYABLE, NEVER FATAL TO AN ALERT. The in-app notification has
 * already been written by the time a send is attempted (§6.6), so an email
 * failure degrades the delivery channel and never the alert itself.
 */
export class EmailUnavailableError extends AppError {
  override readonly code = "EMAIL_UNAVAILABLE" as const;
  override readonly httpStatus = 503;
  override readonly expose = true;
}

/**
 * A report could not be produced. Phase 4, §6.8.
 *
 * ⚠️ THE USER-FACING MESSAGE MUST SAY THE ALLOWANCE WAS NOT CHARGED (§12.3).
 * That sentence is in `copy/en.ts` under `reports.failed`, not invented at the
 * throw site.
 */
export class ReportGenerationError extends AppError {
  override readonly code = "REPORT_GENERATION_FAILED" as const;
  override readonly httpStatus = 500;
  override readonly expose = true;
}

/**
 * A portal magic link or session was rejected. §6.10.
 *
 * ⚠️ DELIBERATELY UNINFORMATIVE. "Expired, already used, revoked or never
 * existed" are one message on purpose — distinguishing them tells an attacker
 * which client contacts exist.
 */
export class PortalAuthError extends AppError {
  override readonly code = "PORTAL_AUTH_FAILED" as const;
  override readonly httpStatus = 401;
  override readonly expose = true;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Normalizes anything thrown into an AppError, preserving the original as `cause`. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError(message, { cause: e });
}
