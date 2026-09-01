import type { Metadata } from "next";
import { t } from "@pdm/shared/copy";
import { FreeScanResult } from "@/components/free-scanner/result-view";

/**
 * `/free-scanner/[token]` — PLAN.md §3.2, Phase 6 task 6.5.
 *
 * ⚠️ `noindex`, AND §3.2 SAYS SO EXPLICITLY. The URL contains a 32-byte token
 * and the page contains findings about somebody else's website. Letting a
 * crawler index it would publish both — the token forever, and an unreviewed
 * technical claim about a third party under our domain.
 *
 * ⚠️ THE PAGE ITSELF FETCHES NOTHING. It renders a client component that polls
 * `GET /api/public/free-scan/[token]`, because the scan may still be queued
 * when the submitter arrives — they are redirected here the moment it is
 * accepted. A server-rendered read would show an empty result and never update.
 */
export const metadata: Metadata = {
  title: t("freeScanner.resultTitle"),
  robots: { index: false, follow: false },
};

export default async function FreeScanResultPage({
  params,
}: PageProps<"/free-scanner/[token]">) {
  // `params` is a Promise in Next 16 (AGENTS.md).
  const { token } = await params;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16">
      <FreeScanResult token={token} />
    </section>
  );
}
