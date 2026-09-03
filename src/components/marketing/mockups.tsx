import { AI, EVIDENCE, PORTAL, WHITE_LABEL } from "@content/marketing/homepage";
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  GlobeIcon,
  SparkleIcon,
} from "@/components/ui/icons";
import { DemoLabel } from "./section";

/**
 * PRODUCT MOCK-UPS — evidence cards, AI output, report and portal previews.
 *
 * ⚠️ CLEARLY LABELLED DEMO DATA, EVERY TIME: each mock renders the
 * `demoLabel` from its content module. The visual language mirrors the real
 * application (same tokens, type scale and severity colours) so the mock-up
 * is honest about what the product looks like — and the label keeps it honest
 * about what is real.
 */

const KIND_ICONS: Record<string, React.ReactNode> = {
  "Network event": <GlobeIcon className="size-4" />,
  Cookie: <ClockIcon className="size-4" />,
  Drift: <AlertTriangleIcon className="size-4" />,
};

/** The three evidence cards: network event, cookie, drift comparison. */
export function EvidenceCards() {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {EVIDENCE.cards.map((card) => (
          <div key={card.kind} className="rounded-lg border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-primary">
              <span aria-hidden="true">{KIND_ICONS[card.kind]}</span>
              {card.kind}
            </p>
            <dl className="mt-3 flex flex-col gap-2">
              {card.rows.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                  <dt className="text-caption text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-small text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <DemoLabel>{EVIDENCE.demoLabel}</DemoLabel>
    </div>
  );
}

/** The AI explanation mock — grounded, actionable, and labelled. */
export function AiExplanationCard() {
  const example = AI.example;
  return (
    <div>
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-start gap-2 border-b border-border p-4">
          <AlertTriangleIcon className="mt-0.5 size-4 text-warning" />
          <div>
            <p className="text-h4">{example.title}</p>
            <p className="text-small text-foreground">{example.body}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="rounded-md bg-muted p-3">
            <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              <SparkleIcon className="size-3.5" />
              Why
            </p>
            <p className="mt-1 text-small text-foreground">{example.why}</p>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
              Recommended action
            </p>
            <p className="mt-1 text-small text-foreground">{example.action}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {example.buttons.map((button, index) => (
              <span
                key={button}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-small"
              >
                {index === 0 ? (
                  <DocIcon className="size-3.5 text-primary" />
                ) : (
                  <CheckIcon className="size-3.5 text-primary" />
                )}
                {button}
              </span>
            ))}
          </div>
        </div>
      </div>
      <DemoLabel>{AI.demoLabel}</DemoLabel>
    </div>
  );
}

/** White-label monthly report preview. */
export function ReportPreview() {
  const report = WHITE_LABEL.report;
  return (
    <div>
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-small font-bold text-primary-foreground">
              {report.agency.slice(0, 1)}
            </span>
            <div>
              <p className="text-small font-semibold">{report.agency}</p>
              <p className="text-caption text-muted-foreground">{report.subtitle}</p>
            </div>
          </div>
          <p className="mt-3 text-caption text-muted-foreground">
            Client: <span className="font-medium text-foreground">{report.client}</span>
          </p>
        </div>
        <div className="flex items-center gap-4 p-4">
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full border-4 border-success/60 text-h3 font-bold text-success"
            role="img"
            aria-label={`Monitoring health score ${report.health} out of 100`}
          >
            {report.health}
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2">
            {report.stats.map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-muted-foreground">{label}</dt>
                <dd className="text-small font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <DemoLabel>{WHITE_LABEL.demoLabel}</DemoLabel>
    </div>
  );
}

/** Client portal preview. */
export function PortalPreview() {
  return (
    <div>
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <p className="flex items-center gap-2 text-small font-semibold">
            <CameraIcon className="size-4 text-primary" />
            Client portal · Example Company
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 p-4">
          {PORTAL.stats.map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted p-3">
              <dt className="text-caption text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-h3 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border p-4">
          <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            Reports
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {PORTAL.reports.map((month) => (
              <li key={month} className="flex items-center gap-2 text-small">
                <DocIcon className="size-3.5 text-muted-foreground" />
                {month} · PDF
              </li>
            ))}
          </ul>
        </div>
      </div>
      <DemoLabel>{PORTAL.demoLabel}</DemoLabel>
    </div>
  );
}
