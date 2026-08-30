import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { DataList, type Column, type Row } from "@/components/ui/data-list";
import { EmptyState } from "@/components/ui/empty-state";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { ScanContextNote } from "@/components/websites/scan-context-note";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { CONSENT_PHASE_LABEL } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getCookiesTab } from "@/server/queries/website-tabs";

/**
 * COOKIES TAB — UI_DESIGN_PROMPTS §5.8, Phase 3 task 3.10.
 *
 * ⚠️ THE PHASE TOGGLE IS THE POINT OF THE SCREEN. §5.8 puts four segments with
 * live counts across the top, and the reason is that the interesting fact is
 * never one list — it is the DIFFERENCE: 7 cookies before consent, 7 after
 * Reject All, 34 after Accept. Those three numbers together say whether the
 * consent control does anything, and no single table says that.
 *
 * ⚠️ The selected phase lives in the URL, so a specific comparison is a link.
 */
const PHASES = ["NO_CONSENT", "REJECT_ALL", "ACCEPT_ALL", "WITHDRAW"] as const;

export default async function CookiesTabPage({
  params,
  searchParams,
}: PageProps<"/app/websites/[websiteId]/cookies">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);

  const raw = await searchParams;
  const requested = Array.isArray(raw.phase) ? raw.phase[0] : raw.phase;
  const phase = PHASES.includes(requested as never)
    ? (requested as (typeof PHASES)[number])
    : "NO_CONSENT";

  const { scan, cookies, counts } = await getCookiesTab(ctx, websiteId, phase);

  if (!scan) {
    return (
      <Card>
        <EmptyState title={t("websiteTabs.cookies")} body={t("empty.noScansYet")} />
      </Card>
    );
  }

  const columns: Column[] = [
    { key: "name", label: t("cookies.columnName") },
    { key: "party", label: t("cookies.columnParty") },
    { key: "expiry", label: t("cookies.columnExpiry"), hideBelow: "lg" },
    { key: "flags", label: t("cookies.columnFlags"), hideBelow: "xl" },
  ];

  const rows: Row[] = cookies.map((cookie) => ({
    id: cookie.id,
    primary: <span className="font-mono text-mono">{cookie.name}</span>,
    secondary: cookie.domain,
    /*
     * ⚠️ Highlighted, NOT judged. §5.8 tints non-essential cookies present
     * after Reject All — a fact worth drawing the eye to. The tint says "look
     * here", never "this is wrong": whether it warrants action is the rule
     * engine's output, shown as an issue, not a colour on a table.
     */
    tone:
      phase === "REJECT_ALL" && cookie.valueRaw === null ? "warning" : undefined,
    cells: {
      party: cookie.isThirdParty ? (
        <StatusBadge tone="warning" label={t("cookies.thirdParty")} />
      ) : (
        <MutedBadge>{t("cookies.firstParty")}</MutedBadge>
      ),
      expiry: (
        <span className="text-muted-foreground">
          {cookie.isSession
            ? t("cookies.session")
            : `${formatNumber(cookie.durationDays ?? 0)} ${t("cookies.days")}`}
        </span>
      ),
      flags: (
        <span className="flex flex-wrap gap-1.5 text-caption text-muted-foreground">
          {cookie.secure ? <MutedBadge>Secure</MutedBadge> : null}
          {cookie.httpOnly ? <MutedBadge>HttpOnly</MutedBadge> : null}
          {cookie.sameSite ? <MutedBadge>{cookie.sameSite}</MutedBadge> : null}
        </span>
      ),
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <ScanContextNote scan={scan} timezone={ctx.timezone} websiteId={websiteId} />

      {/* The four-segment comparison bar (§5.8). Counts come from the scan. */}
      <nav
        aria-label={t("cookies.compareLabel")}
        className="-mx-1 overflow-x-auto px-1"
      >
        <ul className="flex min-w-max gap-2">
          {PHASES.map((candidate) => (
            <li key={candidate}>
              <Link
                href={`/app/websites/${websiteId}/cookies?phase=${candidate}`}
                aria-current={candidate === phase ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-small transition-colors",
                  candidate === phase
                    ? "border-primary bg-primary/5 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {CONSENT_PHASE_LABEL[candidate]}
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber(counts[candidate] ?? 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={t("websiteTabs.cookies")}
            body={t("empty.noCookiesInPhase")}
          />
        ) : (
          <DataList
            caption={t("websiteTabs.cookies")}
            columns={columns}
            rows={rows}
          />
        )}
      </Card>
    </div>
  );
}
