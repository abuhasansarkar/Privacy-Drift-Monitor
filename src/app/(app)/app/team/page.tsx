import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { MutedBadge } from "@/components/ui/severity-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Can } from "@/components/can";
import { InviteMemberDialog } from "@/components/team/invite-member-dialog";
import { PendingInvitations } from "@/components/team/pending-invitations";
import { MemberRowActions } from "@/components/team/member-row-actions";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * TEAM — §6.2, Phase 1 task 1.9.
 *
 * ⚠️ MEMBERSHIP IS CLERK'S; ROLE IS OURS. Inviting and removing people from the
 * organization happens in Clerk (and arrives here through the webhook or
 * reconciliation); the five-role matrix has no Clerk equivalent, so it is set
 * here. Invitations dispatched here send a Clerk org invitation and record
 * the designated role in the database so that when accepted, the user receives
 * that role immediately.
 */
export default async function TeamPage() {
  const ctx = await requirePermission("team:read");
  const repos = repositoriesFor(ctx.agencyId);

  const now = new Date();
  const [members, invitations, websites] = await Promise.all([
    repos.team.list(),
    repos.team.pendingInvitations(now),
    repos.db.website.findMany({
      where: { archivedAt: null },
      select: { id: true, url: true },
      orderBy: { url: "asc" },
    }),
  ]);

  const inviteIds = invitations.map((inv) => inv.id);
  const alertHistories =
    inviteIds.length > 0
      ? await repos.db.alertHistory.findMany({
          where: {
            agencyId: ctx.agencyId,
            entityType: "invitation",
            entityId: { in: inviteIds },
            channel: "email",
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const alertMap = new Map<string, (typeof alertHistories)[0]>();
  for (const alert of alertHistories) {
    if (alert.entityId && !alertMap.has(alert.entityId)) {
      alertMap.set(alert.entityId, alert);
    }
  }

  const emailFrom = process.env.EMAIL_FROM ?? "";
  const isSandboxDomain = emailFrom.includes("resend.dev");
  const hasFailedInvite = invitations.some((inv) => alertMap.get(inv.id)?.status === "failed");

  const websiteOptions = websites.map((w) => ({ id: w.id, url: w.url }));

  const columns: Column[] = [
    { key: "member", label: t("team.columnMember") },
    { key: "joined", label: t("team.columnJoined"), hideBelow: "lg" },
    { key: "active", label: t("team.columnLastActive"), hideBelow: "lg" },
    { key: "role", label: t("team.columnRole"), align: "end" },
  ];

  const rows: Row[] = members.map((member) => {
    const isSelf = member.userId === ctx.userId;
    const name =
      [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") ||
      member.user.email;

    return {
      id: member.id,
      primary: (
        <span className="flex items-center gap-2">
          {name}
          {isSelf ? <MutedBadge>{t("team.you")}</MutedBadge> : null}
        </span>
      ),
      secondary: member.user.email,
      cells: {
        joined: (
          <time dateTime={member.joinedAt.toISOString()} className="text-muted-foreground">
            {formatDate(member.joinedAt, ctx.timezone)}
          </time>
        ),
        active: member.user.lastActiveAt ? (
          <time
            dateTime={member.user.lastActiveAt.toISOString()}
            className="text-muted-foreground"
          >
            {formatRelative(member.user.lastActiveAt, now)}
          </time>
        ) : (
          <span className="text-muted-foreground">{t("team.never")}</span>
        ),
        role: (
          <MemberRowActions
            memberId={member.id}
            memberName={name}
            role={member.role}
            websiteScope={member.websiteScope}
            websites={websiteOptions}
            isSelf={isSelf}
            canChangeRole={can(ctx.role, "team:role_change")}
            canRemove={can(ctx.role, "team:remove")}
          />
        ),
      },
    };
  });

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("team.title")}
        subtitle={`${formatNumber(members.length)} ${t("team.members")}`}
        actions={
          <Can role={ctx.role} permission="team:invite">
            <InviteMemberDialog />
          </Can>
        }
      />

      {isSandboxDomain || hasFailedInvite ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-small">
          <div className="font-semibold text-warning">
            Notice: Email Delivery in Sandbox Mode
          </div>
          <p className="text-muted-foreground text-caption leading-relaxed">
            Your email service is currently configured with the provider sandbox domain (<code>onboarding@resend.dev</code>). Resend restricts sandbox emails to your account owner address only. When inviting other team members, automatic email delivery will be rejected by the provider. You can copy the invitation link using the <strong className="text-foreground">Copy link</strong> button below and share it directly with your colleague to join immediately. To enable automated email sending to all recipients, please verify a custom sending domain in Resend.
          </p>
        </div>
      ) : null}

      <Card>
        <DataList caption={t("team.title")} columns={columns} rows={rows} />
      </Card>

      <PendingInvitations
        invitations={invitations.map((inv) => {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const rawToken = inv.token.split(":::")[0];
          const inviteUrl = `${appUrl}/invite/${rawToken}`;
          const alert = alertMap.get(inv.id);

          return {
            id: inv.id,
            email: inv.email,
            role: inv.role,
            inviteUrl,
            createdAt: inv.createdAt,
            expiresAt: inv.expiresAt,
            deliveryStatus: alert?.status ?? null,
            deliveryError: alert?.errorMessage ?? null,
          };
        })}
        canRevoke={can(ctx.role, "team:invite")}
        timezone={ctx.timezone}
      />

      <Card className="p-4">
        <h2 className="text-h4">{t("team.inviteTitle")}</h2>
        <p className="mt-1 text-small text-muted-foreground">{t("team.inviteBody")}</p>
      </Card>
    </div>
  );
}
