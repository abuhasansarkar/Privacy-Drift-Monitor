import { NextResponse } from "next/server";
import { SCAN_STATUS_LABEL } from "@pdm/shared/copy/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getScanChoices } from "@/server/queries/reports";

/**
 * A website's recent scans, for the report wizard's scan selector.
 *
 * ⚠️ `requireWebsiteAccess` FIRST. It re-checks the tenant AND the member's
 * website scope, and raises NOT_FOUND rather than FORBIDDEN — a 403 would
 * confirm the id exists somewhere the caller cannot see (§6.2).
 *
 * ⚠️ NOT CACHED, and no `dynamic` export. Route Handler GET is uncached by
 * default in Next 16; `force-dynamic` here would be cargo-cult.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/websites/[websiteId]/scans">,
) {
  const { websiteId } = await context.params;
  const ctx = await requireWebsiteAccess(websiteId);
  const scans = await getScanChoices(ctx, websiteId);

  const format = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ctx.timezone,
  });

  return NextResponse.json({
    scans: scans.map((scan) => ({
      id: scan.id,
      // The label carries the STATUS, so a PARTIAL scan is visibly partial in
      // the selector rather than discovered inside the finished PDF (P5).
      label: `${scan.finishedAt ? format.format(scan.finishedAt) : "—"} · ${
        SCAN_STATUS_LABEL[scan.status]
      }${scan.healthScore !== null && scan.status === "COMPLETED" ? ` · ${scan.healthScore}` : ""}`,
    })),
  });
}
