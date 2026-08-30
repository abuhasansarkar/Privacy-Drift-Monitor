import { t } from "@pdm/shared/copy";
import { formatNumber } from "@/lib/format";

/**
 * PRIVACY HEALTH SCORE — §11.3 bands, feature 11.
 *
 * ⚠️ `null` means NEVER SCANNED and renders an em dash with a label, never 0.
 * A site with no scan is not a site scoring zero, and showing 0 would drag a
 * client's average down and make the one number they look at actively
 * misleading (the same trap `averageHealth()` guards in the client repository).
 *
 * The band label ships alongside the dot for the same reason as severity: the
 * colour is a second channel, never the only one.
 */

const BANDS = [
  { min: 90, color: "bg-score-excellent", label: t("dashboard.bandExcellent") },
  { min: 75, color: "bg-score-good", label: t("dashboard.bandGood") },
  { min: 50, color: "bg-score-fair", label: t("dashboard.bandFair") },
  { min: 25, color: "bg-score-poor", label: t("dashboard.bandPoor") },
  { min: 0, color: "bg-score-critical", label: t("dashboard.bandCritical") },
] as const;

function bandFor(score: number) {
  return BANDS.find((band) => score >= band.min) ?? BANDS[BANDS.length - 1];
}

export function HealthScore({
  score,
  showBand = false,
}: {
  score: number | null;
  /** Spell the band out in words. Used where there is room (tiles, detail). */
  showBand?: boolean;
}) {
  if (score === null) {
    return (
      <span className="text-small text-muted-foreground">
        — {t("websites.neverScanned")}
      </span>
    );
  }

  const band = bandFor(score);
  return (
    <span className="inline-flex items-center gap-2 font-semibold tabular-nums">
      <span className={`size-2 shrink-0 rounded-full ${band.color}`} />
      {formatNumber(score)}
      {showBand ? (
        <span className="text-caption font-medium text-muted-foreground">
          {band.label}
        </span>
      ) : null}
    </span>
  );
}
