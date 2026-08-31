"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BASE_DISCLAIMER, checkBrandColor } from "@pdm/shared/branding";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { saveBranding } from "@/server/actions/branding";

/**
 * BRANDING SETTINGS — §6.9, UI_DESIGN_PROMPTS §5.26.
 *
 * ⚠️ CONTRAST IS CHECKED AS YOU TYPE **AND** AGAIN ON THE SERVER. The live chip
 * is a courtesy; the save action re-runs `checkBrandColor` and rejects, because
 * a client-side check is advice and this is a correctness rule — a pale accent
 * produces an unreadable PDF the agency has already emailed to their client
 * (§6.9).
 *
 * ⚠️ THE BASE DISCLAIMER IS SHOWN, READ-ONLY, ABOVE THE CUSTOM FIELD. §6.8
 * makes it non-replaceable; showing it makes that visible rather than a
 * surprise the agency finds in a generated PDF.
 */

export interface BrandingValue {
  companyName: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  reportFooterText: string | null;
  customDisclaimer: string | null;
  portalWelcomeText: string | null;
}

export function BrandingForm({
  initial,
  portalPath,
}: {
  initial: BrandingValue;
  portalPath: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const primaryCheck = checkBrandColor(value.primaryColor);
  const accentCheck = checkBrandColor(value.accentColor);

  const submit = () => {
    setSaved(false);
    setErrors({});
    start(async () => {
      const result = await saveBranding(value);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? { _form: result.message });
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title={t("branding.title")} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label={t("branding.companyName")}>
              <input
                value={value.companyName ?? ""}
                onChange={(event) =>
                  setValue({ ...value, companyName: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>
            <Field label={t("branding.contactEmail")}>
              <input
                type="email"
                value={value.contactEmail ?? ""}
                onChange={(event) =>
                  setValue({ ...value, contactEmail: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>

            <ColorField
              label={t("branding.primaryColor")}
              value={value.primaryColor}
              onChange={(primaryColor) => setValue({ ...value, primaryColor })}
              passes={primaryCheck.valid}
              error={errors.primaryColor}
            />
            <ColorField
              label={t("branding.accentColor")}
              value={value.accentColor}
              onChange={(accentColor) => setValue({ ...value, accentColor })}
              passes={accentCheck.valid}
              error={errors.accentColor}
            />

            <Field label={t("branding.logoUrlLabel")}>
              <input
                value={value.logoLightUrl ?? ""}
                onChange={(event) =>
                  setValue({ ...value, logoLightUrl: event.target.value || null })
                }
                placeholder="https://…"
                className={INPUT}
              />
              <p className="mt-1 text-caption text-muted-foreground">
                {t("branding.logoHelp")}
              </p>
            </Field>
            <Field label={t("branding.logoDark")}>
              <input
                value={value.logoDarkUrl ?? ""}
                onChange={(event) =>
                  setValue({ ...value, logoDarkUrl: event.target.value || null })
                }
                placeholder="https://…"
                className={INPUT}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("reports.title")} />
          <div className="flex flex-col gap-4 p-4">
            <Field label={t("branding.reportFooter")}>
              <input
                value={value.reportFooterText ?? ""}
                onChange={(event) =>
                  setValue({ ...value, reportFooterText: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>

            <div>
              <span className="mb-1 block text-caption font-medium text-muted-foreground">
                {t("branding.baseDisclaimerLabel")}
              </span>
              {/* Read-only on purpose: §6.8 makes it non-replaceable. */}
              <p className="rounded-md border border-border bg-muted/40 p-2.5 text-caption text-muted-foreground">
                {BASE_DISCLAIMER}
              </p>
            </div>

            <Field label={t("branding.customDisclaimer")}>
              <textarea
                rows={3}
                value={value.customDisclaimer ?? ""}
                onChange={(event) =>
                  setValue({ ...value, customDisclaimer: event.target.value || null })
                }
                className={INPUT}
              />
              <p className="mt-1 text-caption text-muted-foreground">
                {t("branding.customDisclaimerHelp")}
              </p>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("portal.navOverview")} />
          <div className="flex flex-col gap-4 p-4">
            <Field label={t("branding.portalWelcome")}>
              <textarea
                rows={2}
                value={value.portalWelcomeText ?? ""}
                onChange={(event) =>
                  setValue({ ...value, portalWelcomeText: event.target.value || null })
                }
                className={INPUT}
              />
            </Field>
            <Field label={t("branding.portalLink")}>
              <input readOnly value={portalPath} className={`${INPUT} font-mono`} />
              <p className="mt-1 text-caption text-muted-foreground">
                {t("branding.portalLinkHelp")}
              </p>
            </Field>
          </div>
        </Card>

        {errors._form ? (
          <p role="alert" className="text-small text-danger">
            {errors._form}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-small text-success">
            {t("branding.saved")}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? t("branding.saving") : t("branding.save")}
          </Button>
          <Button variant="ghost" onClick={() => setValue(initial)} disabled={pending}>
            {t("branding.discard")}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title={t("branding.livePreview")} />
          <div className="flex flex-col gap-4 p-4">
            <div>
              <p className="mb-1.5 text-caption text-muted-foreground">
                {t("branding.previewReportCover")}
              </p>
              {/* Fixed light palette: a report is print-bound and never themed. */}
              <div className="aspect-[1/1.414] rounded-sm border border-border bg-white p-3 text-[#0F172A]">
                <div
                  className="text-[10px] font-semibold"
                  style={{ color: value.primaryColor }}
                >
                  {value.companyName ?? "—"}
                </div>
                <div
                  className="mt-2 h-[3px] w-9"
                  style={{ background: value.primaryColor }}
                />
                <div className="mt-3 text-[11px] font-semibold">
                  {t("reports.namePlaceholder")}
                </div>
                <div className="mt-auto pt-6 text-[6px] leading-snug text-[#64748B]">
                  {BASE_DISCLAIMER.slice(0, 120)}…
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-caption text-muted-foreground">
                {t("branding.previewPortalHeader")}
              </p>
              <div className="rounded-sm border border-border bg-white p-3">
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: value.primaryColor }}
                >
                  {value.companyName ?? "—"}
                </div>
                <div
                  className="mt-2 h-[2px] w-full"
                  style={{ background: value.accentColor }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
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

/**
 * ⚠️ The contrast chip carries a WORD, not just a colour (§11.6). "AA contrast
 * passes" in green and a red failure message are the same signal to a
 * colour-blind reader only because both are spelled out.
 */
function ColorField({
  label,
  value,
  onChange,
  passes,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  passes: boolean;
  error?: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-caption font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={label}
          className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-background"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className={`${INPUT} font-mono`}
        />
      </div>
      <p
        className={
          passes
            ? "mt-1 text-caption text-success"
            : "mt-1 text-caption text-danger"
        }
      >
        {passes ? t("branding.contrastPasses") : (error ?? t("branding.contrastFails"))}
      </p>
    </div>
  );
}
