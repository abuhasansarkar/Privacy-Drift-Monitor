"use client";

import { useState } from "react";
import { t } from "@pdm/shared/copy";
import { Button } from "@/components/ui/button";

/**
 * CREATE A TRACKER VENDOR — PLAN.md §3.12, Phase 6 task 6.6.
 *
 * ⚠️ THE "create vendor from this domain" BUTTON PRE-FILLS THIS FORM RATHER
 * THAN CREATING SILENTLY. §3.12 calls it "one-click", and one click to a filled
 * form is as far as that can responsibly go: a vendor row decides how every
 * tenant's findings are categorised and how severe they are. Creating one from
 * a domain string alone would guess the category and the risk level, and a
 * guess here is a wrong severity on somebody's client report.
 *
 * ⚠️ THE SLUG IS DERIVED BUT EDITABLE. It is the unique key, and the upsert
 * keys on it — so an operator fixing a typo in an existing vendor must be able
 * to type the existing slug rather than accidentally creating a duplicate under
 * a slug the form invented.
 */

const CATEGORIES = [
  "ANALYTICS",
  "MARKETING",
  "SOCIAL",
  "ADVERTISING",
  "FUNCTIONAL",
  "ESSENTIAL",
  "SECURITY",
  "CDN",
  "UNKNOWN",
] as const;

const RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function VendorForm({
  action,
  initialDomain,
}: {
  action: (formData: FormData) => Promise<void>;
  initialDomain?: string;
}) {
  const [name, setName] = useState(initialDomain ?? "");
  const [slug, setSlug] = useState(initialDomain ? slugify(initialDomain) : "");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={action} className="grid gap-3 p-4 sm:grid-cols-2">
      <Field label={t("admin.trackerName")}>
        <input
          name="name"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(slugify(event.target.value));
          }}
          className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small"
        />
      </Field>

      <Field label="Slug">
        <input
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          pattern="[a-z0-9-]+"
          className="h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-mono"
        />
      </Field>

      <Field label={t("admin.trackerCategory")}>
        <select
          name="category"
          defaultValue="ANALYTICS"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-small"
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t("admin.trackerRisk")}>
        <select
          name="riskLevel"
          defaultValue="MEDIUM"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-small"
        >
          {RISKS.map((risk) => (
            <option key={risk} value={risk}>
              {risk}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t("admin.trackerPatterns")}
        hint="One per line, or comma-separated. Globs, not regular expressions."
        wide
      >
        <textarea
          name="domainPatterns"
          required
          rows={3}
          defaultValue={initialDomain ?? ""}
          className="w-full rounded-md border border-border bg-background px-2.5 py-2 font-mono text-mono"
        />
      </Field>

      <Field label="Documentation URL" wide>
        <input
          name="documentationUrl"
          type="url"
          className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-small"
        />
      </Field>

      <label className="flex items-start gap-2 text-small sm:col-span-2">
        <input type="checkbox" name="isEssentialCandidate" className="mt-1" />
        <span>
          May legitimately load before consent
          <span className="block text-caption text-muted-foreground">
            {/*
              ⚠️ THIS CHECKBOX DOWNGRADES A CRITICAL FINDING TO INFORMATIONAL
              FOR EVERY TENANT. The schema comment is explicit that it is
              curated manually and never inferred — ticking it for a marketing
              tag would silence the product's single most important detection
              across the whole platform.
            */}
            Consent platforms, bot challenges and payment-fraud services only. This
            downgrades a pre-consent detection for every tenant.
          </span>
        </span>
      </label>

      <div className="sm:col-span-2">
        <Button type="submit" variant="primary">
          {t("admin.trackerSave")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-caption font-medium">{label}</span>
      {children}
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
