import {
  BASE_DISCLAIMER,
  readableTextOn,
  type Branding,
} from "@pdm/shared/branding";
import { emailCopy } from "./copy/en";
import { escapeHtml, html, raw, type SafeHtml } from "./html";

/**
 * BRANDED EMAIL LAYOUT — PLAN.md Part VI §6.9, Part IX §9.5.
 *
 * ⚠️ `branding` IS A REQUIRED PARAMETER, NOT AMBIENT STATE (§6.9). There is no
 * module-level brand here and there must not be one: the leakage rule is that
 * every branded renderer takes branding explicitly, so two agencies' emails
 * rendered in the same worker tick cannot borrow each other's logo.
 *
 * ⚠️ INLINE STYLES ONLY. Gmail strips `<style>` blocks in several contexts and
 * Outlook's Word renderer ignores most of what survives. Every rule that
 * matters is on the element.
 */

const INK = "#0F172A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const CANVAS = "#F8FAFC";

export interface LayoutOptions {
  branding: Branding;
  /** Preheader — the grey line beside the subject in an inbox list. */
  preview: string;
  heading: string;
  body: SafeHtml;
  cta?: { label: string; url: string };
  /**
   * Client-facing mail carries the disclaimer; internal agency mail does not
   * need it on every message, and adding it there dilutes the one place it
   * matters.
   */
  showDisclaimer?: boolean;
  /** Digest and summary mail only — never security or billing mail (§9.5). */
  unsubscribeUrl?: string | null;
}

export function renderLayout(options: LayoutOptions): string {
  const { branding } = options;
  const brand = branding.primaryColor;
  const onBrand = readableTextOn(brand);

  const logo = branding.logoLightUrl
    ? html`<img
        src="${branding.logoLightUrl}"
        alt="${branding.companyName}"
        width="140"
        style="display:block;max-width:140px;height:auto;border:0;"
      />`
    : // Falls back to a wordmark rather than a broken image (feature doc 14).
      html`<span
        style="font-size:18px;font-weight:600;color:${brand};letter-spacing:-0.01em;"
        >${branding.companyName}</span
      >`;

  const cta = options.cta
    ? html`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr>
          <td
            style="background:${brand};border-radius:6px;"
          >
            <a
              href="${options.cta.url}"
              style="display:inline-block;padding:12px 22px;font-family:inherit;font-size:15px;font-weight:600;color:${onBrand};text-decoration:none;"
              >${options.cta.label}</a
            >
          </td>
        </tr>
      </table>`
    : raw("");

  const disclaimer = options.showDisclaimer
    ? html`<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:${MUTED};">
        ${BASE_DISCLAIMER}${branding.customDisclaimer ? ` ${branding.customDisclaimer}` : ""}
      </p>`
    : html`<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:${MUTED};">
        ${emailCopy.common.monitoringNote}
      </p>`;

  const unsubscribe = options.unsubscribeUrl
    ? html`<p style="margin:10px 0 0;font-size:11px;color:${MUTED};">
        <a href="${options.unsubscribeUrl}" style="color:${MUTED};"
          >${emailCopy.common.unsubscribe}</a
        >
      </p>`
    : raw("");

  const contact = branding.contactEmail
    ? html`<p style="margin:6px 0 0;font-size:11px;color:${MUTED};">
        ${emailCopy.common.sentBy} ${branding.companyName} ·
        <a href="mailto:${branding.contactEmail}" style="color:${MUTED};"
          >${branding.contactEmail}</a
        >
      </p>`
    : html`<p style="margin:6px 0 0;font-size:11px;color:${MUTED};">
        ${emailCopy.common.sentBy} ${branding.companyName}
      </p>`;

  const footerText = branding.reportFooterText
    ? html`<p style="margin:10px 0 0;font-size:11px;color:${MUTED};">
        ${branding.reportFooterText}
      </p>`
    : raw("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(options.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${CANVAS};">
    <!-- Preheader: hidden in the body, shown beside the subject in the inbox. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(options.preview)}
    </div>
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      style="background:${CANVAS};padding:28px 12px;"
    >
      <tr>
        <td align="center">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:${INK};"
          >
            <tr>
              <td style="padding:22px 28px 0;">${logo}</td>
            </tr>
            <tr>
              <td style="padding:18px 28px 4px;">
                <h1 style="margin:0;font-size:21px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;color:${INK};">
                  ${escapeHtml(options.heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 28px 0;font-size:15px;line-height:1.65;color:${INK};">
                ${options.body}
                ${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 24px;border-top:1px solid ${BORDER};">
                ${contact}
                ${footerText}
                ${disclaimer}
                ${unsubscribe}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Body paragraph. */
export function p(text: string): SafeHtml {
  return html`<p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:${INK};">
    ${text}
  </p>`;
}

/** Muted secondary line — expiry notices, "ignore this" lines. */
export function muted(text: string): SafeHtml {
  return html`<p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${MUTED};">
    ${text}
  </p>`;
}

/** Bulleted list. */
export function list(items: readonly string[]): SafeHtml {
  return html`<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;line-height:1.7;color:${INK};">
    ${items.map((item) => html`<li>${item}</li>`)}
  </ul>`;
}

/**
 * Severity chip.
 *
 * ⚠️ COLOUR PLUS TEXT (§11.6, WCAG 1.4.1). The word is not decoration and must
 * never be dropped for a coloured dot — in an email it is also the only thing
 * that survives a client that strips background colours.
 */
const SEVERITY_COLOR: Record<string, { fg: string; bg: string }> = {
  CRITICAL: { fg: "#991B1B", bg: "#FEF2F2" },
  HIGH: { fg: "#9A3412", bg: "#FFF7ED" },
  MEDIUM: { fg: "#854D0E", bg: "#FEFCE8" },
  LOW: { fg: "#1E40AF", bg: "#EFF6FF" },
  INFO: { fg: "#334155", bg: "#F1F5F9" },
};

export function severityChip(severity: string, label: string): SafeHtml {
  const tone = SEVERITY_COLOR[severity] ?? SEVERITY_COLOR.INFO;
  return html`<span
    style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:12px;font-weight:600;color:${tone?.fg ?? INK};background:${tone?.bg ?? CANVAS};"
    >${label}</span
  >`;
}

/** A bordered block of key/value rows — scan facts, report metadata. */
export function factTable(rows: readonly { label: string; value: string }[]): SafeHtml {
  return html`<table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="margin:0 0 16px;border:1px solid ${BORDER};border-radius:8px;border-collapse:separate;overflow:hidden;"
  >
    ${rows.map(
      (row) => html`<tr>
        <td
          style="padding:9px 14px;font-size:13px;color:${MUTED};border-bottom:1px solid ${BORDER};width:42%;"
        >
          ${row.label}
        </td>
        <td
          style="padding:9px 14px;font-size:13px;color:${INK};border-bottom:1px solid ${BORDER};font-weight:500;"
        >
          ${row.value}
        </td>
      </tr>`,
    )}
  </table>`;
}
