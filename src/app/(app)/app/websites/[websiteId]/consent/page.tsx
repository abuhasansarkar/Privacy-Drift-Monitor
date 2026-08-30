import Link from "next/link";
import { t } from "@pdm/shared/copy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldIcon } from "@/components/ui/icons";
import { ScanContextNote } from "@/components/websites/scan-context-note";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { CONSENT_PHASE_LABEL } from "@/lib/labels";
import { requireWebsiteAccess } from "@/server/auth/context";
import { getConsentTab } from "@/server/queries/website-tabs";

/**
 * CONSENT TAB — UI_DESIGN_PROMPTS §5.9, Phase 3 task 3.10. ★ signature screen.
 *
 * ⚠️ NO TICKS, NO CROSSES, NO PASS/FAIL — §5.9 states it outright and §11.1
 * makes it a product rule. Each phase reports an OUTCOME WORD from the approved
 * vocabulary: Detected · Expected · Could not be determined. A green tick on
 * "Reject All" would be this product asserting compliance, which is exactly the
 * claim it does not make.
 *
 * ⚠️ "Could not be determined" is a first-class result, rendered with the same
 * weight as the others. It is what an UNDETERMINED phase means, and softening
 * it into "no issues" is the P5 failure.
 */

type Outcome = "detected" | "expected" | "undetermined";

const PHASE_ORDER = ["NO_CONSENT", "REJECT_ALL", "ACCEPT_ALL", "WITHDRAW"] as const;

/** What each journey does, in the reader's terms (§5.9 middle column). */
const WHAT_WE_DID: Record<(typeof PHASE_ORDER)[number], string> = {
  NO_CONSENT: t("consentTab.didNoConsent"),
  REJECT_ALL: t("consentTab.didRejectAll"),
  ACCEPT_ALL: t("consentTab.didAcceptAll"),
  WITHDRAW: t("consentTab.didWithdraw"),
};

const OUTCOME_STYLE: Record<Outcome, { dot: string; border: string; label: string }> = {
  // A filled dot for something we observed…
  detected: {
    dot: "bg-severity-high",
    border: "border-s-severity-high",
    label: t("outcome.detected"),
  },
  // …a hollow ring for behaviour that is expected in this phase…
  expected: {
    dot: "border-2 border-muted-foreground",
    border: "border-s-border",
    label: t("consentTab.expected"),
  },
  // …and a dash for a journey that could not run.
  undetermined: {
    dot: "bg-muted-foreground/40",
    border: "border-s-warning",
    label: t("outcome.undetermined"),
  },
};

export default async function ConsentTabPage({
  params,
}: PageProps<"/app/websites/[websiteId]/consent">) {
  const { websiteId } = await params;
  const ctx = await requireWebsiteAccess(websiteId);
  const { scan, counts } = await getConsentTab(ctx, websiteId);

  if (!scan) {
    return (
      <Card>
        <EmptyState title={t("websiteTabs.consent")} body={t("empty.noScansYet")} />
      </Card>
    );
  }

  const byPhase = new Map(scan.phases.map((phase) => [phase.phase, phase]));

  return (
    <div className="flex flex-col gap-4">
      <ScanContextNote scan={scan} timezone={ctx.timezone} websiteId={websiteId} />

      {/* The CMP report card (§5.9 top). */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <ShieldIcon className="size-5 text-muted-foreground" />
        <span className="text-h4">
          {scan.detectedCmpName ?? t("consentTab.noCmp")}
        </span>
        {scan.detectedCmpVersion ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-caption">
            v{scan.detectedCmpVersion}
          </span>
        ) : null}
        {scan.cmpConfidence !== null ? (
          <span className="ms-auto rounded-full bg-muted px-2.5 py-0.5 text-caption text-muted-foreground">
            {t("consentTab.detectionConfidence")}{" "}
            {Math.round(scan.cmpConfidence * 100)}%
          </span>
        ) : null}
      </Card>

      {PHASE_ORDER.map((name, index) => {
        const phase = byPhase.get(name);
        const requestCount = counts[name] ?? 0;

        /*
         * The outcome, derived — never chosen by the renderer:
         *   phase did not execute      → could not be determined
         *   third parties in a consent-denied phase → detected
         *   anything else              → expected
         */
        const outcome: Outcome =
          !phase || phase.status !== "EXECUTED"
            ? "undetermined"
            : (name === "NO_CONSENT" || name === "REJECT_ALL") && requestCount > 0
              ? "detected"
              : "expected";

        const style = OUTCOME_STYLE[outcome];

        return (
          <Card
            key={name}
            className={cn("grid gap-4 border-s-2 p-4 sm:grid-cols-3", style.border)}
          >
            <div>
              <p className="text-caption text-muted-foreground">
                {index + 1}. {CONSENT_PHASE_LABEL[name]}
              </p>
            </div>

            <p className="text-small text-muted-foreground">{WHAT_WE_DID[name]}</p>

            <div className="flex flex-col gap-1 sm:text-end">
              <p className="text-small font-semibold">
                {outcome === "undetermined"
                  ? (phase?.errorMessage ?? t("consentTab.journeyNotRun"))
                  : `${formatNumber(requestCount)} ${t("consentTab.thirdPartyRequests")}`}
              </p>
              {/* Colour + shape + WORD. Never colour alone (§11.6). */}
              <p className="flex items-center gap-2 text-small sm:justify-end">
                <span className={cn("size-2.5 rounded-full", style.dot)} aria-hidden="true" />
                {style.label}
              </p>
            </div>
          </Card>
        );
      })}

      <Link
        href={`/app/websites/${websiteId}/scans/${scan.id}`}
        className="text-small text-primary underline-offset-2 hover:underline"
      >
        {t("issues.viewScan")} →
      </Link>
    </div>
  );
}
