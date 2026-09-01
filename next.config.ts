import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * Next.js 16.3.3 — see PLAN.md Part 0 §0.4 before adding anything here.
 *
 * ⚠️ Do NOT add a `webpack` key. Turbopack is the default builder for both
 * `next dev` and `next build`; a webpack config makes the build fail.
 * Use `turbopack.*` keys instead.
 *
 * `serverExternalPackages` already includes @prisma/client, prisma, pg, pino,
 * playwright and sharp by default in 16.x — do not re-declare them.
 */
const nextConfig: NextConfig = {
  /**
   * ⚠️ REQUIRED BY `Dockerfile.web` (§10.9). Standalone output traces the exact
   * files the server needs into `.next/standalone`, which is what makes a
   * ~180 MB runtime image possible instead of shipping `node_modules`. Without
   * it the Docker build copies the whole workspace and the image is over a
   * gigabyte of files the server never opens.
   */
  output: "standalone",

  /**
   * Workspace packages export raw TypeScript from `src/` (see
   * packages/database/package.json `main`). npm workspaces symlink them into
   * node_modules, which Next does not transpile by default, so each one must be
   * listed here or the first import fails to compile.
   *
   * Add every `@pdm/*` package as it starts being imported by the web app.
   */
  transpilePackages: [
    "@pdm/database",
    "@pdm/shared",
    "@pdm/schemas",
    "@pdm/scanner",
  ],

  images: {
    // Defaults changed in 16: qualities is [75]. Declared explicitly so a future
    // `quality={90}` on a screenshot does not silently fail.
    qualities: [75, 90],
  },

  /**
   * SECURITY HEADERS — PLAN.md Part X §10.1, Phase 7 task 7.1.
   *
   * ⚠️ THESE LIVE HERE AND NOT IN `proxy.ts`, AND THE REASON IS A GAP THE
   * PHASE-7 HEADER TEST FOUND. When Clerk's `auth.protect()` refuses a request
   * it returns its own 307 immediately — the proxy body never runs, so a
   * response set there carries no headers at all. `headers()` is applied by
   * Next to every response it produces, including that redirect.
   *
   * ⚠️ CSP IS **NOT** HERE, because it needs a per-request nonce and this
   * config is evaluated once at build time. It stays in `proxy.ts`, where the
   * two-policy split is explained at length.
   *
   * ⚠️ HSTS IS PRODUCTION-ONLY. `max-age=63072000; preload` on localhost pins
   * the developer's browser to HTTPS for two years on `localhost`, breaking
   * every other local project they own, and it cannot be undone from the app.
   */
  async headers() {
    const base = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      base.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/:path*", headers: base }];
  },

  experimental: {
    serverActions: {
      // Screenshot and CSV uploads go through route handlers, not actions.
      bodySizeLimit: "1mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "abu-hasan-sarkar",
  project: "privacy-drift-monitor",
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
