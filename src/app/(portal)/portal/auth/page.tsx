import { redirect } from "next/navigation";
import { t } from "@pdm/shared/copy";
import {
  consumeMagicLink,
  requestFingerprint,
  setPortalCookie,
} from "@/server/portal/session";

/**
 * MAGIC-LINK CALLBACK — §6.10.
 *
 * ⚠️ THE LINK IS CONSUMED HERE, ONCE. `consumeMagicLink` clears the token in
 * the same transaction that creates the session, so a forwarded email cannot be
 * replayed — including by a corporate mail scanner that pre-fetches URLs, which
 * is the common way single-use links get burnt before the human clicks.
 *
 * ⚠️ EXPIRED, USED, REVOKED AND UNKNOWN ALL RENDER THE SAME MESSAGE. Telling
 * them apart would confirm which addresses once had access.
 */
export default async function PortalAuthPage({
  searchParams,
}: PageProps<"/portal/auth">) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (!token) return <LinkUnavailable />;

  const fingerprint = await requestFingerprint();

  try {
    const { sessionToken, expiresAt } = await consumeMagicLink(token, fingerprint);
    await setPortalCookie(sessionToken, expiresAt);
  } catch {
    return <LinkUnavailable />;
  }

  // `redirect` throws, so it is outside the try — a redirect raised inside
  // would be swallowed by the catch above and the user would sit on a blank
  // page having actually signed in.
  redirect("/portal");
}

function LinkUnavailable() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-3 px-5 text-center text-[16px]">
      <h1 className="text-[24px] font-semibold">{t("portal.linkInvalid")}</h1>
      <a
        href="/portal/login"
        className="inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-[15px]"
      >
        {t("portal.sendLink")}
      </a>
    </main>
  );
}
