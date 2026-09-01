import { t } from "@pdm/shared/copy";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatNumber } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { getRuleAnalytics } from "@/server/admin/queries";

/**
 * `/admin/issues` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ FEATURE DOC 19 SINGLES THIS PAGE OUT: "the highest-value page for product
 * quality: it is how false positives get found before customers churn over
 * them. Don't defer it as 'just a report'." A customer who stops believing the
 * findings does not file a bug — they stop opening the emails, and then they
 * cancel. This table is the only place that failure is visible before it
 * happens.
 *
 * ⚠️ SORTED BY FALSE-POSITIVE RATE, NOT BY VOLUME. The loudest rule is rarely
 * the worst one; the worst one is the rule that everybody who bothered to
 * respond said was wrong. Rules with no feedback sort last — they are unknown,
 * not good.
 */
export default async function AdminRuleAnalyticsPage() {
  await requireSuperAdmin();
  const rules = await getRuleAnalytics();

  return (
    <AdminPage title={t("admin.rulesTitle")} subtitle={t("admin.rulesSubtitle")}>
      <AdminTable
        columns={[
          t("admin.ruleId"),
          t("admin.ruleFirings"),
          t("admin.ruleSeverity"),
          t("admin.ruleFeedback"),
          t("admin.ruleFalsePositive"),
          t("admin.ruleFpRate"),
        ]}
        empty={rules.length === 0}
      >
        {rules.map((rule) => {
          const rate = rule.falsePositiveRate;
          return (
            <tr key={rule.ruleId}>
              <td className="px-3 py-2 font-mono text-mono">{rule.ruleId}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(rule.total)}</td>
              <td className="px-3 py-2">
                {Object.entries(rule.severities)
                  .map(([severity, count]) => `${severity} ${count}`)
                  .join(" · ")}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatNumber(rule.feedbackTotal)}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {formatNumber(rule.falsePositives)}
              </td>
              <td className="px-3 py-2">
                {rate === null ? (
                  // Unknown, not good. A rule nobody has judged is a rule we
                  // have no evidence about, and showing 0% would say otherwise.
                  <span className="text-muted-foreground">—</span>
                ) : (
                  /*
                   * ⚠️ 20% IS THE LINE, AND IT IS WRITTEN DOWN RATHER THAN
                   * ENCODED IN A COLOUR ALONE. One finding in five being
                   * rejected is a rule that is costing more trust than it earns.
                   */
                  <AdminPill tone={rate >= 0.2 ? "bad" : rate >= 0.1 ? "warn" : "good"}>
                    {Math.round(rate * 100)}%
                  </AdminPill>
                )}
              </td>
            </tr>
          );
        })}
      </AdminTable>
    </AdminPage>
  );
}
