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

  experimental: {
    serverActions: {
      // Screenshot and CSV uploads go through route handlers, not actions.
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
