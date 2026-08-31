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
import type { ReactNode } from "react";
import { BASE_DISCLAIMER, METHODOLOGY_NOTE, type Branding } from "@pdm/shared/branding";
import { reportCopy } from "../copy/en";
import type {
  ConsentMatrixRow,
  CookieLine,
  DriftLine,
  EvidenceLine,
  IssueLine,
  ReportMeta,
  TrackerLine,
} from "../types";
import { scoreBand, severityStyle } from "./styles";

/**
 * SHARED REPORT PARTS — PLAN.md Part VI §6.8.
 *
 * ⚠️ EVERY COMPONENT HERE IS PURE AND TAKES ITS DATA. None reads a database,
 * a cache, or a module-level brand. That is the leakage rule (§6.9) expressed
 * as a component signature rather than as a convention.
 */

const DATE = (value: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone }).format(value);

const DATETIME = (value: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);

const NUMBER = new Intl.NumberFormat("en-GB");

export { DATE as formatReportDate, DATETIME as formatReportDateTime };

export function SeverityChip({
  severity,
  label,
}: {
  severity: string;
  label: string;
}) {
  const tone = severityStyle(severity);
  // ⚠️ The label is not optional and there is no icon-only variant (§11.6).
  return (
    <span className="chip" style={{ color: tone.fg, background: tone.bg }}>
      {label}
    </span>
  );
}

/**
 * Cover page — UI_DESIGN_PROMPTS §9.2.
 *
 * Logo, thin accent rule, title, client and period, score ring, and the
 * disclaimer at the foot. The disclaimer is on page one because a forwarded
 * PDF is often read one page at a time.
 */
export function Cover({
  meta,
  branding,
  score,
}: {
  meta: ReportMeta;
  branding: Branding;
  score: number | null;
}) {
  const c = reportCopy.cover;
  return (
    <section className="page cover">
      {branding.logoLightUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- not a Next app; this is a PDF document.
        <img className="logo" src={branding.logoLightUrl} alt={branding.companyName} />
      ) : (
        <div className="wordmark">{branding.companyName}</div>
      )}

      <div className="accent-rule" style={{ marginTop: "8mm" }} />

      <p className="kicker">{c.kicker}</p>
      <h1>{meta.name}</h1>

      <dl className="meta">
        {meta.clientName ? (
          <>
            <dt>{c.preparedFor}</dt>
            <dd>{meta.clientName}</dd>
          </>
        ) : null}
        {meta.websiteLabel ? (
          <>
            <dt>{c.website}</dt>
            <dd className="mono">{meta.websiteLabel}</dd>
          </>
        ) : null}
        {meta.periodStart && meta.periodEnd ? (
          <>
            <dt>{c.period}</dt>
            <dd>
              {DATE(meta.periodStart, meta.timeZone)} – {DATE(meta.periodEnd, meta.timeZone)}
            </dd>
          </>
        ) : null}
        <dt>{c.preparedBy}</dt>
        <dd>{branding.companyName}</dd>
        <dt>{c.generated}</dt>
        <dd>{DATETIME(meta.generatedAt, meta.timeZone)}</dd>
      </dl>

      {score !== null ? (
        <div style={{ margin: "6mm 0" }}>
          <ScoreRing score={score} />
        </div>
      ) : null}

      <div className="cover-foot">
        <Disclaimer branding={branding} />
      </div>
    </section>
  );
}

/**
 * The score ring.
 *
 * ⚠️ INLINE SVG, NOT A CHART LIBRARY. This renders inside Chromium's print
 * pipeline with no network and no scripts; a canvas-based chart would produce a
 * blank box. The number is also printed as text, so the value survives
 * greyscale and screen readers.
 */
