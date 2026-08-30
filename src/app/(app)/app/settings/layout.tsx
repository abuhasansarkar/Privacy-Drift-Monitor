import { t } from "@pdm/shared/copy";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/ui/page-header";
import { requireAgencyContext } from "@/server/auth/context";

/**
 * SETTINGS SHELL — §3.12, Phase 1 task 1.10.
 *
 * A sub-navigation rather than one long page: the sections have different
 * audiences (an admin sets branding, a developer reads the audit log) and a
 * single scrolling page makes every one of them scroll past the others.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAgencyContext();

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("settings.title")} subtitle={ctx.agencyName} />
      <div className="flex gap-6 max-lg:flex-col">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
