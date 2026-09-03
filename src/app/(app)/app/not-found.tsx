import { t } from "@pdm/shared/copy";
import { ButtonLink } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";

/**
 * 404 NOT FOUND for `/app` — §11.8.
 *
 * Renders inside the AppShell when a website, issue, report or client
 * is not found or is out of scope for the current tenant.
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60svh] items-center justify-center px-4">
      <div className="flex max-w-md gap-3 rounded-lg border border-border bg-card p-5">
        <AlertTriangleIcon className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0">
          <h1 className="text-h4">{t("error.notFound")}</h1>
          <p className="mt-1 text-small text-muted-foreground">
            The resource you are looking for does not exist or has been moved.
          </p>
          <ButtonLink href="/app" variant="secondary" size="sm" className="mt-3">
            {t("navApp.dashboard")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
