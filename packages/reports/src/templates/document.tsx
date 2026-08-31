/*
 * ⚠️ EXPLICIT `React` IMPORT, even though the automatic JSX runtime does not
 * need one. These templates are transformed by THREE different toolchains —
 * Turbopack for the app, esbuild via tsx for the worker, and tsc for the
 * typecheck — and they do not agree on which runtime to use for a file in
 * `packages/`. The worker crashed at render time with "React is not defined"
 * on a file the typecheck was perfectly happy with. This import is correct
 * under both runtimes and costs nothing under the automatic one.
 */
import * as React from "react";
import { reportCopy } from "../copy/en";
import type {
  IssueLine,
  IssueReportData,
  MonthlyMonitoringData,
  PrivacyDriftData,
  ReportDocument,
  ScanReportData,
  WebsiteHealthData,
} from "../types";
import {
  ConsentMatrix,
  CookieTable,
  Cover,
  Disclaimer,
  DriftTable,
  Empty,
  Finding,
  Limitations,
  Methodology,
  ScoreRing,
  Screenshots,
  Section,
  SeverityChip,
  Stats,
  PartialNotice,
  TrackerTable,
  formatReportDate,
} from "./parts";
import { printStyles } from "./styles";

/**
 * THE FIVE REPORT TYPES — PLAN.md Part VI §6.8.
 *
 * ⚠️ `document.branding` IS THREADED THROUGH EXPLICITLY at every level. Search
 * this file for a branding read that is not a prop — there is none, and adding
 * one is how the concurrent-render acceptance criterion starts failing.
 */

const NUMBER = new Intl.NumberFormat("en-GB");

export function ReportDocumentView({ document }: { document: ReportDocument }) {
  const { meta, branding, options, payload } = document;
  const timeZone = meta.timeZone;

  const coverScore =
    payload.type === "WEBSITE_HEALTH"
      ? payload.score
      : payload.type === "SCAN"
        ? payload.scan.score
        : null;

  return (
    <html lang="en">
      {/*
        eslint-disable-next-line @next/next/no-head-element --
        This is a standalone PDF document rendered by Playwright, not a Next
        page. `next/head` does not exist outside the app router's tree, and the
        document genuinely needs its own <head> for the print stylesheet.
      */}
      <head>
        <meta charSet="utf-8" />
        <title>{meta.name}</title>
        <style dangerouslySetInnerHTML={{ __html: printStyles(branding) }} />
      </head>
      <body>
        <Cover meta={meta} branding={branding} score={coverScore} />

        <section className="page">
          {/* AI is additive: when it is absent, everything below still renders (P3). */}
          {options.includeAiSummary && document.aiSummary ? (
            <div className="ai-block">
              <div className="field-label">{reportCopy.sections.aiSummary}</div>
              <div>{document.aiSummary}</div>
            </div>
          ) : null}

          {payload.type === "SCAN" ? (
            <ScanBody data={payload} timeZone={timeZone} options={options} />
          ) : null}
          {payload.type === "ISSUE" ? (
            <IssueBody data={payload} timeZone={timeZone} options={options} />
          ) : null}
          {payload.type === "MONTHLY_MONITORING" ? (
            <MonthlyBody data={payload} timeZone={timeZone} options={options} />
          ) : null}
          {payload.type === "WEBSITE_HEALTH" ? (
            <HealthBody data={payload} timeZone={timeZone} options={options} />
          ) : null}
          {payload.type === "PRIVACY_DRIFT" ? (
            <DriftBody data={payload} timeZone={timeZone} />
          ) : null}

          <Methodology />
          <Limitations />
          <Disclaimer branding={branding} />
        </section>
      </body>
    </html>
  );
}

interface BodyProps {
  timeZone: string;
  options: ReportDocument["options"];
}

