import { t } from "@pdm/shared/copy";
import { KILL_SWITCHES } from "@pdm/shared/flags";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { FlagToggle } from "@/components/admin/flag-toggle";
import { formatNumber } from "@/lib/format";
import { setFeatureFlagAction } from "@/server/admin/actions";
import { adminDb, requireSuperAdmin } from "@/server/admin/context";

/**
 * `/admin/feature-flags` — PLAN.md §3.12, §11.13, Phase 6 task 6.6.
 *
 * ⚠️ THE KILL SWITCHES ARE MARKED, AND THEY ARE MARKED FROM THE SAME CONSTANT
 * THE CODE USES (`KILL_SWITCHES` in `@pdm/shared/flags`). A hand-maintained
 * list on this page would drift, and the moment it does, the person reaching
 * for the switch at 3am is reading a label that is not true.
 *
 * ⚠️ TURNING A FLAG OFF TAKES EFFECT WITHIN THE RESOLVER'S CACHE WINDOW, not
 * instantly, and the page says so rather than implying otherwise. A switch that
 * appears to act immediately and does not is worse than one that states its
 * latency — the operator flips it, sees no change, and flips something else.
 */
export default async function AdminFeatureFlagsPage() {
  await requireSuperAdmin();

  const flags = await adminDb().featureFlag.findMany({
    orderBy: { key: "asc" },
    include: { _count: { select: { overrides: true } } },
  });

  return (
    <AdminPage title={t("admin.flagsTitle")} subtitle={t("admin.flagsSubtitle")}>
      <AdminTable
        columns={[
          t("admin.flagKey"),
          t("admin.flagGlobal"),
          t("admin.flagRollout"),
          t("admin.flagOverrides"),
          "",
        ]}
        empty={flags.length === 0}
      >
        {flags.map((flag) => (
          <tr key={flag.id}>
            <td className="px-3 py-2">
              <span className="font-mono text-mono">{flag.key}</span>
              {KILL_SWITCHES.includes(flag.key as never) ? (
                <AdminPill tone="bad">
                  <span className="ml-1.5">{t("admin.flagKillSwitch")}</span>
                </AdminPill>
              ) : null}
              {flag.description ? (
                <span className="mt-0.5 block max-w-xl text-caption text-muted-foreground">
                  {flag.description}
                </span>
              ) : null}
            </td>
            <td className="px-3 py-2">
              <AdminPill tone={flag.enabled ? "good" : "neutral"}>
                {flag.enabled ? t("admin.flagOn") : t("admin.flagOff")}
              </AdminPill>
            </td>
            <td className="px-3 py-2 tabular-nums">{flag.rolloutPercent}%</td>
            <td className="px-3 py-2 tabular-nums">
              {formatNumber(flag._count.overrides)}
            </td>
            <td className="px-3 py-2 text-right">
              <FlagToggle
                flagKey={flag.key}
                enabled={flag.enabled}
                rolloutPercent={flag.rolloutPercent}
                isKillSwitch={KILL_SWITCHES.includes(flag.key as never)}
                action={setFeatureFlagAction}
              />
            </td>
          </tr>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
