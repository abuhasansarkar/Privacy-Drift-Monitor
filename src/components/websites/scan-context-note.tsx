import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { formatDateTime } from "@/lib/format";

/**
 * WHICH SCAN THIS TAB IS SHOWING.
 *
 * ⚠️ Every evidence tab states its source scan and its outcome, and this is
 * not decoration. A Trackers tab built from a PARTIAL scan is missing whatever
 * the failed journey would have recorded — a reader who does not know that
 * reads an incomplete list as a complete one, which is the P5 failure wearing a
 * different hat.
 */
export function ScanContextNote({
  scan,
  timezone,
  websiteId,
}: {
  scan: { id: string; status: string; finishedAt: Date | null };
  timezone: string;
  websiteId: string;
}) {
  const partial = scan.status === "PARTIAL";

  return (
    <p
      className={
        partial
          ? "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning-muted bg-warning-muted px-3.5 py-2.5 text-small text-warning"
          : "flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground"
      }
    >
      <span>
        {partial ? t("websiteTabs.fromPartialScan") : t("websiteTabs.fromScan")}
      </span>
      {scan.finishedAt ? (
        <time dateTime={scan.finishedAt.toISOString()}>
          {formatDateTime(scan.finishedAt, timezone)}
        </time>
      ) : null}
      <Link
        href={`/app/websites/${websiteId}/scans/${scan.id}`}
        className="underline underline-offset-2"
      >
        {t("scans.viewScan")}
      </Link>
    </p>
  );
}
