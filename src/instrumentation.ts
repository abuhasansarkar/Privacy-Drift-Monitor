import type { Instrumentation } from "next";

/**
 * OBSERVABILITY ENTRY POINT — PLAN.md Part X §10.8, Phase 0 task 0.10.
 *
 * Next calls `register()` once per server process before any request is
 * handled, and `onRequestError` for every uncaught server-side error —
 * including errors inside Server Components and Server Actions, which is
 * exactly the surface a try/catch in a route handler cannot see.
 *
 * ⚠️ Everything here runs on the Node runtime (§0.4: `runtime = 'edge'` is
 * deprecated and we need Node for Prisma/Redis/Playwright anyway). The
 * `NEXT_RUNTIME` guard is still correct defensively — this file is also loaded
 * during the build's static analysis pass, where heavyweight imports are waste.
 *
 * Sentry is deliberately NOT wired up yet: the DSN is empty until Phase 7
 * (§12.3) and a half-configured error reporter is worse than none, because it
 * looks like coverage. `onRequestError` logs through the same structured
 * pipeline as everything else, so nothing is lost in the meantime — swapping in
 * `Sentry.captureRequestError` is a change to this file only.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Subpath, NOT the `@pdm/shared` barrel. The barrel re-exports `url/normalize`,
  // which pulls in `tldts` — so a barrel import here made the instrumentation
  // hook (the very first thing the server loads) depend on the Public Suffix
  // List. It crashed the boot with MODULE_NOT_FOUND instead of logging.
  const { logger } = await import("@pdm/shared/logger");

  logger.info(
    {
      service: process.env.SERVICE_NAME ?? "web",
      version: process.env.GIT_SHA ?? "dev",
      nodeEnv: process.env.NODE_ENV,
    },
    "server started",
  );
}

/**
 * Errors are logged with the request context that produced them, so a user
 * holding a `requestId` from an error envelope can be matched to the log line
 * (§10.8). The digest is Next's own stable hash of the error.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Subpath, NOT the `@pdm/shared` barrel. The barrel re-exports `url/normalize`,
  // which pulls in `tldts` — so a barrel import here made the instrumentation
  // hook (the very first thing the server loads) depend on the Public Suffix
  // List. It crashed the boot with MODULE_NOT_FOUND instead of logging.
  const { logger } = await import("@pdm/shared/logger");

  logger.error(
    {
      err: error,
      digest:
        typeof error === "object" && error !== null && "digest" in error
          ? String((error as { digest?: unknown }).digest)
          : undefined,
      path: request.path,
      method: request.method,
      // `request.headers` is a plain object here, not a Headers instance.
      // Pino's redaction paths cover `req.headers.*`; nest it so they apply.
      req: { headers: request.headers },
      router: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
    "unhandled server error",
  );
};
