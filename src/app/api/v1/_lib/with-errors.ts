import { NextResponse } from "next/server";
import { toAppError } from "@pdm/shared/errors";

/**
 * Converts a thrown `AppError` into the v1 error envelope.
 *
 * ⚠️ THIS EXISTS BECAUSE CONSOLIDATING THE API ROOTS REMOVED A GATE. The agency
 * routes used to sit under `/api/*`, where `auth.protect()` in `src/proxy.ts`
 * rejected an unauthenticated request before the handler ran. `/api/v1(.*)` is
 * in `PUBLIC_ROUTE_PATTERNS` — each v1 handler authenticates itself — so after
 * the move those requests reach the handler, `requirePermission()` throws, and
 * a route with no `catch` answers a missing session with a 500 instead of a 401.
 *
 * The handlers still fail closed either way. What this restores is the STATUS
 * CODE, which is the part a caller can act on.
 *
 * A folder named `_lib` is private in the App Router — it is not a route.
 */
export function withApiErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      const appError = toAppError(error);
      return NextResponse.json(
        {
          error: {
            code: appError.code,
            message: appError.expose ? appError.message : undefined,
          },
        },
        { status: appError.httpStatus },
      );
    }
  };
}
