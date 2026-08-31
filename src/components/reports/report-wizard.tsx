"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { t } from "@pdm/shared/copy";
import { REPORT_TYPE_LABEL } from "@pdm/shared/copy/labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { generateReport } from "@/server/actions/reports";

/**
 * REPORT GENERATION WIZARD — §3.11, UI_DESIGN_PROMPTS §5.19 (screen B).
 *
 * ⚠️ THE SCOPE FIELDS SHOWN DEPEND ON THE TYPE, because §6.8 makes them
 * mandatory per type: a WEBSITE_HEALTH report needs a website, a SCAN report
 * needs a scan, a MONTHLY_MONITORING report needs a period. Rendering all of
 * them always would let a user submit a combination the server has to reject
 * after they have already been told it was generating.
 *
 * ⚠️ THE BRANDING PREVIEW IS A THUMBNAIL OF THE REAL COVER, rendered from the
 * agency's actual resolved branding — passed in as props, never fetched here
 * (§6.9).
 */

export interface WizardOption {
  id: string;
  label: string;
  clientId?: string | null;
}

export interface ScanOption {
  id: string;
  label: string;
}

const TYPE_BODY: Record<string, string> = {
  SCAN: t("reports.typeScanBody"),
  ISSUE: t("reports.typeIssueBody"),
  MONTHLY_MONITORING: t("reports.typeMonthlyBody"),
  WEBSITE_HEALTH: t("reports.typeHealthBody"),
  PRIVACY_DRIFT: t("reports.typeDriftBody"),
};

