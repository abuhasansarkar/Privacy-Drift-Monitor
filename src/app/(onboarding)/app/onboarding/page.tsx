import { CreateOrganization } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { repositoriesFor } from "@pdm/database/repositories";
import { t } from "@pdm/shared/copy";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckIcon, PlusIcon, ShieldIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/labels";
import type { AgencyRole } from "@pdm/shared/permissions";
import { tryGetAgencyContext } from "@/server/auth/context";

/**
 * ONBOARDING — §3.3, Phase 1 task 1.4.
 *
 * ⚠️ IT LIVES IN ITS OWN ROUTE GROUP ON PURPOSE. `(app)/app/layout.tsx` throws
 * NO_AGENCY and redirects here; if this page sat under that layout the redirect
 * would land on itself and loop forever.
 *
 * ⚠️ THE STEPS ARE DERIVED FROM STATE, NOT STORED AS PROGRESS. There is no
 * `onboardingStep` column, and there should not be: a stored counter drifts
 * from reality the moment someone adds a website from another tab, and then
 * shows a "create your agency" step to an agency that exists. Each step below
 * asks the database whether it is done.
 *
 * ⚠️ It is a CHECKLIST, not a blocking modal. An agency that wants to look
 * around before adding a site can — the app works with zero websites, and
 * trapping them behind a wizard to reach an empty dashboard helps nobody.
 */
export const metadata: Metadata = { title: t("onboarding.title") };

export default async function OnboardingPage() {
  const ctx = await tryGetAgencyContext();

  // Step 1 — no agency yet. Creating the organization fires
  // `organization.created`, which the webhook turns into the Agency row and the
  // OWNER membership.
  if (!ctx) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    const userEmail =
      user?.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress;

    let pendingInvite = null;
    if (userEmail) {
      const { unsafeGlobalClient } = await import("@pdm/database");
      const db = unsafeGlobalClient("onboarding checks pending invites for user");
      pendingInvite = await db.invitation.findFirst({
        where: {
          email: userEmail.toLowerCase(),
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { agency: true },
      });
    }

    if (pendingInvite) {
      const rawToken = pendingInvite.token.includes(":::")
        ? pendingInvite.token.split(":::")[0]!
        : pendingInvite.token;

      return (
        <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
          <div className="w-full max-w-md">
            <Card className="flex flex-col items-center p-6 text-center shadow-lg">
              <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <ShieldIcon />
              </div>
              <h1 className="text-h3">Pending Team Invitation</h1>
              <p className="mt-2 text-small text-muted-foreground">
                You have been invited to join <strong>{pendingInvite.agency.name}</strong> as a{" "}
                <strong className="text-foreground">{ROLE_LABEL[pendingInvite.role as AgencyRole]}</strong>.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                <ButtonLink
                  href={`/invite/${rawToken}`}
                  variant="primary"
                  size="md"
                  className="w-full justify-center"
                >
                  Accept & Join {pendingInvite.agency.name}
                </ButtonLink>
              </div>
            </Card>
          </div>
        </main>
      );
    }

    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
        <div className="max-w-md text-center">
          <h1 className="text-h1">{t("onboarding.title")}</h1>
          <p className="mt-2 text-body-lg text-muted-foreground">
            {t("onboarding.body")}
          </p>
        </div>
        <CreateOrganization afterCreateOrganizationUrl="/app/onboarding" skipInvitationScreen />
      </main>
    );
  }

  const repos = repositoriesFor(ctx.agencyId);
  const [websiteCount, clientCount, scanCount] = await Promise.all([
    repos.websites.countActive(),
    repos.clients.countActive(),
    repos.db.scan.count(),
  ]);

  // Invited team members bypass onboarding and go straight to dashboard.
  // Owners complete the initial checklist until their first website & scan are active.
  if (ctx.role !== "OWNER" || (websiteCount > 0 && scanCount > 0)) redirect("/app");

  const steps = [
    {
      id: "agency",
      title: t("onboarding.stepAgency"),
      body: ctx.agencyName,
      done: true,
      action: null,
    },
    {
      id: "client",
      title: t("onboarding.stepClient"),
      body: t("onboarding.stepClientBody"),
      done: clientCount > 0,
      action: (
        <ButtonLink href="/app/clients/new" variant="secondary" size="sm">
          {t("clients.addClient")}
        </ButtonLink>
      ),
    },
    {
      id: "website",
      title: t("onboarding.stepWebsite"),
      body: t("onboarding.stepWebsiteBody"),
      done: websiteCount > 0,
      action: (
        <ButtonLink href="/app/websites/new" variant="primary" size="sm">
          <PlusIcon />
          {t("websites.addWebsite")}
        </ButtonLink>
      ),
    },
    {
      id: "scan",
      title: t("onboarding.stepScan"),
      // Deliberately not an action: the first scan is triggered by adding the
      // website, and a "run scan" button here would imply it needs a nudge.
      body: t("onboarding.stepScanBody"),
      done: scanCount > 0,
      action: null,
    },
  ];

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-h1">{t("onboarding.welcome")}</h1>
        <p className="mt-2 text-body-lg text-muted-foreground">
          {t("onboarding.checklistBody")}
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.id}>
            <Card
              className={cn(
                "flex flex-wrap items-center gap-4 p-4",
                step.done && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-caption font-semibold",
                  step.done
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {step.done ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold">{step.title}</span>
                <span className="block text-small text-muted-foreground">
                  {step.body}
                </span>
              </span>

              {/* A completed step keeps no action — the row is a receipt. */}
              {step.done ? null : step.action}
            </Card>
          </li>
        ))}
      </ol>

      <Link
        href="/app"
        className="text-small text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("onboarding.skip")} →
      </Link>
    </main>
  );
}
