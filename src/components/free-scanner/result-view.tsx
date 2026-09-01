"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t } from "@pdm/shared/copy";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthScore } from "@/components/ui/health-score";
import { StatTile } from "@/components/ui/stat-tile";
import { SeverityBadge } from "@/components/ui/severity-badge";
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  XIcon,
} from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";
import { trackClient } from "@/lib/analytics-client";

/**
 * THE FREE RESULT — PLAN.md §3.2's result-page specification, Phase 6 task 6.5.
 *
 * ⚠️ IT POLLS RATHER THAN STREAMS. A free scan takes up to 45 seconds and the
 * submitter is a stranger who may close the tab; a websocket per anonymous
 * visitor is a connection we hold open for people who are mostly not going to
 * buy. A three-second poll against one indexed row is the cheap correct answer.
 *
 * ⚠️ EVERY NUMBER HERE IS A COUNT AND EVERY TRACKER IS A NAME. Feature doc 18:
 * "Domain + tracker name only; no full URLs, no cookie values." The server-side
 * `FreeScanSummary` type has no field for anything more, so this component
 * cannot leak what it never receives — the boundary is the type, not the JSX.
 *
 * ⚠️ A PARTIAL SCAN SAYS SO, LOUDLY AND FIRST (P5). An incomplete free scan
 * that renders as a tidy result is the same defect as a paid one that does, and
 * it is worse here: it is the first impression.
 */

const ERROR_COPY: Record<string, string> = {
  DNS_FAILURE: t("freeScanner.errorUnreachable"),
  CONNECTION_REFUSED: t("freeScanner.errorUnreachable"),
  NAVIGATION_FAILED: t("freeScanner.errorUnreachable"),
  SCAN_TIMEOUT: t("freeScanner.errorTimeout"),
  TIMEOUT: t("freeScanner.errorTimeout"),
  BOT_CHALLENGE: t("freeScanner.errorBotChallenge"),
  SSRF_BLOCKED: t("freeScanner.errorBlockedAddress"),
  ROBOTS_DISALLOWED: t("freeScanner.errorDomainBlocked"),
};

interface Summary {
  cmpDetected: boolean;
  cmpName: string | null;
  trackersBeforeConsent: number;
  topTrackers: string[];
  cookiesBeforeConsent: number;
  thirdPartyDomains: number;
  findingCount: number;
  topFindings: Array<{ severity: string; title: string }>;
  partial: boolean;
}

interface Payload {
  url: string;
  status: string;
  healthScore: number | null;
  summary: Summary | null;
  errorCode: string | null;
}

const POLL_MS = 3_000;

