import { repositoriesFor } from "@pdm/database/repositories";
import { requirePermission } from "@/server/auth/context";
import { withApiErrors } from "../../../_lib/with-errors";

/**
 * AUDIT LOG CSV EXPORT — §3.11 ("audit log viewer with filters and CSV export").
 *
 * ⚠️ STREAMED, NOT BUFFERED. An agency with two years of history has hundreds
 * of thousands of rows; materialising that into one string would hold the whole
 * export in the Node process's heap while the browser downloads it. The
 * `ReadableStream` below pages through the cursor and yields each chunk.
 *
 * ⚠️ IT EXPORTS WHAT CHANGED, NOT THE WHOLE ROW — the `before`/`after` columns
 * carry only the keys that moved (§10.6 minimisation). An export that
 * serialised every column would hand someone a second copy of the data the
 * audit trail exists to protect.
 *
 * ⚠️ HARD ROW CAP. A request that would otherwise run for minutes is bounded;
 * the caller narrows with filters rather than pulling everything.
 */

const PAGE_SIZE = 500;
const MAX_ROWS = 50_000;

const COLUMNS = [
  "timestamp",
  "action",
  "entity_type",
  "entity_id",
  "actor",
  "actor_type",
  "changed",
] as const;

/**
 * ⚠️ A LEADING `=`, `+`, `-` or `@` IS PREFIXED WITH AN APOSTROPHE. Excel and
 * Sheets treat those as formulas, so an `action` value someone controlled could
 * execute on open — CSV injection. Every field goes through this, not just the
 * ones that look risky today.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

async function handleGET(request: Request) {
  // Same gate as the viewer: the trail shows who did what across the whole
  // agency, so it is a settings capability rather than a general read.
  const ctx = await requirePermission("settings:read");
  const repos = repositoriesFor(ctx.agencyId);

  const params = new URL(request.url).searchParams;
  const filters = {
    action: params.get("action") || undefined,
    entityType: params.get("entity") || undefined,
    userId: params.get("actor") || undefined,
  };

  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let emitted = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`${COLUMNS.join(",")}\n`));
    },
    async pull(controller) {
      if (emitted >= MAX_ROWS) {
        controller.close();
        return;
      }

      const page = await repos.audit.list({ ...filters, cursor, limit: PAGE_SIZE });

      for (const entry of page.items) {
        const actor = entry.user
          ? [entry.user.firstName, entry.user.lastName].filter(Boolean).join(" ") ||
            entry.user.email
          : "system";

        // Only the keys that actually moved — never the whole before/after row.
        const changed =
          entry.before || entry.after
            ? { before: entry.before ?? null, after: entry.after ?? null }
            : null;

        controller.enqueue(
          encoder.encode(
            [
              csvCell(entry.createdAt.toISOString()),
              csvCell(entry.action),
              csvCell(entry.entityType),
              csvCell(entry.entityId),
              csvCell(actor),
              csvCell(entry.actorType),
              csvCell(changed),
            ].join(",") + "\n",
          ),
        );
        emitted += 1;
      }

      cursor = page.nextCursor ?? undefined;
      if (!cursor || page.items.length === 0) controller.close();
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      // An export is a point-in-time snapshot of tenant data; nothing between
      // us and the browser should keep a copy.
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withApiErrors(handleGET);
