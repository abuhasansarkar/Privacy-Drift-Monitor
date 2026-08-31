import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { MutedBadge } from "@/components/ui/severity-badge";
import { t } from "@pdm/shared/copy";
import { requirePermission } from "@/server/auth/context";

/**
 * SETTINGS → SECURITY — §3.11, Phase 1 task 1.10.
 *
 * §3.11 lists five things here: active sessions, 2FA enforcement, the audit log
 * viewer, API keys (V1.5) and an IP allowlist (V2).
 *
 * ⚠️ SESSIONS AND 2FA ARE **NOT** REIMPLEMENTED HERE, and that is the whole
 * design of this page. Clerk owns authentication (§6.1); rendering our own
 * session list would mean a second, lagging copy of state we do not own, and a
 * "revoke session" button that could silently disagree with the real one. The
 * page says where the real control is instead.
 *
 * ⚠️ THE TWO UNBUILT FEATURES ARE SHOWN AS DISABLED CARDS THAT SAY SO, not as
 * working-looking controls. §11.8: a control that does nothing is a worse lie
 * than a plain statement, and this is the page where a customer is deciding
 * whether to trust us.
 */
export default async function SecuritySettingsPage() {
  await requirePermission("settings:read");

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title={t("security.sessionsTitle")} />
        <div className="flex flex-col gap-3 p-4">
          <p className="text-small text-muted-foreground">{t("security.sessionsBody")}</p>
          <div>
            <p className="text-small font-medium">{t("security.twoFactorTitle")}</p>
            <p className="mt-0.5 text-small text-muted-foreground">
              {t("security.twoFactorBody")}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("security.auditTitle")} />
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-[16rem] flex-1 text-small text-muted-foreground">
            {t("security.auditBody")}
          </p>
          <ButtonLink href="/app/settings/audit" variant="secondary">
            {t("security.openAuditLog")}
          </ButtonLink>
        </div>
      </Card>

      <Placeholder
        title={t("security.apiKeysTitle")}
        body={t("security.apiKeysBody")}
      />
      <Placeholder
        title={t("security.ipAllowlistTitle")}
        body={t("security.ipAllowlistBody")}
      />
    </div>
  );
}

/**
 * A feature that is specified but not built.
 *
 * Deliberately not a disabled form: there is nothing to fill in, and an inert
 * input invites someone to try. A chip plus a sentence is the honest shape.
 */
function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <Card className="opacity-70">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium">{title}</p>
          <p className="mt-0.5 text-small text-muted-foreground">{body}</p>
        </div>
        <MutedBadge>{t("security.notAvailable")}</MutedBadge>
      </div>
    </Card>
  );
}