function ScanBody({
  data,
  timeZone,
  options,
}: BodyProps & { data: ScanReportData }) {
  const s = reportCopy.sections;
  return (
    <>
      <PartialNotice phases={data.scan.incompletePhases} />

      <Section title={s.summary}>
        <Stats
          items={[
            {
              label: reportCopy.summary.currentScore,
              // ⚠️ P5 — a PARTIAL scan renders the approved unknown wording,
              // never a number that reads as a clean result.
              value: data.scan.score === null ? reportCopy.outcomes.unknown : String(data.scan.score),
            },
            { label: s.trackers, value: NUMBER.format(data.trackers.length) },
            { label: s.issues, value: NUMBER.format(data.issues.length) },
            {
              label: reportCopy.summary.preConsentRequests,
              value: NUMBER.format(data.requestSummary.beforeConsent),
            },
          ]}
        />
        <p className="small muted">
          {reportCopy.summary.requests}: {NUMBER.format(data.requestSummary.total)} ·{" "}
          {reportCopy.summary.thirdPartyRequests}:{" "}
          {NUMBER.format(data.requestSummary.thirdParty)}
        </p>
      </Section>

      <Section title={s.consentMatrix}>
        <ConsentMatrix rows={data.consentMatrix} />
      </Section>

      <Section title={s.trackers}>
        <TrackerTable rows={data.trackers} timeZone={timeZone} />
      </Section>

      <Section title={s.cookies}>
        <CookieTable rows={data.cookies} />
      </Section>

      <Section title={s.issues}>
        <FindingList
          issues={data.issues}
          timeZone={timeZone}
          includeEvidence={options.includeEvidenceAppendix}
        />
      </Section>

      {options.includeScreenshots ? <Screenshots shots={data.screenshots} /> : null}
    </>
  );
}

function IssueBody({
  data,
  timeZone,
  options,
}: BodyProps & { data: IssueReportData }) {
  return (
    <Section title={reportCopy.sections.issues}>
      <FindingList
        issues={data.issues}
        timeZone={timeZone}
        includeEvidence={options.includeEvidenceAppendix}
      />
    </Section>
  );
}

/**
 * The flagship deliverable (§6.8): scans performed, monitoring uptime, score
 * trend, findings opened and resolved, changes detected, current status.
 */
