import { t } from "@pdm/shared/copy";
import { PortalDate } from "@/components/portal/time";
import { getPortalIssues } from "@/server/portal/serializers";
import { auditPortal, requirePortalSession } from "@/server/portal/session";

/**
 * PORTAL ITEMS — §3.13, UI_DESIGN_PROMPTS §7.2 (screen A).
 *
 * ⚠️ CARDS, NOT A TABLE. §7.2 is explicit, and the reason is the audience: a
 * six-column technical table is what this client hired the agency to avoid.
 *
 * ⚠️ NO RULE IDS, NO EVIDENCE, NO DEVELOPER FIX GUIDANCE. The serializer does
 * not select `technicalReason` or `recommendedAction`, so they are absent from
 * the response rather than omitted from the markup (§6.10).
 */
export default async function PortalIssuesPage() {
  const session = await requirePortalSession();
  const issues = await getPortalIssues(session);

  // §6.10: portal activity is audit-logged, and the agency can see it.
  await auditPortal(session, "portal.issues_viewed", {
    entityType: "client",
    entityId: session.clientId,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[30px] font-semibold leading-tight">{t("portal.issuesTitle")}</h1>

      {issues.length === 0 ? (
        <p className="text-muted-foreground">{t("portal.issuesEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {issues.map((issue) => (
            <li key={issue.id} className="rounded-lg border border-border p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Chip word={issue.severityWord} />
                <span className="text-[14px] text-muted-foreground">
                  {issue.statusWord}
                </span>
                <span className="ms-auto text-[14px] text-muted-foreground">
                  <PortalDate iso={issue.detectedIso} />
                </span>
              </div>
              <h2 className="mt-2 text-[18px] font-medium">{issue.title}</h2>
              <p className="mt-1.5 text-muted-foreground">{issue.explanation}</p>
              <p className="mt-3 text-[14px] text-muted-foreground">
                {issue.websiteLabel}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ word }: { word: string }) {
  const tone =
    word === t("portal.severityNeedsAttention")
      ? "bg-danger-muted text-danger"
      : word === t("portal.severityWorthReviewing")
        ? "bg-warning-muted text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-md px-2.5 py-1 text-[14px] font-medium ${tone}`}>{word}</span>
  );
}
