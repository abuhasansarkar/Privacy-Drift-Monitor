import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Can } from "@/components/can";
import { PageHeader } from "@/components/ui/page-header";
import { StartScanButton } from "@/components/scans/start-scan-button";
import { WebsiteActions } from "@/components/websites/website-actions";
import { WebsiteTabs } from "@/components/websites/website-tabs";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getWebsiteDetail } from "@/server/queries/detail";

/**
 * WEBSITE DETAIL SHELL — §3.6, Phase 3 task 3.10.
 *
 * Header, actions and tab bar, shared by every tab so they cannot drift apart.
 *
 * ⚠️ `requireWebsiteAccess` runs here AND in every tab page. A layout and its
 * page render independently in Next 16 — a page that trusted this gate would be
 * trusting something it cannot observe (§6.1).
 */
export default async function WebsiteDetailLayout({
  children,
  params,
}: LayoutProps<"/app/websites/[websiteId]">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const website = await getWebsiteDetail(ctx, websiteId);
  if (!website) notFound();

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={<span className="font-mono text-h3 break-all">{website.url}</span>}
        subtitle={
          website.client ? (
            <Link
              href={`/app/clients/${website.client.id}`}
              className="underline-offset-2 hover:underline"
            >
              {website.client.name}
            </Link>
          ) : (
            t("addWebsite.noClient")
          )
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Can role={ctx.role} permission="scan:trigger">
              <StartScanButton websiteId={website.id} />
            </Can>
            <WebsiteActions
              websiteId={website.id}
              monitoringStatus={website.monitoringStatus}
              canUpdate={can(ctx.role, "website:update")}
              canArchive={can(ctx.role, "website:delete")}
            />
          </div>
        }
      />

      {website.archivedAt ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-small text-muted-foreground">
          {t("websites.archivedNotice")}
        </p>
      ) : null}

      <WebsiteTabs websiteId={websiteId} />

      {children}
    </div>
  );
}
