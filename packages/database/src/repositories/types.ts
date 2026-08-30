/**
 * REPOSITORY CONVENTIONS — PLAN.md §12.1, §6.2, §6.3.
 *
 * A repository is typed data access for ONE aggregate. Three rules:
 *
 *  1. **Every repository is constructed from a `TenantClient`**, never the raw
 *     `prisma` export. `forAgency()` has already injected the tenant predicate,
 *     so a repository cannot accidentally widen its own scope.
 *  2. **A missing row returns `null`, never a throw.** The caller maps that to
 *     404 — never 403, which would confirm the id exists in another tenant
 *     (§6.2).
 *  3. **Repositories do not authorize and do not enqueue.** Permission checks
 *     happen in `requirePermission()` before the call; job enqueueing happens
 *     after the transaction commits (§5.6), never inside one.
 *
 * Pagination follows §6.3 exactly, and the split is deliberate:
 *   - OFFSET for bounded, user-browsable sets (websites, clients, issues,
 *     trackers, reports) where people expect page numbers and a total.
 *   - CURSOR for unbounded time-ordered streams (scans, requests, drift events,
 *     notifications, audit logs, activity) where an offset would drift under
 *     concurrent inserts and get slower the deeper you page.
 */

/** A page of a bounded set, with a total the UI can render as "page 2 of 9". */
export interface OffsetPage<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

/** A slice of an unbounded, time-ordered stream. */
export interface CursorPage<T> {
  items: T[];
  /** Opaque; pass back verbatim as `?cursor=`. `null` means the end. */
  nextCursor: string | null;
}

export interface OffsetPageRequest {
  page: number;
  perPage: number;
}

export interface CursorPageRequest {
  cursor?: string;
  limit: number;
}

export function toOffsetPage<T>(
  items: T[],
  total: number,
  { page, perPage }: OffsetPageRequest,
): OffsetPage<T> {
  return {
    items,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function skipTake({ page, perPage }: OffsetPageRequest) {
  return { skip: (page - 1) * perPage, take: perPage };
}

/**
 * Keyset pagination over a `(createdAt DESC, id)` index.
 *
 * We fetch `limit + 1` rows and use the extra one only to decide whether a next
 * page exists — never returning it. The id tiebreak matters: two rows written
 * in the same millisecond would otherwise repeat or vanish across pages.
 */
export function cursorSlice<T extends { id: string }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

/** Prisma's "record not found" code, raised by update/delete on a no-match. */
export const PRISMA_NOT_FOUND = "P2025";
/**
 * Prisma's unique-constraint conflict.
 *
 * Named CONFLICT, not the word Prisma's own docs use: `check:terminology` bans
 * that word tree-wide (Part I §1.12) and does not try to tell an identifier
 * from a user-facing string. The name also happens to match what we raise —
 * `ConflictError` / 409 — so it reads better at the call sites anyway.
 */
export const PRISMA_UNIQUE_CONFLICT = "P2002";

export function isPrismaError(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === code
  );
}

/**
 * Turns a name into a URL-safe slug.
 *
 * Uniqueness is `@@unique([agencyId, slug])`, so collisions are resolved by the
 * caller retrying with a suffix rather than by making this function clever.
 */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  // An all-symbol name ("!!!") would slugify to "" and break the unique index.
  return base.length > 0 ? base : "client";
}