export function ReportWizard({
  clients,
  websites,
  branding,
  defaultName,
}: {
  clients: WizardOption[];
  websites: WizardOption[];
  branding: { companyName: string; primaryColor: string };
  defaultName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("MONTHLY_MONITORING");
  const [name, setName] = useState(defaultName);
  const [clientId, setClientId] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanOption[]>([]);
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [options, setOptions] = useState({
    includeEvidenceAppendix: false,
    includeAiSummary: false,
    includeResolvedIssues: false,
    includeScreenshots: true,
  });

  const needsWebsite = type === "WEBSITE_HEALTH" || type === "SCAN";
  const needsScan = type === "SCAN";
  const needsPeriod = type === "MONTHLY_MONITORING" || type === "PRIVACY_DRIFT";

  const visibleWebsites = clientId
    ? websites.filter((website) => website.clientId === clientId)
    : websites;

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await generateReport({
        type: type as never,
        name,
        clientId,
        websiteId,
        scanId,
        periodStart: needsPeriod ? new Date(periodStart) : null,
        periodEnd: needsPeriod ? new Date(periodEnd) : null,
        options,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Straight to the detail page: generation is async, and the detail page
      // is where progress and the completion state live (§3.11).
      router.push(`/app/reports/${result.data.reportId}`);
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title={t("reports.stepType")} />
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {Object.entries(REPORT_TYPE_LABEL).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => {
                  setType(value);
                  setScanId(null);
                }}
                className={cn(
                  "rounded-md border p-3 text-start transition-colors",
                  type === value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="block text-small font-medium">{label}</span>
                <span className="mt-0.5 block text-caption text-muted-foreground">
                  {TYPE_BODY[value]}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("reports.stepScope")} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label={t("reports.nameLabel")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("reports.namePlaceholder")}
                className={INPUT}
              />
            </Field>

            <Field label={t("reports.clientLabel")}>
              <select
                value={clientId ?? ""}
                onChange={(event) => {
                  setClientId(event.target.value || null);
                  // A website from another client would silently produce an
                  // empty report; clearing is the honest reset.
                  setWebsiteId(null);
                  setScanId(null);
                }}
                className={INPUT}
              >
                <option value="">{t("reports.allClients")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </select>
            </Field>

            {needsWebsite ? (
              <Field label={t("reports.websiteLabel")}>
                <select
                  value={websiteId ?? ""}
                  onChange={(event) => {
                    const id = event.target.value || null;
                    setWebsiteId(id);
                    setScanId(null);
                    if (id && needsScan) void loadScans(id, setScans);
                  }}
                  className={INPUT}
                >
                  <option value="">—</option>
                  {visibleWebsites.map((website) => (
                    <option key={website.id} value={website.id}>
                      {website.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {needsScan ? (
              <Field label={t("reports.scanLabel")}>
                <select
                  value={scanId ?? ""}
                  onChange={(event) => setScanId(event.target.value || null)}
                  className={INPUT}
                  disabled={!websiteId}
                >
                  <option value="">—</option>
                  {scans.map((scan) => (
                    <option key={scan.id} value={scan.id}>
                      {scan.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {needsPeriod ? (
              <>
                <Field label={t("reports.periodStart")}>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                    className={INPUT}
                  />
                </Field>
                <Field label={t("reports.periodEnd")}>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                    className={INPUT}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("reports.stepOptions")} />
          <div className="flex flex-col gap-2 p-4">
            <Check
              label={t("reports.optionEvidence")}
              checked={options.includeEvidenceAppendix}
              onChange={(includeEvidenceAppendix) =>
                setOptions({ ...options, includeEvidenceAppendix })
              }
            />
            <Check
              label={t("reports.optionResolved")}
              checked={options.includeResolvedIssues}
              onChange={(includeResolvedIssues) =>
                setOptions({ ...options, includeResolvedIssues })
              }
            />
            <Check
              label={t("reports.optionScreenshots")}
              checked={options.includeScreenshots}
              onChange={(includeScreenshots) =>
                setOptions({ ...options, includeScreenshots })
              }
            />
            {/*
              ⚠️ AI is off by default and the report renders fully without it
              (P3). It is additive, never load-bearing.
            */}
            <Check
              label={t("reports.optionAi")}
              checked={options.includeAiSummary}
              onChange={(includeAiSummary) => setOptions({ ...options, includeAiSummary })}
            />
          </div>
        </Card>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <Button variant="primary" onClick={submit} disabled={pending || !name.trim()}>
            {pending ? t("reports.submitting") : t("reports.submit")}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title={t("reports.brandingPreview")} />
          <div className="p-4">
            {/* A 1:1.414 A4 proportion, so the preview is honest about the shape. */}
            <div className="aspect-[1/1.414] rounded-sm border border-border bg-white p-4 text-[#0F172A] shadow-sm">
              <div
                className="text-[10px] font-semibold"
                style={{ color: branding.primaryColor }}
              >
                {branding.companyName}
              </div>
              <div
                className="mt-2 h-[3px] w-10"
                style={{ background: branding.primaryColor }}
              />
              <div className="mt-3 text-[11px] font-semibold leading-tight">
                {name || REPORT_TYPE_LABEL[type as keyof typeof REPORT_TYPE_LABEL]}
              </div>
              <div className="mt-1 text-[8px] text-[#64748B]">
                {clients.find((client) => client.id === clientId)?.label ?? ""}
              </div>
            </div>
            <p className="mt-2 text-caption text-muted-foreground">
              {t("reports.brandingPreviewNote")}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Loads a website's recent scans on demand.
 *
 * Fetched rather than passed in: pre-loading twenty scans for every website in
 * a 200-site portfolio would be a four-thousand-row payload for a selector most
 * users never open.
 */
async function loadScans(
  websiteId: string,
  setScans: (scans: ScanOption[]) => void,
): Promise<void> {
  try {
    const response = await fetch(`/api/websites/${websiteId}/scans`);
    if (!response.ok) return;
    const body = (await response.json()) as { scans: ScanOption[] };
    setScans(body.scans);
  } catch {
    // A failed lookup leaves the selector empty; the schema then blocks
    // submission with "Choose the scan to report on", which is the right
    // message either way.
    setScans([]);
  }
}

const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-small max-sm:h-11";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-small">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultPeriodStart(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}
