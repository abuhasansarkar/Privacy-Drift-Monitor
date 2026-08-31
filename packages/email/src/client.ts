import { createCircuitBreaker, CircuitOpenError } from "@pdm/shared/circuit-breaker";
import { EmailUnavailableError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";
import type { RenderedEmail } from "./templates";

/**
 * RESEND CLIENT — PLAN.md Part IX §9.5, Part X §10.x (resilience).
 *
 * ⚠️ A DIRECT FETCH AGAINST THE RESEND HTTP API rather than the `resend` SDK.
 * The SDK adds a dependency to satisfy one POST, and this process already has
 * to own the retry, the circuit breaker and the idempotency key — none of which
 * the SDK does for us. Swapping providers is this one file.
 *
 * ⚠️ SENDS HAPPEN ON THE EMAIL QUEUE, NEVER IN A REQUEST (§9.5). Nothing in a
 * user's request path waits on Resend, which is what makes "a Resend outage
 * never blocks a request" true rather than aspirational.
 *
 * ⚠️ LOCAL DEVELOPMENT USES MAILPIT (docker-compose). With no API key set, the
 * transport falls back to SMTP-less logging rather than silently pretending to
 * send — a developer must be able to tell "not configured" from "sent".
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface SendEmailInput {
  to: string | string[];
  from: EmailAddress;
  replyTo?: string;
  rendered: RenderedEmail;
  /** §9.5 — checked against `AlertHistory` before dispatch, and passed on. */
  idempotencyKey?: string;
  /** Digest and summary mail only. */
  listUnsubscribeUrl?: string | null;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Provider failures that will NEVER succeed on a retry.
 *
 * ⚠️ THE SAME DETERMINISTIC/TRANSIENT SPLIT THE SCANNER ALREADY MAKES
 * (`packages/scanner/src/types.ts`), and for the same reason. An unverified
 * sending domain answers 403 on every attempt; retrying it eight times over two
 * hours turns a one-line configuration fix into two hours of silence plus eight
 * identical warnings, and the operator sees "email is retrying" rather than
 * "your From address is not verified".
 *
 * 429 is deliberately ABSENT — a rate limit is exactly the case worth retrying.
 */
const PERMANENT_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422]);

/** Thrown for a provider rejection that a retry cannot fix. */
export class EmailRejectedError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`Resend rejected the message (${status})`);
    this.name = "EmailRejectedError";
    this.status = status;
    this.detail = detail;
  }
}

export interface SendEmailResult {
  /** Resend's message id. Stored on `AlertHistory.providerId` for webhooks. */
  providerId: string;
  /** True when no provider is configured and the send was logged instead. */
  simulated: boolean;
}

