import { t } from "@pdm/shared/copy";
import { PortalLoginForm } from "@/components/portal/login-form";

/**
 * PORTAL SIGN-IN — §6.10.
 *
 * ⚠️ OUTSIDE THE PORTAL LAYOUT'S SESSION GATE, and with no branding: we do not
 * know which agency the visitor belongs to until they identify themselves, and
 * guessing from a query parameter would let anyone enumerate agencies by
 * watching the logo change.
 *
 * ⚠️ THE RESPONSE IS IDENTICAL FOR A KNOWN AND AN UNKNOWN ADDRESS. §6.10: the
 * request endpoint always answers 204, and the copy below says "if that address
 * has access" for exactly that reason.
 */
export default function PortalLoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-5 px-5 py-12 text-[16px]">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight">
          {t("portal.signInTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("portal.signInBody")}</p>
      </div>
      <PortalLoginForm />
    </main>
  );
}
