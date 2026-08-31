import { t } from "@pdm/shared/copy";
import { PortalDate } from "@/components/portal/time";
import { getPortalReports } from "@/server/portal/serializers";
import { requirePortalSession } from "@/server/portal/session";

/**
 * PORTAL REPORTS — §3.13, UI_DESIGN_PROMPTS §7.2 (screen B).
 *
 * ⚠️ DOWNLOAD GOES THROUGH `/api/portal/reports/[id]/download`, which re-checks
 * the session and re-scopes on BOTH `agencyId` and `clientId` before minting a
 * short-lived signed URL. No S3 link is rendered into this page.
 */
export default async function PortalReportsPage() {
  const session = await requirePortalSession();
  const reports = await getPortalReports(session);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-semibold leading-tight">{t("portal.reportsTitle")}</h1>

      {reports.length === 0 ? (
        <p className="text-muted-foreground">{t("portal.reportsEmpty")}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              {/* A 4:3 cover placeholder — the real cover would cost a render
                  per card, and the PDF itself is one click away. */}
              <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/40 text-[13px] text-muted-foreground">
                PDF
              </div>
              <div>
                <p className="font-medium">{report.name}</p>
                <p className="text-[14px] text-muted-foreground">
                  {report.periodLabel ??
                    (report.generatedIso ? <PortalDate iso={report.generatedIso} /> : "")}
                </p>
              </div>
              <a
                href={`/api/portal/reports/${report.id}/download`}
                className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-[15px] font-medium hover:bg-muted"
              >
                {t("portal.downloadReport")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
