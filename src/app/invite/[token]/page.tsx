import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { unsafeGlobalClient } from "@pdm/database";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircleIcon, ShieldIcon } from "@/components/ui/icons";
import { ROLE_LABEL } from "@/lib/labels";
import { AcceptInvitationCard } from "@/components/team/accept-invitation-card";
import type { AgencyRole } from "@pdm/shared/permissions";

export const metadata: Metadata = {
  title: "Team Invitation — Privacy Drift Monitor",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = unsafeGlobalClient("invite page resolves invitation token");

  const invitation = await db.invitation.findFirst({
    where: {
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      OR: [
        { token },
        { token: { startsWith: `${token}:::` } },
      ],
    },
    include: {
      agency: true,
      invitedBy: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  if (!invitation) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-canvas p-4">
        <Card className="flex w-full max-w-md flex-col items-center p-6 text-center shadow-lg">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
            <AlertCircleIcon />
          </div>
          <h1 className="text-h3">Invitation Invalid or Expired</h1>
          <p className="mt-2 text-small text-muted-foreground">
            This invitation link is invalid, has expired, or has already been accepted.
            Please ask your agency administrator to resend the invitation.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <ButtonLink href="/login" variant="primary" size="md" className="w-full justify-center">
              Sign In
            </ButtonLink>
            <ButtonLink href="/" variant="ghost" size="md" className="w-full justify-center">
              Back to Home
            </ButtonLink>
          </div>
        </Card>
      </main>
    );
  }

  const { userId } = await auth();
  const inviterName =
    [invitation.invitedBy.firstName, invitation.invitedBy.lastName].filter(Boolean).join(" ") ||
    invitation.invitedBy.email;

  if (userId) {
    const user = await currentUser();
    const userEmail =
      user?.emailAddresses.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ??
      user?.emailAddresses[0]?.emailAddress ??
      "your account";

    return (
      <main className="flex min-h-svh flex-col items-center justify-center bg-canvas p-4">
        <AcceptInvitationCard
          token={token}
          agencyName={invitation.agency.name}
          role={invitation.role as AgencyRole}
          inviterName={inviterName}
          userEmail={userEmail}
        />
      </main>
    );
  }

  const returnUrl = `/invite/${token}`;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-canvas p-4">
      <Card className="flex w-full max-w-md flex-col items-center p-6 text-center shadow-lg">
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldIcon />
        </div>

        <h1 className="text-h3">You&apos;re Invited</h1>
        <p className="mt-2 text-small text-muted-foreground">
          <strong>{inviterName}</strong> has invited you to join{" "}
          <strong>{invitation.agency.name}</strong> as{" "}
          <strong className="text-foreground">{ROLE_LABEL[invitation.role as AgencyRole]}</strong>.
        </p>

        <div className="my-5 flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-small">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Agency</span>
            <span className="font-medium text-foreground">{invitation.agency.name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Designated Role</span>
            <span className="font-semibold text-foreground">
              {ROLE_LABEL[invitation.role as AgencyRole]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sent To</span>
            <span className="font-mono text-caption text-foreground">{invitation.email}</span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <ButtonLink
            href={`/signup?redirect_url=${encodeURIComponent(returnUrl)}`}
            variant="primary"
            size="md"
            className="w-full justify-center"
          >
            Create Account & Accept
          </ButtonLink>

          <ButtonLink
            href={`/login?redirect_url=${encodeURIComponent(returnUrl)}`}
            variant="secondary"
            size="md"
            className="w-full justify-center"
          >
            Sign In with Existing Account
          </ButtonLink>
        </div>
      </Card>
    </main>
  );
}