export function FreeScanResult({ token }: { token: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const response = await fetch(`/api/public/free-scan/${token}`).catch(() => null);
      if (cancelled) return true;
      if (response?.status === 404) {
        setNotFound(true);
        return true;
      }
      if (!response?.ok) return false;

      const data = (await response.json()) as Payload;
      setPayload(data);
      // Stop as soon as the row reaches a terminal state.
      return data.status !== "QUEUED" && data.status !== "RUNNING";
    }

    void poll().then((done) => {
      if (done || cancelled) return;
      const timer = setInterval(async () => {
        if (await poll()) clearInterval(timer);
      }, POLL_MS);
      // The cleanup below runs on unmount; clearing here covers the race where
      // the component unmounts between the first poll and the interval start.
      if (cancelled) clearInterval(timer);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (notFound) {
    return <Notice tone="warning" title={t("freeScanner.errorNotFound")} />;
  }

  if (!payload || payload.status === "QUEUED" || payload.status === "RUNNING") {
    return <Running status={payload?.status ?? "QUEUED"} />;
  }

  if (payload.status === "FAILED" || !payload.summary) {
    return (
      <div className="flex flex-col gap-4">
        <Notice
          tone="warning"
          title={
            (payload.errorCode ? ERROR_COPY[payload.errorCode] : undefined) ??
            t("freeScanner.errorGeneric")
          }
        />
        <Link href="/free-scanner" className={buttonClasses("secondary", "md", "self-start")}>
          {t("freeScanner.tryAgain")}
        </Link>
      </div>
    );
  }

  const summary = payload.summary;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-caption text-muted-foreground">{t("freeScanner.resultFor")}</p>
        <h1 className="text-h1 break-words tracking-tight">{payload.url}</h1>
      </div>

      {summary.partial ? (
        <Notice tone="warning" title={t("freeScanner.partialNotice")} />
      ) : null}

      <Card className="flex flex-wrap items-center gap-6 p-5">
        {/* `showBand` spells the number out in words — there is room here, and
            this is the one place in the product where the reader has never
            seen our score before and has no idea whether 72 is good. */}
        <HealthScore score={payload.healthScore} showBand />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-small font-medium">{t("freeScanner.resultTitle")}</p>
          <p className="flex items-center gap-1.5 text-small text-muted-foreground">
            {summary.cmpDetected ? (
              <CheckIcon className="text-success" />
            ) : (
              <XIcon className="text-warning" />
            )}
            {summary.cmpDetected
              ? `${t("freeScanner.bannerDetected")}${summary.cmpName ? ` — ${summary.cmpName}` : ""}`
              : t("freeScanner.bannerNotDetected")}
          </p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t("freeScanner.trackersBefore")}
          value={formatNumber(summary.trackersBeforeConsent)}
          note={summary.topTrackers.join(" · ") || undefined}
        />
        <StatTile
          label={t("freeScanner.cookiesBefore")}
          value={formatNumber(summary.cookiesBeforeConsent)}
        />
        <StatTile
          label={t("freeScanner.thirdPartyDomains")}
          value={formatNumber(summary.thirdPartyDomains)}
        />
      </div>

      {summary.findingCount > 0 ? (
        <Card className="p-4">
          <p className="text-small font-medium">
            {formatNumber(summary.findingCount)} {t("freeScanner.findingsFound")}
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.topFindings.map((finding) => (
              <li key={finding.title} className="flex items-start gap-2 text-small">
                <SeverityBadge severity={finding.severity as never} />
                <span>{finding.title}</span>
              </li>
            ))}
          </ul>
          {summary.findingCount > summary.topFindings.length ? (
            <p className="mt-3 text-caption text-muted-foreground">
              {t("freeScanner.findingsShownNote")}
            </p>
          ) : null}
        </Card>
      ) : null}

      {/*
        ⚠️ THE LOCKED PANEL LISTS WHAT IS MISSING, IN WORDS, RATHER THAN BLURRING
        FAKE CONTENT. §3.2 calls it "a blurred 'locked' panel"; blurring
        invented findings would be a fabricated claim about somebody's website,
        which P1 and §1.12 both forbid. Naming the four things a free scan
        cannot do is more honest and a better argument.
      */}
      <Card className="p-5">
        <p className="flex items-center gap-2 text-small font-medium">
          <ShieldIcon className="text-primary" />
          {t("freeScanner.lockedTitle")}
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-small text-muted-foreground">
          {[
            t("freeScanner.lockedReject"),
            t("freeScanner.lockedWithdraw"),
            t("freeScanner.lockedDrift"),
            t("freeScanner.lockedAlerts"),
            t("freeScanner.lockedReports"),
            t("freeScanner.lockedEvidence"),
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 shrink-0 text-primary" />
              {line}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col items-start gap-1.5">
          {/*
            §3.2: the CTA "pre-fills the URL into signup". `free_scan_token` is
            carried as a query parameter and read by the onboarding wizard.
          */}
          <Link
            href={`/signup?free_scan_token=${encodeURIComponent(token)}`}
            // §3.2's funnel ends here: submitted → completed → result_viewed →
            // signup_clicked → signup_completed, attributed by the token.
            onClick={() => trackClient("free_scan_signup_clicked")}
            className={buttonClasses("primary", "md")}
          >
            {t("freeScanner.cta")}
          </Link>
          <p className="text-caption text-muted-foreground">{t("freeScanner.ctaNote")}</p>
        </div>
      </Card>

      <p className="text-caption text-muted-foreground">{t("freeScanner.expiresNote")}</p>
    </div>
  );
}

function Running({ status }: { status: string }) {
  const stages = [
    { key: "QUEUED", label: t("freeScanner.stageQueued") },
    { key: "RUNNING", label: t("freeScanner.stageRunning") },
  ];
  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 text-small font-medium">
        <ClockIcon className="text-info" />
        {t("freeScanner.runningTitle")}
      </p>
      <ul className="flex flex-col gap-1.5 text-small text-muted-foreground">
        {stages.map((stage) => (
          <li key={stage.key} className="flex items-center gap-2">
            {status === stage.key ? (
              <ClockIcon className="text-info" />
            ) : (
              <CheckIcon className="text-success" />
            )}
            {stage.label}
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted-foreground">{t("freeScanner.runningBody")}</p>
    </Card>
  );
}

function Notice({ tone, title }: { tone: "warning"; title: string }) {
  return (
    <Card className={`flex items-start gap-2.5 border-warning/40 bg-warning-muted p-4`}>
      <AlertTriangleIcon className="mt-0.5 text-warning" />
      <p className="text-small">{title}</p>
      <span className="sr-only">{tone}</span>
    </Card>
  );
}