function MonthlyBody({
  data,
  timeZone,
  options,
}: BodyProps & { data: MonthlyMonitoringData }) {
  const s = reportCopy.sections;
  const uptime =
    data.scansPerformed === 0
      ? reportCopy.outcomes.unknown
      : `${Math.round((data.scansSucceeded / data.scansPerformed) * 100)}%`;

  return (
    <>
      <Section title={s.summary}>
        <Stats
          items={[
            {
              label: reportCopy.summary.websitesMonitored,
              value: NUMBER.format(data.websitesMonitored),
            },
            {
              label: reportCopy.summary.scansPerformed,
              value: NUMBER.format(data.scansPerformed),
            },
            { label: reportCopy.summary.monitoringUptime, value: uptime },
            {
              label: reportCopy.summary.changesDetected,
              value: NUMBER.format(data.drift.length),
            },
          ]}
        />
        <p className="small muted">
          {reportCopy.summary.issuesOpened}: {NUMBER.format(data.issuesOpened)} ·{" "}
          {reportCopy.summary.issuesResolved}: {NUMBER.format(data.issuesResolved)}
          {data.scansPartial > 0 || data.scansFailed > 0 ? (
            <>
              {" "}
              · {NUMBER.format(data.scansPartial)} partially completed,{" "}
              {NUMBER.format(data.scansFailed)} did not complete
            </>
          ) : null}
        </p>
      </Section>

      <Section title={s.score}>
        <ScoreTrend points={data.scoreTrend} timeZone={timeZone} />
      </Section>

      <Section title={s.perWebsite}>
        <table>
          <thead>
            <tr>
              <th>{reportCopy.labels.website}</th>
              <th className="num">{reportCopy.labels.score}</th>
              <th className="num">{reportCopy.labels.openIssues}</th>
              <th>{reportCopy.labels.status}</th>
              <th>{reportCopy.labels.lastScanned}</th>
            </tr>
          </thead>
          <tbody>
            {data.perWebsite.map((row) => (
              <tr key={row.websiteLabel}>
                <td className="mono">{row.websiteLabel}</td>
                <td className="num">
                  {row.score === null ? reportCopy.outcomes.unknown : row.score}
                </td>
                <td className="num">{NUMBER.format(row.openIssues)}</td>
                <td>{row.statusLabel}</td>
                <td>
                  {row.lastScannedAt ? formatReportDate(row.lastScannedAt, timeZone) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={s.drift}>
        <DriftTable rows={data.drift} timeZone={timeZone} />
      </Section>

      <Section title={s.issues}>
        <FindingList
          issues={data.issues}
          timeZone={timeZone}
          includeEvidence={options.includeEvidenceAppendix}
        />
      </Section>
    </>
  );
}

function HealthBody({
  data,
  timeZone,
  options,
}: BodyProps & { data: WebsiteHealthData }) {
  const s = reportCopy.sections;
  return (
    <>
      <Section title={s.score}>
        {data.score === null ? (
          <Empty>{reportCopy.outcomes.unknown}</Empty>
        ) : (
          <div style={{ display: "flex", gap: "6mm", alignItems: "center" }}>
            <ScoreRing score={data.score} />
            <div>
              <p className="small muted">{data.scoreConfidenceLabel}</p>
              <p className="small">
                {reportCopy.labels.lastScanned}:{" "}
                {data.lastScannedAt ? formatReportDate(data.lastScannedAt, timeZone) : "—"}
              </p>
            </div>
          </div>
        )}
      </Section>

      <Section title={s.scoreBreakdown}>
        {data.breakdown.length === 0 ? (
          <Empty>{reportCopy.outcomes.unknown}</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Factor</th>
                <th className="num">Deduction</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="num">−{NUMBER.format(row.deduction)}</td>
                  <td className="small muted">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={s.consentMatrix}>
        <ConsentMatrix rows={data.consentMatrix} />
      </Section>

      <Section title={s.issues}>
        <FindingList
          issues={data.issues}
          timeZone={timeZone}
          includeEvidence={options.includeEvidenceAppendix}
        />
      </Section>
    </>
  );
}

function DriftBody({ data, timeZone }: { data: PrivacyDriftData; timeZone: string }) {
  return (
    <>
      <Section title={reportCopy.sections.summary}>
        <div className="stat-row">
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const).map((severity) => (
            <div className="stat" key={severity}>
              <div className="value">{NUMBER.format(data.bySeverity[severity] ?? 0)}</div>
              <div className="label">
                <SeverityChip severity={severity} label={severity[0] + severity.slice(1).toLowerCase()} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={reportCopy.sections.drift}>
        <DriftTable rows={data.events} timeZone={timeZone} />
      </Section>
    </>
  );
}

function FindingList({
  issues,
  timeZone,
  includeEvidence,
}: {
  issues: readonly IssueLine[];
  timeZone: string;
  includeEvidence: boolean;
}) {
  if (issues.length === 0) return <Empty>{reportCopy.empty.issues}</Empty>;
  return (
    <>
      {issues.map((issue) => (
        <Finding
          key={issue.id}
          issue={issue}
          timeZone={timeZone}
          includeEvidence={includeEvidence}
        />
      ))}
    </>
  );
}

/**
 * The score trend, drawn as inline SVG.
 *
 * ⚠️ A NULL SCORE IS A GAP, NOT A ZERO. A PARTIAL scan has no score (P5), and
 * plotting it at the bottom of the axis would draw a cliff that reads as a
 * catastrophic drop the site never had.
 */
function ScoreTrend({
  points,
  timeZone,
}: {
  points: readonly { at: Date; score: number | null }[];
  timeZone: string;
}) {
  const scored = points.filter((point) => point.score !== null);
  if (scored.length < 2) {
    return <Empty>{reportCopy.empty.scans}</Empty>;
  }

  const width = 170;
  const height = 44;
  const step = width / (points.length - 1 || 1);
  const y = (score: number) => height - (score / 100) * height;

  // Broken into runs so a gap is a break in the line, not a straight segment
  // drawn through a scan that has no score.
  const runs: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.score === null) {
      if (current.length > 1) runs.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"} ${index * step} ${y(point.score)}`);
  });
  if (current.length > 1) runs.push(current.join(" "));

  const first = scored[0];
  const last = scored[scored.length - 1];

  return (
    <div className="avoid-break">
      <svg viewBox={`0 0 ${width} ${height + 6}`} style={{ width: "100%", height: "30mm" }}>
        <line x1="0" y1={height} x2={width} y2={height} stroke="#E2E8F0" strokeWidth="0.5" />
        {runs.map((run) => (
          <path key={run} d={run} fill="none" stroke="#2563EB" strokeWidth="1.2" />
        ))}
        {points.map((point, index) =>
          point.score === null ? null : (
            <circle
              key={point.at.toISOString()}
              cx={index * step}
              cy={y(point.score)}
              r="1.4"
              fill="#2563EB"
            />
          ),
        )}
      </svg>
      <p className="tiny">
        {first ? formatReportDate(first.at, timeZone) : ""} –{" "}
        {last ? formatReportDate(last.at, timeZone) : ""} ·{" "}
        {first?.score} → {last?.score}
      </p>
    </div>
  );
}
