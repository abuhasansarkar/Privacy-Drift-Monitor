import Link from "next/link";
import { t } from "@pdm/shared/copy";
import {
  DIGEST_LABEL,
  NOTIFICATION_TYPE_LABEL,
  SEVERITY_LABEL,
} from "@pdm/shared/copy/labels";
import { AlertRulesPanel } from "@/components/alerts/rules-panel";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { DELIVERY_TONE } from "@/lib/labels";
import { requirePermission } from "@/server/auth/context";
import { getAlertHistory, getAlertRules } from "@/server/queries/alerts";

/**
 * ALERTS — §3.11, UI_DESIGN_PROMPTS §5.21.
 *
 * Two tabs. **Rules** decides what we send; **History** proves what we sent —
 * an agency asking "did our client's contact actually receive Tuesday's alert?"
 * is answered from the delivery status Resend's webhooks write back.
 *
 * ⚠️ THE HISTORY TAB SHOWS SUPPRESSIONS, NOT JUST SENDS. A duplicate held
 * inside the four-hour window and an alert deferred by quiet hours both appear
 * with their reason — an alert system that hides its own suppressions is one
 * nobody can debug, and the first support question is always "why didn't we
 * get an email?"
 */
export default async function AlertsPage({ searchParams }: PageProps<"/app/alerts">) {
  // The gate runs here so an unauthorised member never reaches either tab; the
  // tab components re-resolve context because they each need different data.
  await requirePermission("alert:read");
  const raw = await searchParams;
  const tab = (Array.isArray(raw.tab) ? raw.tab[0] : raw.tab) === "history" ? "history" : "rules";

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("alerts.title")} subtitle={t("alerts.subtitle")} />

      <div className="flex items-center gap-1 border-b border-border">
        <TabLink href="/app/alerts" active={tab === "rules"}>
          {t("alerts.tabRules")}
        </TabLink>
        <TabLink href="/app/alerts?tab=history" active={tab === "history"}>
          {t("alerts.tabHistory")}
        </TabLink>
      </div>

      {tab === "rules" ? <RulesTab /> : <HistoryTab raw={raw} />}
    </div>
  );
}

async function RulesTab() {
  const ctx = await requirePermission("alert:read");
  const { rules, clients, websites, groups, scopeNames } = await getAlertRules(ctx);

  return (
    <>
      <AlertRulesPanel
        timezone={ctx.timezone}
        clients={clients.map((client) => ({ id: client.id, label: client.name }))}
        websites={websites.map((website) => ({
          id: website.id,
          label: website.label ?? website.url,
        }))}
        groups={groups.map((group) => ({ id: group.id, label: group.name }))}
        rules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          scopeType: rule.scopeType as "ALL" | "GROUP" | "CLIENT" | "WEBSITE",
          scopeId: rule.scopeId,
          scopeLabel:
            rule.scopeType === "ALL"
              ? t("alerts.scopeAll")
              : (scopeNames.get(rule.scopeId ?? "") ?? "—"),
          triggerTypes: rule.triggerTypes,
          triggerLabels: rule.triggerTypes.map((type) => NOTIFICATION_TYPE_LABEL[type]),
          minSeverity: rule.minSeverity,
          minSeverityLabel: SEVERITY_LABEL[rule.minSeverity],
          channels: rule.channels,
          digest: rule.digest,
          digestLabel: DIGEST_LABEL[rule.digest],
          quietHoursStart: rule.quietHoursStart,
          quietHoursEnd: rule.quietHoursEnd,
          criticalOverridesQuietHours: rule.criticalOverridesQuietHours,
          recipients: rule.recipients,
        }))}
      />
      <p className="text-small text-muted-foreground">{t("alerts.floodNote")}</p>
    </>
  );
}

async function HistoryTab({
  raw,
}: {
  raw: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requirePermission("alert:read");
  const { page } = await getAlertHistory(ctx, raw);

  const columns: Column[] = [
    { key: "type", label: t("alerts.columnType") },
    { key: "recipients", label: t("alerts.columnRecipients"), hideBelow: "lg" },
    { key: "channel", label: t("alerts.columnChannels") },
    { key: "status", label: t("alerts.columnDelivery") },
    { key: "sent", label: t("alerts.columnSentAt"), align: "end" },
  ];

  const rows: Row[] = page.items.map((entry) => ({
    id: entry.id,
    // Transactional mail (invitations, portal links) records a null type —
    // it is a send, not an alert, and labelling it REPORT_READY would be a
    // lie this tab would tell.
    primary: entry.type ? NOTIFICATION_TYPE_LABEL[entry.type] : t("alerts.typeTransactional"),
    secondary: entry.alertRule?.name ?? undefined,
    cells: {
      type: null,
      recipients: (
        <span className="font-mono text-mono text-muted-foreground">
          {entry.recipients.join(", ") || "—"}
        </span>
      ),
      channel: <MutedBadge>{entry.channel}</MutedBadge>,
      status: (
        <StatusBadge
          tone={
            (DELIVERY_TONE[entry.status as keyof typeof DELIVERY_TONE] ??
              "muted") as "success" | "warning" | "danger" | "info" | "muted"
          }
          label={deliveryLabel(entry.status)}
        />
      ),
      sent: (
        <time dateTime={entry.createdAt.toISOString()} className="text-muted-foreground">
          {formatDateTime(entry.createdAt, ctx.timezone)}
        </time>
      ),
    },
  }));

  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState
          title={t("alerts.emptyHistoryTitle")}
          body={t("alerts.emptyHistoryBody")}
        />
      ) : (
        <DataList caption={t("alerts.tabHistory")} columns={columns} rows={rows} />
      )}
    </Card>
  );
}

/** Suppressions read as an explanation, not as a failure. */
function deliveryLabel(status: string): string {
  switch (status) {
    case "queued":
      return t("alerts.statusQueued");
    case "sent":
      return t("alerts.statusSent");
    case "delivered":
      return t("alerts.statusDelivered");
    case "opened":
      return t("alerts.statusOpened");
    case "bounced":
    case "complained":
      return t("alerts.statusBounced");
    case "failed":
      return t("alerts.statusFailed");
    case "simulated":
      return t("alerts.statusSimulated");
    case "suppressed_quiet_hours":
      return t("alerts.statusDeferred");
    case "suppressed_duplicate":
      return t("alerts.statusSuppressed");
    default:
      return status;
  }
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-small transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
