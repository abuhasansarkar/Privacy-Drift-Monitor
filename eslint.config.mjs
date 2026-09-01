import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * `next lint` is removed in Next 16 — this flat config is driven by `eslint`
 * directly (see package.json "lint").
 */

/**
 * TENANT ISOLATION, LAYER 3 — PLAN.md §5.5.
 *
 * Layers 1 and 2 are the `agencyId` column and the `forAgency()` extension.
 * This is the third: raw `prisma` may not be imported where request-scoped code
 * lives, because every such query is one forgotten `where` away from crossing a
 * tenant. `tenant.ts` and AGENTS.md both claimed this rule existed; it did not.
 *
 * The escape hatch is `unsafeGlobalClient(reason)`, or a named disable that
 * says why — see `src/app/api/health/ready/route.ts` for the shape.
 */
const noRawPrisma = {
  "no-restricted-imports": [
    "error",
    {
      paths: [
        {
          name: "@pdm/database",
          importNames: ["prisma"],
          message:
            "Tenant data must go through forAgency(ctx.agencyId) from @pdm/database/tenant (PLAN.md §5.5). For genuinely cross-tenant work use unsafeGlobalClient(reason).",
        },
        {
          name: "@prisma/client",
          importNames: ["PrismaClient"],
          message:
            "There is one Prisma instance, in packages/database/src/client.ts. Constructing another opens a second connection pool.",
        },
      ],
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ours:
    "coverage/**",
    "**/dist/**",
  ]),

  {
    name: "pdm/no-raw-prisma-in-request-scope",
    files: [
      "src/app/**/*.ts",
      "src/app/**/*.tsx",
      "src/server/actions/**/*.ts",
      "src/server/services/**/*.ts",
      "src/components/**/*.tsx",
    ],
    /*
     * ⚠️ TESTS ARE EXEMPT, and the rule's own name says why: it guards
     * REQUEST-SCOPED code, where a forgotten `where` crosses a tenant in
     * production. A test asserting what a pre-tenant table contains — the free
     * scanner's `FreeScan` rows, for instance — has no agency to scope to, and
     * every DB-backed suite in `packages/**` and `worker/**` already reads
     * `prisma` directly because those paths were never in scope. Keeping tests
     * in scope only here would be an inconsistency that teaches people to
     * disable the rule, which is worse than exempting it deliberately.
     */
    ignores: ["**/__tests__/**"],
    rules: noRawPrisma,
  },

  {
    // Scoped to `src/components/**` ONLY. Pages under `src/app/**` are Server
    // Components and are the correct place to resolve data with `forAgency`;
    // shared components are not.
    name: "pdm/no-data-access-in-components",
    files: ["src/components/**/*.ts", "src/components/**/*.tsx"],
    rules: {
      // "Components render; packages/* and src/server/* decide" (AGENTS.md).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...noRawPrisma["no-restricted-imports"][1].paths,
            {
              name: "@pdm/database/tenant",
              message:
                "Components render; they do not query. Resolve data in a Server Component page or a service under src/server/, and pass it down as props.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
