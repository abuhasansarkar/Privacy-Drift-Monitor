import { t } from "@pdm/shared/copy";
import { PortalDate } from "@/components/portal/time";
import { getPortalScans } from "@/server/portal/serializers";
import { requirePortalSession } from "@/server/portal/session";

/**
 * PORTAL HISTORY — §3.13: "Date, status, 'checked successfully' / 'partially
 * checked', score. No technical detail."
 *
 * ⚠️ A PARTIAL OR FAILED CHECK SHOWS NO SCORE (P5). A number beside
 * "partially checked" reads as a clean result, which is exactly the verdict an
 * incomplete scan may never produce — and a client has no way to click through
 * and discover otherwise.
 */
export default async function PortalScansPage() {
  const session = await requirePortalSession();
  const scans = await getPortalScans(session);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-semibold leading-tight">{t("portal.scansTitle")}</h1>

      {scans.length === 0 ? (
        <p className="text-muted-foreground">{t("portal.scansEmpty")}</p>
      ) : (
        <ul className="flex flex-col">
          {scans.map((scan) => (
            <li
              key={scan.id}
              className="flex flex-wrap items-center gap-3 border-b border-border py-4 last:border-b-0"
            >
              <span className="min-w-[10rem]">
                <PortalDate iso={scan.checkedIso} />
              </span>
              <span className="text-muted-foreground">{scan.outcomeWord}</span>
              <span className="ms-auto text-[18px] font-medium tabular-nums">
                {scan.score ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
