import { t } from "@pdm/shared/copy";
import { AdminPage, AdminPill, AdminTable } from "@/components/admin/admin-ui";
import { formatDate } from "@/lib/format";
import { requireSuperAdmin } from "@/server/admin/context";
import { listAdminUsers } from "@/server/admin/queries";

/**
 * `/admin/users` — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE CLERK LINK IS THE POINT OF THE `clerkUserId` COLUMN. Disabling a
 * user, resetting their MFA or checking their sign-in history all happen in
 * Clerk — rebuilding those here would mean a second, weaker copy of an identity
 * system. What this page owns is the mapping: which agencies does this person
 * belong to, and with what role.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireSuperAdmin();
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const users = await listAdminUsers(search);

  return (
    <AdminPage
      title={t("admin.navUsers")}
      action={
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={search}
            placeholder={t("admin.searchPlaceholder")}
            aria-label={t("admin.searchPlaceholder")}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-small"
          />
        </form>
      }
    >
      <AdminTable
        columns={["Email", "Name", "Agencies", "Clerk id", "Joined"]}
        empty={users.length === 0}
      >
        {users.map((user) => (
          <tr key={user.id}>
            <td className="px-3 py-2">
              {user.email}
              {user.isSuperAdmin ? (
                <AdminPill tone="bad">
                  <span className="ml-1">{t("admin.chip")}</span>
                </AdminPill>
              ) : null}
            </td>
            <td className="px-3 py-2">
              {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
            </td>
            <td className="px-3 py-2">
              {user.memberships.length === 0
                ? "—"
                : user.memberships
                    .map((m) => `${m.agency.name} (${m.role})`)
                    .join(", ")}
            </td>
            <td className="px-3 py-2 font-mono text-mono text-muted-foreground">
              {user.clerkUserId}
            </td>
            <td className="px-3 py-2">{formatDate(user.createdAt, "UTC")}</td>
          </tr>
        ))}
      </AdminTable>
    </AdminPage>
  );
}
