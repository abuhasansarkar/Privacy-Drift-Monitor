import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { AuthorizationError } from "@pdm/shared/errors";
import { AdminShell } from "@/components/admin/admin-shell";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { requireSuperAdmin } from "@/server/admin/context";

/**
 * `(admin)` LAYOUT — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ ITS OWN ROUTE GROUP, like the other four (§3.1): "so an unauthenticated
 * page can never accidentally inherit an authenticated shell". Here the concern
 * is the reverse as well — the admin surface must never inherit the customer
 * chrome, because an operator who cannot tell the two apart at a glance will
 * eventually act on the wrong one.
 *
 * ⚠️ THIS GATE IS THE FIRST OF THREE, NOT THE ONLY ONE. Every page under it
 * calls `requireSuperAdmin()` and so does every route handler; `cache()` makes
 * the repetition one query. Feature doc 19: gating only in the layout is "a
 * classic hole" — a Server Action POSTs to its own route and a handler is
 * reachable by URL with no layout in the picture.
 *
 * ⚠️ A REFUSAL RENDERS, IT DOES NOT REDIRECT. Bouncing a non-admin to `/app`
 * would tell them the page exists and that they are merely the wrong person;
 * a flat "not available" says as little as possible about what is here.
 */
export const metadata: Metadata = {
  title: t("admin.title"),
  // Nothing under /admin is ever indexed. The gate makes it unreachable, but a
  // crawler following a leaked link should not record that the path responds.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let admin;
  try {
    admin = await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) return <NotAvailable />;
    throw error;
  }

  return <AdminShell adminName={admin.email}>{children}</AdminShell>;
}

function NotAvailable() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <div className="flex max-w-sm gap-3 rounded-lg border border-border bg-card p-5">
        <AlertTriangleIcon className="mt-0.5 shrink-0 text-muted-foreground" />
        <div>
          <h1 className="text-h4">{t("admin.forbiddenTitle")}</h1>
          <p className="mt-1 text-small text-muted-foreground">
            {t("admin.forbiddenBody")}
          </p>
        </div>
      </div>
    </div>
  );
}
