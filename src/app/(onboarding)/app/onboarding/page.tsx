import { CreateOrganization } from "@clerk/nextjs";
import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";

/**
 * ONBOARDING — the redirect target for `NO_AGENCY` (§3.3).
 *
 * ⚠️ IT LIVES IN ITS OWN ROUTE GROUP ON PURPOSE. `(app)/app/layout.tsx` throws
 * NO_AGENCY and redirects here; if this page sat under that layout the redirect
 * would land on itself and loop forever. Two groups can both serve `/app/*` as
 * long as no two files resolve to the same path, and nothing else defines
 * `/app/onboarding`.
 *
 * ⚠️ SCOPE: this is the redirect target and the Clerk organization step only.
 * The full six-step onboarding wizard is Phase 1 task 1.4 and is not built.
 * Creating the organization fires `organization.created`, which the Clerk
 * webhook turns into the `Agency` row and the OWNER membership.
 */
export const metadata: Metadata = { title: t("onboarding.title") };

export default function OnboardingPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-h1">{t("onboarding.title")}</h1>
        <p className="mt-2 text-body-lg text-muted-foreground">
          {t("onboarding.body")}
        </p>
      </div>
      <CreateOrganization
        afterCreateOrganizationUrl="/app"
        skipInvitationScreen
      />
    </main>
  );
}
