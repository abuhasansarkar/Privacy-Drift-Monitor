import { PrismaClient } from "@prisma/client";

/**
 * The single Prisma instance for the whole system.
 *
 * Cached on globalThis in development so Next.js hot reload does not open a new
 * connection pool on every edit — that exhausts Postgres connections within minutes.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });

  // Query timing — feeds the db_query_duration_seconds histogram (PLAN.md §10.8).
  // Budget: p95 < 100 ms, p99 < 300 ms (§10.12).
  if (process.env.NODE_ENV === "development") {
    // `query` is typed here because the dev branch of the log config above declares
    // `{ emit: "event", level: "query" }` — Prisma derives the $on event union from it.
    client.$on("query", (e: { query: string; duration: number }) => {
      if (e.duration > 100) {
        console.warn(`[prisma] slow query ${e.duration}ms: ${e.query.slice(0, 200)}`);
      }
    });
  }

  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
