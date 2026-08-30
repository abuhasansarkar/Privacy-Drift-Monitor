import { notFound } from "next/navigation";
import { t } from "@pdm/shared/copy";
import { Card, CardHeader } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { HealthScore } from "@/components/ui/health-score";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/severity-badge";
import { Can } from "@/components/can";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { MONITORING_LABEL, MONITORING_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getClientDetail } from "@/server/queries/detail";

/**
 * CLIENT DETAIL — §3.7, Phase 1 task 1.5, feature 02.
 *
 * ⚠️ `notes` is deliberately NOT rendered here as internal-only trivia: it is
 * shown because the agency app is the surface that owns it. The portal and
 * report paths must project through `clientPortalSchema` instead of reusing
 * this row (feature 02).
 *
 * ⚠️ Average health EXCLUDES never-scanned sites. Counting an unscanned site as
 * zero would drag a healthy client's average down and make the one number a
 * client sees actively misleading — "—" means nothing scanned yet.
 */
export default async function ClientDetailPage({
  params,
}: PageProps<"/app/clients/[clientId]">) {
  const { clientId } = await params;
  const ctx = await requirePermission("client:read");

  const client = await getClientDetail(ctx, clientId);
  if (!client) notFound();

  const now = new Date();
  const scored = client.websites
    .map((site) => site.healthScore)
    .filter((score): score is number => score !== null);
  const averageHealth =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);

  const columns: Column[] = [
    { key: "site", label: t("websites.columnWebsite") },
    { key: "health", label: t("websites.columnHealth"), align: "end" },
    { key: "lastScan", label: t("websites.columnLastScan") },
    { key: "monitoring", label: t("websites.columnMonitoring") },
  ];

  const rows: Row[] = client.websites.map((site) => ({
    id: site.id,
    href: `/app/websites/${site.id}`,
    primary: <span className="font-mono text-mono">{site.url}</span>,
    secondary: site.label ?? undefined,
    dimmed: site.monitoringStatus === "PAUSED",
    cells: {
      health: <HealthScore score={site.healthScore} />,
      lastScan: site.lastScanAt ? (
        <time dateTime={site.lastScanAt.toISOString()} className="text-muted-foreground">
          {formatRelative(site.lastScanAt, now)}
        </time>
      ) : (
        <span className="text-muted-foreground">{t("websites.neverScanned")}</span>
      ),
      monitoring: (
        <StatusBadge
          tone={MONITORING_TONE[site.monitoringStatus]}
          label={MONITORING_LABEL[site.monitoringStatus]}
        />
      ),
    },
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader
        title={client.name}
        subtitle={
          client.archivedAt
            ? t("clients.archivedNotice")
            : `${formatNumber(client.websites.length)} ${t("websites.title").toLowerCase()}`
        }
        actions={
          <Can role={ctx.role} permission="website:create">
            <ButtonLink href="/app/websites/new" variant="primary">
              <PlusIcon />
              {t("websites.addWebsite")}
            </ButtonLink>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("clients.averageHealth")}
          </p>
          <div className="mt-1 text-h3">
            <HealthScore score={averageHealth} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("clients.columnWebsites")}
          </p>
          <p className="mt-1 text-h3 tabular-nums">
            {formatNumber(client.websites.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-caption text-muted-foreground">
            {t("clients.columnPortal")}
          </p>
          <p className="mt-2 text-small">
            {client.portalEnabled ? t("clients.portalOn") : t("clients.portalOff")}
          </p>
        </Card>
      </div>

      {client.contactName || client.contactEmail || client.notes ? (
        <Card>
          <CardHeader title={t("clients.contactTitle")} />
          <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
            {client.contactName ? (
              <div>
                <dt className="text-caption text-muted-foreground">
                  {t("clients.contactNameLabel")}
                </dt>
                <dd className="mt-0.5 text-small">{client.contactName}</dd>
              </div>
            ) : null}
            {client.contactEmail ? (
              <div className="min-w-0">
                <dt className="text-caption text-muted-foreground">
                  {t("clients.contactEmailLabel")}
                </dt>
                <dd className="mt-0.5 break-all text-small">{client.contactEmail}</dd>
              </div>
            ) : null}
            {client.notes ? (
              <div className="sm:col-span-2">
                <dt className="text-caption text-muted-foreground">
                  {t("clients.notesLabel")}
                </dt>
                <dd className="mt-0.5 whitespace-pre-line text-small">
                  {client.notes}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t("websites.title")}
          action={
            <span className="text-caption text-muted-foreground">
              {t("clients.addedLabel")}{" "}
              <time dateTime={client.createdAt.toISOString()}>
                {formatDateTime(client.createdAt, ctx.timezone)}
              </time>
            </span>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t("websites.title")}
            body={t("empty.noWebsitesForClient")}
            action={
              <Can role={ctx.role} permission="website:create">
                <ButtonLink href="/app/websites/new" variant="primary">
                  <PlusIcon />
                  {t("websites.addWebsite")}
                </ButtonLink>
              </Can>
            }
          />
        ) : (
          <DataList caption={t("websites.title")} columns={columns} rows={rows} />
        )}
      </Card>
    </div>
  );
}
