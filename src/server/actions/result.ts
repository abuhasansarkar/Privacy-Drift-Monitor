import "server-only";
import { isAppError, toAppError } from "@pdm/shared/errors";
import { childLogger } from "@pdm/shared/logger";

/**
 * SERVER ACTION RESULT ENVELOPE — §6.3.
 *
 * Actions RETURN failures, they do not throw them. A thrown error in a Server
 * Action reaches the client as an opaque digest and trips the nearest error
 * boundary, which replaces the whole form — including everything the user
 * typed. A field-level "That website is already monitored" has to come back as
 * a value.
 *
 * Genuinely unexpected errors still throw: those SHOULD hit the boundary,
 * because there is nothing useful to say inline.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** Stable machine-readable code — the client switches on this, never on `message`. */
      code: string;
      /** Safe to render. Never carries the internal `reason`. */
      message: string;
      /** Field-scoped messages, keyed by input name, for inline display. */
      fieldErrors?: Record<string, string>;
    };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

/**
 * Converts a thrown `AppError` into the envelope, honouring `expose`.
 *
 * ⚠️ `expose: false` means the message is for the log only (§10.x). Returning
 * it here would leak internal vocabulary to the browser, so an unexposed error
 * is re-thrown to the error boundary rather than being rendered with a
 * half-safe message.
 */
export function actionFromError(error: unknown, context: string): ActionResult<never> {
  const appError = toAppError(error);
  const log = childLogger({});

  if (!isAppError(error) || !appError.expose) {
    log.error({ err: error, context }, "server action failed");
    throw error;
  }

  // `reason` is deliberately logged and never returned.
  log.warn({ code: appError.code, reason: appError.reason, context }, "server action rejected");
  return actionError(appError.code, appError.message);
}
