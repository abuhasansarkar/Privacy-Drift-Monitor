import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { can } from "@pdm/shared/permissions";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { MutedBadge } from "@/components/ui/severity-badge";
import { PageHeader } from "@/components/ui/page-header";
import { MemberRowActions } from "@/components/team/member-row-actions";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { requirePermission } from "@/server/auth/context";

/**
 * TEAM — §6.2, Phase 1 task 1.9.
 *
 * ⚠️ MEMBERSHIP IS CLERK'S; ROLE IS OURS. Inviting and removing people from the
 * organization happens in Clerk (and arrives here through the webhook); the
 * five-role matrix has no Clerk equivalent, so it is set here. Building a
 * second invitation flow beside Clerk's would give two places where a person
 * can be added and one of them would drift.
 */
export default async function TeamPage() {
  const ctx = await requirePermission("team:read");
  const repos = repositoriesFor(ctx.agencyId);

  const now = new Date();
  const members = await repos.team.list();

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
            role={member.role}
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
      />

      <Card>
        <DataList caption={t("team.title")} columns={columns} rows={rows} />
      </Card>

      {/*
        Stated plainly rather than left as an absent feature: a Team page with
        no invite button reads as broken until you know where invitations live.
      */}
      <Card className="p-4">
        <h2 className="text-h4">{t("team.inviteTitle")}</h2>
        <p className="mt-1 text-small text-muted-foreground">{t("team.inviteBody")}</p>
      </Card>
    </div>
  );
}
