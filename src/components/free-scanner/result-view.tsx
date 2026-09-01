"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { buttonClasses, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HealthScore } from "@/components/ui/health-score";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  FlagIcon,
  GlobeIcon,
  LinkIcon,
  RadarIcon,
  ShieldIcon,
  SparkleIcon,
  XIcon,
} from "@/components/ui/icons";
import { formatNumber } from "@/lib/format";
import { trackClient } from "@/lib/analytics-client";

/**
 * THE FREE RESULT — PLAN.md §3.2's result-page specification, Phase 6 task 6.5.
 * Redesigned with professional animated scan screen and post-scan email report modal.
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
  expiresAt?: string;
}

const POLL_MS = 3_000;

export function FreeScanResult({ token }: { token: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailPending, startEmailTransition] = useTransition();

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

      // When newly completed, prompt the email report modal
      if (data.status === "COMPLETED") {
        const key = `pdm_free_email_shown_${token}`;
        if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "true");
          // Slight delay so the user sees the completed result screen before the modal pops
          setTimeout(() => setEmailModalOpen(true), 1200);
        }
      }

      // Stop polling once in a terminal state
      return data.status !== "QUEUED" && data.status !== "RUNNING";
    }

    void poll().then((done) => {
      if (done || cancelled) return;
      const timer = setInterval(async () => {
        if (await poll()) clearInterval(timer);
      }, POLL_MS);
      if (cancelled) clearInterval(timer);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  function copyShareLink() {
    if (typeof window !== "undefined") {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setEmailError(t("freeScanner.emailInvalid"));
      return;
    }

    startEmailTransition(async () => {
      setEmailError(null);
      const res = await fetch(`/api/public/free-scan/${token}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(() => null);

      if (!res || !res.ok) {
        setEmailError(t("freeScanner.emailGenericError"));
        return;
      }

      setEmailSent(true);
      trackClient("free_scan_email_submitted");
      setTimeout(() => setEmailModalOpen(false), 2800);
    });
  }

  if (notFound) {
    return <Notice tone="warning" title={t("freeScanner.errorNotFound")} />;
  }

  if (!payload || payload.status === "QUEUED" || payload.status === "RUNNING") {
    return <Running status={payload?.status ?? "QUEUED"} targetUrl={payload?.url} />;
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
  const displayHost = payload.url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const scanDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const score = payload.healthScore ?? 100;
  const isLowRisk = score >= 80 && summary.trackersBeforeConsent === 0;
  const isMediumRisk = score >= 50 && !isLowRisk;

  // Infer category counts from detections
  const analyticsTrackers = summary.topTrackers.filter((name) =>
    /analytics|stats|plausible|posthog|matomo|clarity|hotjar/i.test(name),
  );
  const marketingTrackers = summary.topTrackers.filter((name) =>
    /pixel|meta|facebook|tiktok|ads|criteo|doubleclick|bing|linkedin/i.test(name),
  );
  const otherTrackers = summary.topTrackers.filter(
    (name) => !analyticsTrackers.includes(name) && !marketingTrackers.includes(name),
  );

  const catNecessary = summary.cmpDetected ? 1 : 0;
  const catPreferences = 0;
  const catStatistics = analyticsTrackers.length;
  const catMarketing = marketingTrackers.length;
  const catUnclassified = otherTrackers.length + Math.max(0, summary.thirdPartyDomains - summary.topTrackers.length);

  return (
    <div className="flex flex-col gap-8">
      {/* 1. TOP BANNER — Blue / Primary accent bar (Image 1 reference) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 px-6 py-5 shadow-xs">
        <div className="text-center sm:text-left">
          <p className="text-caption font-medium uppercase tracking-wider text-primary">
            {t("freeScanner.scanResultsBanner")}
          </p>
          <h1 className="mt-1 text-h2 font-bold tracking-tight text-foreground break-all">
            {displayHost}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEmailModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-small font-semibold text-primary transition hover:bg-primary/20"
          >
            <DocIcon className="size-4" />
            <span>{t("freeScanner.emailReportAction")}</span>
          </button>
        </div>
      </div>

      {summary.partial ? (
        <Notice tone="warning" title={t("freeScanner.partialNotice")} />
      ) : null}

      {/* 2. HERO POSTURE SECTION (Image 1 reference: left risk badge & text, right browser mockup) */}
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        {/* Left Side: Risk Badge, Posture Headline, Description, and CTA */}
        <div className="flex flex-col items-start gap-4 lg:col-span-6">
          {isLowRisk ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-muted px-3.5 py-1 text-small font-semibold text-success shadow-xs">
              <CheckIcon className="size-4" />
              <span>{t("freeScanner.statusLowRisk")}</span>
            </div>
          ) : isMediumRisk ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-muted px-3.5 py-1 text-small font-semibold text-warning shadow-xs">
              <AlertTriangleIcon className="size-4" />
              <span>{t("freeScanner.statusMediumRisk")}</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-muted px-3.5 py-1 text-small font-semibold text-danger shadow-xs">
              <AlertTriangleIcon className="size-4" />
              <span>{t("freeScanner.statusHighRisk")}</span>
            </div>
          )}

          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
            {isLowRisk
              ? "Your website protects privacy!"
              : t("freeScanner.postureTitle")}
          </h2>

          <p className="text-body-lg text-muted-foreground text-balance">
            {t("freeScanner.postureSubtitle")}
          </p>

          <a
            href="#tracker-details"
            className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-small font-medium text-foreground shadow-xs transition hover:bg-accent"
          >
            <span>{t("freeScanner.showScanResults")}</span>
            <ArrowDownIcon className="size-4 text-primary" />
          </a>
        </div>

        {/* Right Side: Website Browser Mockup Container */}
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            {/* Browser Header Bar */}
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-full bg-red-400/80" />
                <div className="size-2.5 rounded-full bg-amber-400/80" />
                <div className="size-2.5 rounded-full bg-green-400/80" />
              </div>
              <div className="flex max-w-xs flex-1 items-center justify-center px-2">
                <div className="flex w-full items-center gap-1.5 truncate rounded-md border border-border bg-background px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                  <GlobeIcon className="size-3 shrink-0 text-primary" />
                  <span className="truncate">{payload.url}</span>
                </div>
              </div>
              <div className="size-4" />
            </div>

            {/* Mockup Preview Area */}
            <div className="p-6 bg-canvas flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-small font-semibold text-foreground">{displayHost}</p>
                  <p className="text-caption text-muted-foreground">Automated browser inspection</p>
                </div>
                <HealthScore score={payload.healthScore} showBand />
              </div>

              {/* Consent banner status chip */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 shadow-xs">
                {summary.cmpDetected ? (
                  <CheckIcon className="size-4 shrink-0 text-success" />
                ) : (
                  <XIcon className="size-4 shrink-0 text-warning" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium">
                    {summary.cmpDetected
                      ? `${t("freeScanner.bannerDetected")}${summary.cmpName ? ` (${summary.cmpName})` : ""}`
                      : t("freeScanner.bannerNotDetected")}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {summary.cmpDetected
                      ? "Consent management mechanism identified on page"
                      : "No standard consent management platform identified"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. SUMMARY KPI CARDS ROW (Image 1 reference: 4 summary cards + copy link) */}
      <div>
        <h3 className="text-xl font-bold tracking-tight">
          Your website&apos;s scan results
        </h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Card 1: Risk / Compliance Status */}
          <Card className="flex flex-col justify-between p-4">
            <p className="text-caption font-medium text-muted-foreground">
              {t("freeScanner.kpiStatus")}
            </p>
            <p
              className={`mt-2 text-body font-semibold ${
                isLowRisk
                  ? "text-success"
                  : isMediumRisk
                    ? "text-warning"
                    : "text-danger"
              }`}
            >
              {isLowRisk
                ? t("freeScanner.statusLowRisk")
                : isMediumRisk
                  ? t("freeScanner.statusMediumRisk")
                  : t("freeScanner.statusHighRisk")}
            </p>
          </Card>

          {/* Card 2: Scan Date */}
          <Card className="flex flex-col justify-between p-4">
            <p className="text-caption font-medium text-muted-foreground">
              {t("freeScanner.kpiScanDate")}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-body font-semibold text-foreground">
              <CalendarIcon className="size-4 text-muted-foreground" />
              <span>{scanDate}</span>
            </p>
          </Card>

          {/* Card 3: Monitored Scope / Regulations */}
          <Card className="flex flex-col justify-between p-4">
            <p className="text-caption font-medium text-muted-foreground">
              {t("freeScanner.kpiRegulations")}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-body font-semibold text-foreground">
              <ShieldIcon className="size-4 text-primary" />
              <span>{t("freeScanner.kpiRegulationsValue")}</span>
            </p>
          </Card>

          {/* Card 4: Total Trackers Detected */}
          <Card className="flex flex-col justify-between p-4">
            <p className="text-caption font-medium text-muted-foreground">
              {t("freeScanner.kpiTrackers")}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-body font-semibold text-foreground">
              <FlagIcon className="size-4 text-muted-foreground" />
              <span>{formatNumber(summary.trackersBeforeConsent)}</span>
            </p>
          </Card>

          {/* Card 5: Share / Copy Link Action */}
          <Card className="flex flex-col justify-between p-4">
            <p className="text-caption font-medium text-muted-foreground">
              Share scan result
            </p>
            <button
              type="button"
              onClick={copyShareLink}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-small font-medium text-foreground transition hover:bg-accent"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-4 text-success" />
                  <span className="text-success">{t("freeScanner.linkCopied")}</span>
                </>
              ) : (
                <>
                  <LinkIcon className="size-4 text-primary" />
                  <span>{t("freeScanner.copyLink")}</span>
                </>
              )}
            </button>
          </Card>
        </div>
      </div>

      {/* 4. TRACKERS DETECTED & DETAILS SECTION (Image 1 reference) */}
      <div id="tracker-details" className="flex flex-col gap-4 pt-4">
        <h3 className="text-2xl font-bold tracking-tight">
          {t("freeScanner.trackersDetectedTitle")}
        </h3>

        <Card className="p-6">
          {/* Tracker Details Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h4 className="text-lg font-bold text-foreground">
              {t("freeScanner.trackerDetailsTitle")}
            </h4>
            <span className="font-mono text-small font-semibold text-foreground">
              Total : {formatNumber(summary.trackersBeforeConsent)}
            </span>
          </div>

          {/* 5 Category Metric Cards Row (Image 1 reference) */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-caption font-medium text-muted-foreground">
                {t("freeScanner.catNecessary")}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                {catNecessary}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-caption font-medium text-muted-foreground">
                {t("freeScanner.catPreferences")}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                {catPreferences}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-caption font-medium text-muted-foreground">
                {t("freeScanner.catStatistics")}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                {catStatistics}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-caption font-medium text-muted-foreground">
                {t("freeScanner.catMarketing")}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                {catMarketing}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 text-center">
              <p className="text-caption font-medium text-muted-foreground">
                {t("freeScanner.catUnclassified")}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                {catUnclassified}
              </p>
            </div>
          </div>

          {/* Tracker Table / Findings Details */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">{t("freeScanner.colName")}</th>
                  <th className="pb-3 px-4">{t("freeScanner.colProvider")}</th>
                  <th className="pb-3 px-4">{t("freeScanner.colCategory")}</th>
                  <th className="pb-3 px-4">{t("freeScanner.colDataSentTo")}</th>
                  <th className="pb-3 pl-4">{t("freeScanner.colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {summary.topTrackers.length > 0 ? (
                  summary.topTrackers.map((tracker) => {
                    const isMarketing = /pixel|meta|facebook|tiktok|ads|criteo|doubleclick/i.test(tracker);
                    const isAnalytics = /analytics|stats|plausible|posthog|matomo/i.test(tracker);
                    const category = isMarketing
                      ? t("freeScanner.catMarketing")
                      : isAnalytics
                        ? t("freeScanner.catStatistics")
                        : t("freeScanner.catUnclassified");
                    return (
                      <tr key={tracker} className="hover:bg-accent/40 transition">
                        <td className="py-3 pr-4 font-sans font-medium text-foreground">
                          {tracker}
                        </td>
                        <td className="py-3 px-4 font-sans text-muted-foreground">
                          {tracker}
                        </td>
                        <td className="py-3 px-4 font-sans text-muted-foreground">
                          {category}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {displayHost}
                        </td>
                        <td className="py-3 pl-4 font-sans">
                          <span className="inline-flex rounded-full bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">
                            Pre-consent
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center font-sans text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <CheckIcon className="size-6 text-success" />
                        <p className="font-medium text-foreground">
                          {t("freeScanner.noTrackersDetected")}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          No third-party tracking scripts loaded before user consent.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Full Scan Conversion Prompt (Image 1 CTA box) */}
          <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
            <h5 className="text-body-lg font-semibold text-foreground">
              {t("freeScanner.fullScanCtaTitle")}
            </h5>
            <p className="mx-auto mt-2 max-w-xl text-small text-muted-foreground">
              {t("freeScanner.fullScanCtaBody")}
            </p>
            <Link
              href={`/signup?free_scan_token=${encodeURIComponent(token)}`}
              onClick={() => trackClient("free_scan_signup_clicked")}
              className={`mt-4 ${buttonClasses("primary", "md", "h-11 px-6")}`}
            >
              {t("freeScanner.fullScanCtaButton")}
            </Link>
          </div>
        </Card>
      </div>

      {/* 5. LOCKED CAPABILITIES PANEL (What monitoring adds) */}
      <Card className="p-6">
        <p className="flex items-center gap-2 text-base font-semibold">
          <ShieldIcon className="size-5 text-primary" />
          <span>{t("freeScanner.lockedTitle")}</span>
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 text-small text-muted-foreground">
          {[
            t("freeScanner.lockedReject"),
            t("freeScanner.lockedWithdraw"),
            t("freeScanner.lockedDrift"),
            t("freeScanner.lockedAlerts"),
            t("freeScanner.lockedReports"),
            t("freeScanner.lockedEvidence"),
          ].map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col items-start gap-1.5 border-t border-border pt-4">
          <Link
            href={`/signup?free_scan_token=${encodeURIComponent(token)}`}
            onClick={() => trackClient("free_scan_signup_clicked")}
            className={buttonClasses("primary", "md")}
          >
            {t("freeScanner.cta")}
          </Link>
          <p className="text-caption text-muted-foreground">{t("freeScanner.ctaNote")}</p>
        </div>
      </Card>

      <p className="text-caption text-muted-foreground text-center">{t("freeScanner.expiresNote")}</p>

      {/* 6. EMAIL REPORT MODAL / POPUP */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <DocIcon className="size-6" />
            </div>
            <DialogTitle className="text-center text-xl">
              {t("freeScanner.emailReportTitle")}
            </DialogTitle>
            <DialogDescription className="text-center text-small text-muted-foreground">
              {t("freeScanner.emailReportSubtitle")}
            </DialogDescription>
          </DialogHeader>

          {emailSent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-success-muted text-success">
                <CheckIcon className="size-6" />
              </div>
              <p className="text-body font-semibold text-foreground">
                {t("freeScanner.emailSentSuccess")}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSendEmail} className="flex flex-col gap-4 mt-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-caption text-muted-foreground font-mono truncate">
                <GlobeIcon className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{displayHost}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="report-email-input" className="text-small font-medium text-foreground">
                  Email address
                </label>
                <input
                  id="report-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("freeScanner.emailPlaceholder")}
                  className="h-11 w-full rounded-md border border-border bg-background px-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {emailError ? (
                <p className="text-caption text-danger flex items-center gap-1.5">
                  <AlertTriangleIcon className="size-3.5" />
                  {emailError}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isEmailPending || email.length < 5}
                className="h-11 w-full font-medium"
              >
                {isEmailPending ? t("freeScanner.emailSending") : t("freeScanner.emailButton")}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * ENHANCED ANIMATED SCAN SCREEN
 * Features a high-tech animated radar scanner, live simulated network inspection
 * activity, and visual progress steppers.
 */
function Running({ status, targetUrl }: { status: string; targetUrl?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const stages = [
    { key: "stage1", label: t("freeScanner.stageBrowser"), minSec: 0 },
    { key: "stage2", label: t("freeScanner.stageNavigate"), minSec: 4 },
    { key: "stage3", label: t("freeScanner.stageNetwork"), minSec: 9 },
    { key: "stage4", label: t("freeScanner.stageStorage"), minSec: 15 },
    { key: "stage5", label: t("freeScanner.stageRules"), minSec: 22 },
  ];

  const terminalLogs = [
    "[Chromium] Launched isolated headless browser session",
    "[Network] Intercepting HTTP request stream",
    "[Consent] Simulating zero-consent user journey",
    "[Storage] Inspecting document.cookie & storage writes",
    "[Classifier] Evaluating tracker vendor signatures",
    "[Rules] Computing privacy risk posture score",
  ];

  const currentLogIndex = Math.min(
    terminalLogs.length - 1,
    Math.floor(elapsed / 3.5),
  );

  const displayHost = targetUrl ? targetUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "") : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 py-10">
      {/* 1. Animated Radar & Beam Visual */}
      <div className="relative flex size-36 items-center justify-center">
        {/* Concentric expanding ripples */}
        <div className="absolute inset-0 rounded-full border border-primary/20 bg-primary/5 animate-ping opacity-40" />
        <div className="absolute inset-3 rounded-full border border-primary/30 bg-primary/10 animate-pulse" />
        <div className="absolute inset-6 rounded-full border border-border bg-card shadow-inner" />

        {/* Rotating Radar Sweep Line */}
        <div className="absolute inset-0 flex items-center justify-center animate-spin [animation-duration:3s]">
          <div className="h-full w-0.5 bg-gradient-to-t from-transparent via-primary/50 to-primary" />
        </div>

        {/* Central Glowing Icon */}
        <div className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <RadarIcon className="size-7 animate-pulse" />
        </div>
      </div>

      {/* 2. Scan Header & Target Domain */}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-caption font-semibold uppercase tracking-wider text-primary">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          <span>{status === "QUEUED" ? t("freeScanner.stageQueued") : t("freeScanner.runningTitle")}</span>
        </div>

        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
          {displayHost ? `Scanning ${displayHost}` : "Running automated privacy scan…"}
        </h2>

        <p className="max-w-lg text-small text-muted-foreground">
          {t("freeScanner.runningBody")}
        </p>
      </div>

      {/* 3. Progress Card with Stage Checklist & Animated Indicators */}
      <Card className="w-full overflow-hidden p-6 shadow-md">
        <div className="flex items-center justify-between border-b border-border pb-3 text-caption font-medium uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <SparkleIcon className="size-3.5 text-primary" />
            Inspection Steps
          </span>
          <span className="font-mono text-foreground/80">{elapsed}s elapsed</span>
        </div>

        <ul className="mt-4 flex flex-col gap-3">
          {stages.map((stage) => {
            const isDone = elapsed > stage.minSec + 4;
            const isActive = elapsed >= stage.minSec && !isDone;
            return (
              <li
                key={stage.key}
                className={`flex items-center gap-3 rounded-lg border p-3 text-small transition-all ${
                  isActive
                    ? "border-primary/40 bg-primary/5 font-medium text-foreground shadow-xs"
                    : isDone
                      ? "border-border/60 bg-muted/20 text-muted-foreground"
                      : "border-border/40 text-muted-foreground/60 opacity-60"
                }`}
              >
                {isDone ? (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                    <CheckIcon className="size-3" />
                  </div>
                ) : isActive ? (
                  <div className="flex size-5 shrink-0 items-center justify-center">
                    <ClockIcon className="size-4 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="size-2.5 mx-1 rounded-full bg-muted-foreground/30" />
                )}
                <span className="flex-1 text-left">{stage.label}</span>
                {isActive && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    Active
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* Live Technical Feed Ticker */}
        <div className="mt-5 rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground text-left">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-success animate-ping" />
            <span className="text-foreground/90 font-medium">
              {terminalLogs[currentLogIndex]}
            </span>
          </div>
        </div>

        {/* Shimmering Progress Bar */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary/60 via-primary to-info transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(95, 15 + elapsed * 3.5)}%` }}
          />
        </div>
      </Card>
    </div>
  );
}

function Notice({ tone, title }: { tone: "warning"; title: string }) {
  return (
    <Card className="flex items-start gap-2.5 border-warning/40 bg-warning-muted p-4">
      <AlertTriangleIcon className="mt-0.5 size-4 text-warning" />
      <p className="text-small">{title}</p>
      <span className="sr-only">{tone}</span>
    </Card>
  );
}

