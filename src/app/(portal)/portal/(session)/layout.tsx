import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveBranding } from "@pdm/reports/branding";
import { t } from "@pdm/shared/copy";
import { PortalSignOut } from "@/components/portal/sign-out";
import { getPortalSession } from "@/server/portal/session";

/**
 * PORTAL SHELL — §3.13, UI_DESIGN_PROMPTS §7.
 *
 * ⚠️ THIS LAYOUT IS INSIDE A `(session)` ROUTE GROUP, and `/portal/login` and
 * `/portal/auth` sit OUTSIDE it. Layouts nest by path in Next, so a gate placed
 * at `portal/layout.tsx` also wrapped the sign-in page — which then redirected
 * to itself, forever. The group keeps the gate on exactly the five signed-in
 * pages without changing a single URL.
 *
 * ⚠️ DELIBERATELY DIFFERENT FROM THE APP: no sidebar, a 960px centred column,
 * 16px body type, generous spacing. §11.1 principle 3 — "density where experts
 * work, spacious where clients look." Persona D is non-technical and visits
 * rarely; the app's information density would read as a wall.
 *
 * ⚠️ BRANDING IS THE OWNING AGENCY'S, RESOLVED BY EXPLICIT `agencyId` FROM THE
 * SESSION (§6.9). Never from a request parameter, never from a cache keyed on
 * anything else.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPortalSession();
  // The sign-in page lives outside this layout, so an absent session here is
  // always a redirect rather than a rendered empty state.
  if (!session) redirect("/portal/login");

  const branding = await resolveBranding(session.agencyId, { whiteLabelEnabled: true });

  return (
    <div className="flex min-h-svh flex-col bg-background text-[16px] leading-relaxed">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[960px] flex-wrap items-center gap-3 px-5 py-4">
          {branding.logoLightUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- an agency logo from their own URL; next/image would proxy a third-party host.
            <img
              src={branding.logoLightUrl}
              alt={branding.companyName}
              className="max-h-8 w-auto"
            />
          ) : (
            <span
              className="text-[18px] font-semibold"
              style={{ color: branding.primaryColor }}
            >
              {branding.companyName}
            </span>
          )}
          <nav aria-label={t("portal.navOverview")} className="ms-auto flex flex-wrap gap-4">
            <PortalLink href="/portal">{t("portal.navOverview")}</PortalLink>
            <PortalLink href="/portal/issues">{t("portal.navIssues")}</PortalLink>
            <PortalLink href="/portal/reports">{t("portal.navReports")}</PortalLink>
            <PortalLink href="/portal/scans">{t("portal.navScans")}</PortalLink>
            <PortalLink href="/portal/settings">{t("portal.navSettings")}</PortalLink>
          </nav>
          <PortalSignOut />
        </div>
        {/* The accent underline from §7.1. */}
        <div className="h-[2px] w-full" style={{ background: branding.accentColor }} />
      </header>

      <main className="mx-auto w-full max-w-[960px] flex-1 px-5 py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-[960px] px-5 py-6 text-[13px] text-muted-foreground">
          {t("portal.poweredBy")} {branding.companyName}
          {branding.contactEmail ? ` · ${branding.contactEmail}` : ""}
        </div>
      </footer>
    </div>
  );
}

function PortalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[15px] text-muted-foreground hover:text-foreground">
      {children}
    </Link>
  );
}
