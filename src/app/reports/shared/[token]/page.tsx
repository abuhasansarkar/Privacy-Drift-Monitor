import { createHash } from "node:crypto";
import { unsafeGlobalClient } from "@pdm/database";
import { fromBrandingSnapshot, resolveBranding } from "@pdm/reports/branding";
import { defaultBranding } from "@pdm/shared/branding";
import { t } from "@pdm/shared/copy";
import { objectStore } from "@pdm/storage";

/**
 * SHARED REPORT LINK — §3.11, §6.8.
 *
 * ⚠️ UNAUTHENTICATED BY DESIGN, AND THEREFORE THE NARROWEST SURFACE IN THE
 * PRODUCT. It resolves exactly one thing: a token hash → one report's PDF. It
 * has no list, no navigation, no search, and it never renders anything from the
 * owning agency beyond the report's own name and branding.
 *
 * ⚠️ THE TOKEN IS LOOKED UP BY SHA-256 HASH. Only the hash is stored, so a
 * database read cannot hand anyone a working URL.
 *
 * ⚠️ EXPIRED, REVOKED AND UNKNOWN ALL RENDER THE SAME PAGE. Distinguishing them
 * would tell someone probing tokens which ones once existed.
 *
 * ⚠️ IT LIVES OUTSIDE EVERY ROUTE GROUP with an auth layout — `/reports/shared`,
 * not `/app/...` — so no Clerk helper and no `requireAgencyContext` is anywhere
 * in its tree.
 */

const db = unsafeGlobalClient(
  // Justification (required in review): a share link arrives with no session
  // and no tenant. The token hash IS the authorisation, and the agency is
  // DERIVED from the row it matches — never taken from the request.
  "share links resolve a tenant from the token, not from a session",
);

export default async function SharedReportPage({
  params,
}: PageProps<"/reports/shared/[token]">) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const share = await db.reportShare.findFirst({
    where: { token: tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: {
      report: {
        select: {
          id: true,
          agencyId: true,
          name: true,
          status: true,
          s3Key: true,
          brandingSnapshot: true,
          periodStart: true,
          periodEnd: true,
        },
      },
    },
  });

  if (!share || share.report.status !== "READY" || !share.report.s3Key) {
    return <SharedLinkUnavailable />;
  }

  /*
   * ⚠️ BRANDING COMES FROM THE SNAPSHOT FIRST (§6.8). The recipient must see
   * the document as it was sent; resolving live would silently restyle a report
   * the agency has already emailed. The resolver is the fallback for rows
   * written before snapshotting, and it is still keyed only by `agencyId`.
   */
  const branding =
    fromBrandingSnapshot(
      share.report.brandingSnapshot,
      await resolveBranding(share.report.agencyId),
    ) ?? defaultBranding(share.report.agencyId, "");

  const url = await objectStore().signedUrl(share.report.s3Key, 300);

  await db.reportShare.update({
    where: { id: share.id },
    data: { accessCount: { increment: 1 } },
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <header className="flex flex-wrap items-baseline gap-3 border-b border-border pb-4">
        <span
          className="text-h4 font-semibold"
          style={{ color: branding.primaryColor }}
        >
          {branding.companyName}
        </span>
        <span className="text-small text-muted-foreground">{share.report.name}</span>
      </header>

      <iframe
        title={share.report.name}
        src={url}
        className="h-[75vh] w-full rounded-md border border-border bg-[#F8FAFC]"
      />

      <a
        href={url}
        className="inline-flex h-9 w-fit items-center justify-center rounded-md border border-transparent px-3.5 text-small font-medium text-white max-sm:h-11"
        style={{ background: branding.primaryColor }}
      >
        {t("reports.download")}
      </a>
    </main>
  );
}

function SharedLinkUnavailable() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-h3">{t("portal.linkInvalid")}</h1>
      <p className="text-small text-muted-foreground">{t("reports.shareHelp")}</p>
    </main>
  );
}
