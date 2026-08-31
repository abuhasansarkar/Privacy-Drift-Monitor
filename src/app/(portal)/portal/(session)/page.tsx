import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { PortalDate, PortalRelative } from "@/components/portal/time";
import { getPortalOverview } from "@/server/portal/serializers";
import { requirePortalSession } from "@/server/portal/session";

/**
 * PORTAL OVERVIEW — §3.13, UI_DESIGN_PROMPTS §7.1.
 *
 * "Calm, reassuring, uncluttered." Persona D is non-technical and visits
 * rarely: a score she can read, whether anything needs her attention, what
 * changed in plain words, and the latest report.
 *
 * ⚠️ NO RULE IDS, NO EVIDENCE, NO TECHNICAL VALUES, NO MONOSPACE — and none of
 * them are merely hidden. The serializer never selects them (§6.10), so there
 * is nothing on this page to leak.
 *
 * ⚠️ NO CROSS-CLIENT COMPARISON (§12.3). The interpretation describes this
 * client's own sites and never ranks them against anyone else's.
 */
export default async function PortalOverviewPage() {
  const session = await requirePortalSession();
  const overview = await getPortalOverview(session);

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-[30px] font-semibold leading-tight">
          {t("portal.overviewTitle")}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-8">
          <ScoreRing score={overview.score} word={overview.scoreWord} />
          <p className="max-w-sm text-muted-foreground">{overview.scoreInterpretation}</p>
        </div>

        <p className="mt-6 flex items-center gap-2 text-[15px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-2 rounded-full bg-success"
          />
          {overview.monitoringLabel}
          {" · "}
          {overview.lastCheckedIso ? (
            <>
              {t("portal.lastChecked")} <PortalRelative iso={overview.lastCheckedIso} />
            </>
          ) : (
            t("portal.neverChecked")
          )}
        </p>
      </section>

      <section>
        <h2 className="text-[20px] font-semibold">{t("portal.itemsTitle")}</h2>
        {overview.items.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t("portal.itemsEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {overview.items.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityWord word={item.severityWord} />
                  <span className="text-[14px] text-muted-foreground">
                    {item.statusWord}
                  </span>
                </div>
                <p className="mt-1.5 font-medium">{item.title}</p>
                <p className="mt-1 text-[15px] text-muted-foreground">
                  {item.explanation}
                </p>
                <p className="mt-2 text-[14px] text-muted-foreground">
                  {t("portal.detectedOn")} <PortalDate iso={item.detectedIso} />
                </p>
              </li>
            ))}
          </ul>
        )}
        {overview.items.length > 5 ? (
          <Link href="/portal/issues" className="mt-3 inline-block text-primary hover:underline">
            {t("portal.issuesTitle")}
          </Link>
        ) : null}
      </section>

      <section>
        <h2 className="text-[20px] font-semibold">{t("portal.changesTitle")}</h2>
        {overview.changes.length === 0 ? (
          <p className="mt-3 text-muted-foreground">{t("portal.changesEmpty")}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {overview.changes.map((change) => (
              <li key={change.id} className="text-[15px]">
                {change.sentence}{" "}
                <span className="text-muted-foreground">
                  — <PortalDate iso={change.detectedIso} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[20px] font-semibold">{t("portal.reportTitle")}</h2>
        {overview.latestReport ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{overview.latestReport.name}</p>
              <p className="text-[14px] text-muted-foreground">
                {overview.latestReport.periodLabel ?? ""}
              </p>
            </div>
            <a
              href={`/api/portal/reports/${overview.latestReport.id}/download`}
              className="inline-flex h-11 items-center justify-center rounded-md border border-transparent bg-primary px-4 text-[15px] font-medium text-primary-foreground hover:opacity-90"
            >
              {t("portal.downloadReport")}
            </a>
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground">{t("portal.reportsEmpty")}</p>
        )}
      </section>
    </div>
  );
}

/**
 * ⚠️ THE WORD IS RENDERED BESIDE THE NUMBER, and the ring is decorative. A
 * gauge alone conveys the state by colour and angle — neither survives
 * greyscale or a screen reader (§11.6).
 */
function ScoreRing({ score, word }: { score: number | null; word: string }) {
  const value = score ?? 0;
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const colour =
    score === null
      ? "var(--color-muted-foreground)"
      : score >= 75
        ? "var(--color-success)"
        : score >= 50
          ? "var(--color-warning)"
          : "var(--color-danger)";

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="size-[140px]" role="img" aria-label={word}>
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="10"
        />
        {score !== null ? (
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform="rotate(-90 70 70)"
          />
        ) : null}
        <text
          x="70"
          y="76"
          textAnchor="middle"
          className="fill-foreground text-[30px] font-semibold"
        >
          {score ?? "—"}
        </text>
      </svg>
      <span className="text-[18px] font-medium">{word}</span>
    </div>
  );
}

/** Plain words with a dot, never the internal severity enum (§3.13). */
function SeverityWord({ word }: { word: string }) {
  const tone =
    word === t("portal.severityNeedsAttention")
      ? "bg-danger"
      : word === t("portal.severityWorthReviewing")
        ? "bg-warning"
        : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-medium">
      <span aria-hidden="true" className={`inline-block size-2 rounded-full ${tone}`} />
      {word}
    </span>
  );
}