export interface EmailTransport {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Parses `EMAIL_FROM` into a name and an address.
 *
 * ⚠️ THE ENV VAR IS RFC 5322, NOT A BARE ADDRESS. `.env.example` ships it as
 * `"Privacy Drift Monitor <alerts@example.com>"`, and that file is the contract.
 * An earlier version of this module read it as a bare address and then wrapped
 * it again as `${name} <${email}>`, producing
 * `Privacy Drift Monitor <Privacy Drift Monitor <alerts@example.com>>` — which
 * Resend rejects, and which no test caught because with no API key every send
 * short-circuits to `simulated` before the header is ever built.
 *
 * Both forms are accepted, because an operator who sets a bare address is not
 * wrong — they just did not include a display name.
 */
export function parseFromAddress(
  value: string,
  fallbackName: string,
): EmailAddress {
  const trimmed = value.trim().replace(/^"|"$/g, "");
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(trimmed);
  if (!match) return { email: trimmed, name: fallbackName };

  const name = (match[1] ?? "").replace(/^"|"$/g, "").trim();
  return { email: (match[2] ?? "").trim(), name: name || fallbackName };
}

export interface ResendConfig {
  apiKey: string | null;
  /** Milliseconds. A slow provider must not hold a worker slot indefinitely. */
  timeoutMs: number;
}

export function resendConfigFromEnv(): ResendConfig {
  return {
    apiKey: process.env.RESEND_API_KEY || null,
    timeoutMs: Number(process.env.RESEND_TIMEOUT_MS ?? 10_000),
  };
}

/**
 * The breaker is MODULE-SCOPED on purpose: it protects a shared dependency, so
 * every send in this process has to see the same failure count. A per-call
 * breaker would never open.
 */
const breaker = createCircuitBreaker({
  name: "resend",
  failureThreshold: 5,
  resetAfterMs: 60_000,
  successThreshold: 2,
});

export function createResendTransport(config: ResendConfig): EmailTransport {
  const log = childLogger({ component: "email" });

  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      const recipients = Array.isArray(input.to) ? input.to : [input.to];

      if (!config.apiKey) {
        // ⚠️ LOUD, not silent. `simulated: true` reaches the alert history, so
        // a staging environment with no key shows "simulated" rather than
        // "delivered" — which would be a lie the moment someone trusted it.
        log.warn(
          { to: recipients, subject: input.rendered.subject },
          "no RESEND_API_KEY — email simulated, not sent",
        );
        return { providerId: `simulated-${crypto.randomUUID()}`, simulated: true };
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      };
      if (input.idempotencyKey) {
        headers["Idempotency-Key"] = input.idempotencyKey;
      }

      const body: Record<string, unknown> = {
        // `input.from.email` is always a bare address by this point — see
        // `parseFromAddress`. Composing here rather than passing the raw env
        // var through is what lets a client-facing send substitute the AGENCY's
        // display name while keeping our verified sending address.
        from: input.from.name
          ? `${input.from.name} <${input.from.email}>`
          : input.from.email,
        to: recipients,
        subject: input.rendered.subject,
        html: input.rendered.html,
        text: input.rendered.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.listUnsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${input.listUnsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        ...(input.attachments && input.attachments.length > 0
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content.toString("base64"),
                content_type: attachment.contentType,
              })),
            }
          : {}),
      };

      try {
        return await breaker.run(async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), config.timeoutMs);
          try {
            const response = await fetch(RESEND_ENDPOINT, {
              method: "POST",
              headers,
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            if (!response.ok) {
              const detail = await response.text().catch(() => "");

              /*
               * ⚠️ A CONFIGURATION REJECTION IS A RESULT, NOT AN OUTAGE. It is
               * thrown as its own type so the job records it and stops, rather
               * than retrying a From address that will never be accepted. See
               * PERMANENT_STATUSES.
               */
              if (PERMANENT_STATUSES.has(response.status)) {
                throw new EmailRejectedError(response.status, detail.slice(0, 300));
              }

              // The provider's raw error never reaches a user (§6.7); it is
              // logged and replaced with a stable code.
              throw new EmailUnavailableError("We couldn't send that email.", {
                reason: `RESEND_${response.status}:${detail.slice(0, 200)}`,
              });
            }

            const payload = (await response.json()) as { id?: string };
            if (!payload.id) {
              throw new EmailUnavailableError("We couldn't send that email.", {
                reason: "RESEND_NO_ID",
              });
            }
            return { providerId: payload.id, simulated: false };
          } finally {
            clearTimeout(timer);
          }
        });
      } catch (error) {
        if (error instanceof EmailRejectedError) {
          /*
           * ⚠️ LOGGED AT ERROR, NOT WARN. This needs a human to change a
           * setting; it is not a dependency having a bad minute. The detail is
           * the provider's own message, which is what actually tells the
           * operator that the domain is unverified.
           */
          log.error(
            { status: error.status, detail: error.detail, to: recipients },
            "resend rejected the message; a retry cannot fix this",
          );
        }
        if (error instanceof CircuitOpenError) {
          // ⚠️ The job RETRIES; it does not degrade to "sent". §9.5 gives the
          // email queue roughly two hours of retries, and in-app notifications
          // are unaffected throughout.
          log.warn({ retryAfterMs: error.retryAfterMs }, "resend circuit open");
        }
        throw error;
      }
    },
  };
}

/** Reads the breaker for `/api/health/ready` and the admin system-health page. */
export function emailCircuitState() {
  return breaker.state;
}
