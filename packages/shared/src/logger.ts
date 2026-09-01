import pino, { type Logger } from "pino";

/**
 * STRUCTURED LOGGING — PLAN.md Part X §10.8.
 *
 * JSON to stdout, collected by the platform. Every line carries `service`,
 * `env`, and — where known — `requestId` or `jobId` and `agencyId`.
 *
 * ⚠️ The redaction list below is a SECURITY control, not tidiness. We process
 * arbitrary third-party websites and store customer credentials by reference;
 * a leaked header in a log line is a data incident. Add to it, never trim it.
 */

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "*.authorization",
  "*.cookie",
  "*.setCookie",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
  "*.webhookSecret",
  "*.basicAuth",
  "*.DATABASE_URL",
  // Scanner-specific: never log a target site's cookie or storage VALUES (§10.6).
  "*.cookieValue",
  "*.storageValue",
];

const isProduction = process.env.NODE_ENV === "production";

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: {
    service: process.env.SERVICE_NAME ?? "web",
    env: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  },
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  formatters: {
    // Ship the level as a word, not pino's numeric default — log search is
    // done by humans reading `level:"error"`.
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty output locally; raw JSON in production where a collector parses it.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        },
      }),
});

export interface LogContext {
  /** Subsystem tag for lines that belong to no request or job (email, reports). */
  component?: string;
  requestId?: string;
  jobId?: string;
  agencyId?: string;
  userId?: string;
  websiteId?: string;
  scanId?: string;
  /** The anonymous free scanner (§3.2). Pre-tenant: it has no `agencyId`. */
  freeScanId?: string;
}

/**
 * A child logger bound to a request or job.
 *
 * Always prefer this over the bare `logger` inside a handler — without
 * `requestId` a log line cannot be correlated to the error the user saw, which
 * is the whole point of returning a requestId in the error envelope.
 */
export function childLogger(context: LogContext): Logger {
  return logger.child(context);
}

/**
 * Log levels, per §10.8:
 *   error — needs human action
 *   warn  — degraded but handled (a PARTIAL scan, an open circuit breaker)
 *   info  — state transitions (scan queued, issue created, subscription changed)
 *   debug — development only
 */
export type { Logger };