export function ScoreRing({ score }: { score: number }) {
  const band = scoreBand(score);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <svg className="score-ring" viewBox="0 0 80 80" role="img" aria-label={`Score ${score}`}>
      <circle cx="40" cy="40" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="7" />
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke={band.color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 40 40)"
      />
      <text className="value" x="40" y="41" textAnchor="middle" fill="#0F172A">
        {score}
      </text>
      <text className="band" x="40" y="50" textAnchor="middle">
        {band.label}
      </text>
    </svg>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: "7mm" }}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="stat-row">
      {items.map((item) => (
        <div className="stat" key={item.label}>
          {/* A value that is not a short number steps down a size — see the
              `.is-text` note in styles.ts. */}
          <div className={item.value.length > 6 ? "value is-text" : "value"}>
            {item.value}
          </div>
          <div className="label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: string }) {
  return <p className="muted small">{children}</p>;
}

/**
 * ⚠️ THE PARTIAL NOTICE (P5). An incomplete scan may never render as a clean
 * result, and in a PDF the reader cannot click through to discover otherwise.
 */
export function PartialNotice({ phases }: { phases: readonly string[] }) {
  if (phases.length === 0) return null;
  const c = reportCopy.partial;
  return (
    <div className="notice avoid-break">
      <h3>{c.heading}</h3>
      <p>{c.body}</p>
      <p style={{ marginTop: "1.5mm" }}>
        <strong>{c.phasesLabel}:</strong> {phases.join(", ")}
      </p>
    </div>
  );
}

export function ConsentMatrix({ rows }: { rows: readonly ConsentMatrixRow[] }) {
  const l = reportCopy.labels;
  return (
    <table>
      <thead>
        <tr>
          <th>Journey</th>
          <th>Outcome</th>
          <th className="num">Trackers</th>
          <th className="num">Cookies</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.phaseLabel}>
            <td>{row.phaseLabel}</td>
            {/* Never "pass"/"fail" — the three approved outcome words only (§1.12). */}
            <td>{row.outcome}</td>
            <td className="num">
              {row.trackerCount === null ? "—" : NUMBER.format(row.trackerCount)}
            </td>
            <td className="num">
              {row.cookieCount === null ? "—" : NUMBER.format(row.cookieCount)}
            </td>
            <td className="small muted">{row.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
      <caption className="sr-only">{l.category}</caption>
    </table>
  );
}

export function TrackerTable({
  rows,
  timeZone,
}: {
  rows: readonly TrackerLine[];
  timeZone: string;
}) {
  const l = reportCopy.labels;
  if (rows.length === 0) return <Empty>{reportCopy.empty.trackers}</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>{l.vendor}</th>
          <th>{l.category}</th>
          <th>{l.risk}</th>
          <th>{l.domains}</th>
          <th>{l.beforeConsent}</th>
          <th>{l.firstDetected}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.vendorName}-${row.domains.join(",")}`}>
            <td>{row.vendorName}</td>
            <td>{row.categoryLabel}</td>
            <td>{row.riskLabel}</td>
            <td className="mono">{row.domains.join(", ")}</td>
            <td>{row.firedBeforeConsent ? l.yes : l.no}</td>
            <td>{row.firstSeenAt ? DATE(row.firstSeenAt, timeZone) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CookieTable({ rows }: { rows: readonly CookieLine[] }) {
  const l = reportCopy.labels;
  if (rows.length === 0) return <Empty>{reportCopy.empty.cookies}</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>{l.cookie}</th>
          <th>{l.domain}</th>
          <th>{l.category}</th>
          <th>{l.lifetime}</th>
          <th>{l.afterReject}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.domain}-${row.name}`}>
            <td className="mono">{row.name}</td>
            <td className="mono">{row.domain}</td>
            <td>{row.categoryLabel}</td>
            <td>
              {row.lifetimeDays === null
                ? l.session
                : `${NUMBER.format(row.lifetimeDays)} ${l.days}`}
            </td>
            <td>{row.setBeforeConsent ? l.yes : l.no}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Finding({
  issue,
  timeZone,
  includeEvidence,
}: {
  issue: IssueLine;
  timeZone: string;
  includeEvidence: boolean;
}) {
  const l = reportCopy.labels;
  return (
    <article className="finding">
      <SeverityChip severity={issue.severity} label={issue.severityLabel} />
      <h3>{issue.title}</h3>
      <p className="small muted">
        {issue.websiteLabel} · {issue.categoryLabel} · {issue.statusLabel} ·{" "}
        {l.firstDetected} {DATE(issue.firstDetectedAt, timeZone)}
      </p>

      <div className="field">
        <div className="field-label">{l.technicalReason}</div>
        <div>{issue.technicalReason}</div>
      </div>

      <div className="field">
        <div className="field-label">{l.recommendation}</div>
        <div>{issue.recommendedAction}</div>
      </div>

      {/* ⚠️ AI output is labelled and visually separated, and it never replaces
          the rule-authored text above (P2, P3). */}
      {issue.aiSummary ? (
        <div className="ai-block">
          <div className="field-label">AI summary</div>
          <div>{issue.aiSummary}</div>
        </div>
      ) : null}

      {includeEvidence && issue.evidence.length > 0 ? (
        <EvidenceTable rows={issue.evidence} timeZone={timeZone} />
      ) : null}
    </article>
  );
}

export function EvidenceTable({
  rows,
  timeZone,
}: {
  rows: readonly EvidenceLine[];
  timeZone: string;
}) {
  if (rows.length === 0) return <Empty>{reportCopy.empty.evidence}</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>Kind</th>
          <th>Consent state</th>
          <th>Observed</th>
          <th>Recorded</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.kindLabel}</td>
            <td>{row.consentPhaseLabel}</td>
            <td className="mono" style={{ wordBreak: "break-all" }}>
              {row.summary}
              {row.detail ? <div className="tiny">{row.detail}</div> : null}
            </td>
            <td>{DATETIME(row.recordedAt, timeZone)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DriftTable({
  rows,
  timeZone,
}: {
  rows: readonly DriftLine[];
  timeZone: string;
}) {
  const l = reportCopy.labels;
  if (rows.length === 0) return <Empty>{reportCopy.empty.drift}</Empty>;
  return (
    <table>
      <thead>
        <tr>
          <th>{l.detected}</th>
          <th>{l.website}</th>
          <th>{l.change}</th>
          <th>{l.severity}</th>
          <th>{l.before}</th>
          <th>{l.after}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.detectedAt.toISOString()}-${index}`}>
            <td>{DATE(row.detectedAt, timeZone)}</td>
            <td className="mono">{row.websiteLabel}</td>
            <td>
              {row.changeTypeLabel}
              <div className="tiny">{row.summary}</div>
            </td>
            <td>
              <SeverityChip severity={row.severity} label={row.severityLabel} />
            </td>
            <td className="small muted">{row.before}</td>
            <td className="small">{row.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Methodology() {
  return (
    <Section title={reportCopy.sections.methodology}>
      <p className="small">{METHODOLOGY_NOTE}</p>
    </Section>
  );
}

export function Limitations() {
  return (
    <Section title={reportCopy.sections.limitations}>
      <ul className="small">
        {reportCopy.limitations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * ⚠️ ON EVERY PDF (§6.8, §12.3). The agency's custom text is APPENDED to the
 * base disclaimer and can never replace it.
 */
export function Disclaimer({ branding }: { branding: Branding }) {
  return (
    <div className="tiny">
      <p>{BASE_DISCLAIMER}</p>
      {branding.customDisclaimer ? <p>{branding.customDisclaimer}</p> : null}
      {branding.reportFooterText ? <p>{branding.reportFooterText}</p> : null}
      {branding.contactEmail ? (
        <p>
          {reportCopy.footer.generatedBy} {branding.companyName} · {branding.contactEmail}
        </p>
      ) : (
        <p>
          {reportCopy.footer.generatedBy} {branding.companyName}
        </p>
      )}
    </div>
  );
}

export function Screenshots({
  shots,
}: {
  shots: readonly { label: string; dataUri: string }[];
}) {
  if (shots.length === 0) return null;
  return (
    <Section title={reportCopy.sections.screenshots}>
      {shots.map((shot) => (
        <figure key={shot.label}>
          {/* eslint-disable-next-line @next/next/no-img-element -- PDF document, not a Next page. */}
          <img src={shot.dataUri} alt={shot.label} />
          <figcaption>{shot.label}</figcaption>
        </figure>
      ))}
    </Section>
  );
}
