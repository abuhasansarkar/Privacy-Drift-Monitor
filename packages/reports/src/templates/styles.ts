import { readableTextOn, type Branding } from "@pdm/shared/branding";

/**
 * PRINT STYLESHEET — PLAN.md Part VI §6.8, Part XI §11.5, UI_DESIGN_PROMPTS §9.2.
 *
 * ⚠️ THE DASHBOARD'S VISUAL LANGUAGE DOES NOT TRANSFER (feature doc 14).
 * A report is printed, forwarded and read on paper: white ground, black text,
 * restrained accent, hairline rules, wide margins. No dark surfaces, no
 * full-bleed colour blocks, no theme switching — the PDF must render
 * IDENTICALLY regardless of the requesting device (§11.5), so nothing here
 * responds to `prefers-color-scheme` and nothing depends on a viewport width.
 *
 * ⚠️ SEVERITY IS COLOUR **PLUS** TEXT (§11.6, WCAG 1.4.1). Every severity chip
 * below carries its word, and the greyscale print of this document is still
 * readable — which is the actual test, since agencies print these.
 *
 * ⚠️ THE BRAND COLOUR IS INTERPOLATED, NOT AMBIENT. It arrives as a parameter
 * for the same reason every renderer does (§6.9).
 */

const SEVERITY = {
  CRITICAL: { fg: "#B91C1C", bg: "#FEF2F2" },
  HIGH: { fg: "#EA580C", bg: "#FFF7ED" },
  MEDIUM: { fg: "#CA8A04", bg: "#FEFCE8" },
  LOW: { fg: "#0284C7", bg: "#F0F9FF" },
  INFO: { fg: "#64748B", bg: "#F8FAFC" },
} as const;

export const SCORE_BANDS = [
  { min: 90, color: "#16A34A", label: "Excellent" },
  { min: 75, color: "#65A30D", label: "Good" },
  { min: 50, color: "#CA8A04", label: "Fair" },
  { min: 25, color: "#EA580C", label: "Poor" },
  { min: 0, color: "#B91C1C", label: "Very low" },
] as const;

export function scoreBand(score: number): { color: string; label: string } {
  // Iterating in descending order means the first match is the tightest band.
  for (const band of SCORE_BANDS) {
    if (score >= band.min) return { color: band.color, label: band.label };
  }
  return { color: "#64748B", label: "Could not be determined" };
}

export function severityStyle(severity: string): { fg: string; bg: string } {
  return SEVERITY[severity as keyof typeof SEVERITY] ?? SEVERITY.INFO;
}

/**
 * ⚠️ `@page` MARGINS ARE ZERO because the running header and footer are
 * supplied to `page.pdf()` as `headerTemplate` / `footerTemplate` with their
 * own margin box. Setting both would double the top gap on every page after
 * the first — the classic Playwright PDF defect.
 */
export function printStyles(branding: Branding): string {
  const brand = branding.primaryColor;
  const onBrand = readableTextOn(brand);

  return `
    @page { size: A4; margin: 0; }

    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #0F172A;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }

    /* Technical values are monospace; chrome is Inter (§11.2). */
    code, .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9pt; }

    .page { page-break-after: always; padding: 18mm 16mm; }
    .page:last-child { page-break-after: auto; }
    .avoid-break { page-break-inside: avoid; }

    h1 { font-size: 26pt; line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 6mm; }
    h2 { font-size: 14pt; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #E2E8F0; }
    h3 { font-size: 11pt; font-weight: 600; margin: 5mm 0 2mm; }
    p  { margin: 0 0 3mm; }
    ul { margin: 0 0 3mm; padding-left: 5mm; }

    .kicker { font-size: 9pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${brand}; margin: 0 0 3mm; }
    .muted { color: #64748B; }
    .small { font-size: 9pt; }
    .tiny  { font-size: 7.5pt; line-height: 1.5; color: #64748B; }

    .accent-rule { height: 3px; background: ${brand}; width: 42mm; margin: 0 0 8mm; }

    .cover { display: flex; flex-direction: column; min-height: 261mm; }
    .cover-foot { margin-top: auto; }

    .logo { max-height: 16mm; max-width: 60mm; }
    .wordmark { font-size: 15pt; font-weight: 600; color: ${brand}; letter-spacing: -0.01em; }

    dl.meta { display: grid; grid-template-columns: 40mm 1fr; gap: 2mm 4mm; margin: 0 0 8mm; }
    dl.meta dt { font-size: 9pt; color: #64748B; }
    dl.meta dd { margin: 0; font-size: 10pt; font-weight: 500; }

    table { width: 100%; border-collapse: collapse; margin: 0 0 5mm; }
    th { text-align: left; font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; padding: 2mm 2mm 1.5mm; border-bottom: 1px solid #CBD5E1; }
    td { font-size: 9.5pt; padding: 2mm; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tr { page-break-inside: avoid; }

    .chip { display: inline-block; padding: 0.6mm 2mm; border-radius: 3px; font-size: 8pt; font-weight: 600; white-space: nowrap; }

    .stat-row { display: flex; flex-wrap: wrap; gap: 4mm; margin: 0 0 6mm; }
    .stat { flex: 1 1 38mm; border: 1px solid #E2E8F0; border-radius: 4px; padding: 3mm 4mm; }
    .stat .value { font-size: 18pt; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    /* ⚠️ A stat is usually a number, but "Could not be determined" is a
       first-class value here (§1.12) and at 18pt it wrapped to three lines and
       burst its tile. Long values step down instead of being truncated — the
       approved outcome wording must stay readable in full. */
    .stat .value.is-text { font-size: 11pt; line-height: 1.35; letter-spacing: 0; }
    .stat .label { font-size: 8.5pt; color: #64748B; }

    /* The PARTIAL banner. Amber left rule plus the word — never colour alone. */
    .notice { border: 1px solid #FDE68A; border-left: 3px solid #D97706; background: #FFFBEB; border-radius: 4px; padding: 3mm 4mm; margin: 0 0 5mm; }
    .notice h3 { margin: 0 0 1.5mm; font-size: 10pt; color: #92400E; }
    .notice p { margin: 0; font-size: 9pt; color: #78350F; }

    .finding { border: 1px solid #E2E8F0; border-radius: 4px; padding: 4mm; margin: 0 0 4mm; page-break-inside: avoid; }
    .finding h3 { margin: 2mm 0 1mm; font-size: 11pt; }
    .finding .field { margin: 0 0 2mm; }
    .finding .field-label { font-size: 8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; }

    /* AI output is visibly labelled and visually separated (§10 QA checklist). */
    .ai-block { border: 1px dashed #C7D2FE; background: #F8FAFF; border-radius: 4px; padding: 3mm 4mm; margin: 0 0 4mm; }
    .ai-block .field-label { color: #4338CA; }

    figure { margin: 0 0 5mm; page-break-inside: avoid; }
    figure img { width: 100%; border: 1px solid #E2E8F0; border-radius: 3px; }
    figcaption { font-size: 8pt; color: #64748B; margin-top: 1.5mm; }

    .score-ring { width: 46mm; height: 46mm; }
    .score-ring text.value { font-size: 15px; font-weight: 600; }
    .score-ring text.band { font-size: 5.5px; fill: #64748B; }

    .brand-panel { background: ${brand}; color: ${onBrand}; border-radius: 4px; padding: 4mm 5mm; margin: 0 0 6mm; }
    .brand-panel h2 { border: 0; color: ${onBrand}; margin: 0 0 1.5mm; }
  `;
}

/**
 * Running header and footer for `page.pdf()`.
 *
 * ⚠️ Playwright renders these in an ISOLATED document with a default font-size
 * of ~0. Everything needs an explicit size and colour, and only the special
 * classes (`pageNumber`, `totalPages`, `title`) carry data across.
 */
export function headerTemplate(branding: Branding, title: string): string {
  return `<div style="width:100%;font-size:7pt;color:#94A3B8;font-family:Inter,Helvetica,Arial,sans-serif;padding:6mm 16mm 0;display:flex;justify-content:space-between;">
    <span>${escapeForTemplate(branding.companyName)}</span>
    <span>${escapeForTemplate(title)}</span>
  </div>`;
}

export function footerTemplate(footerText: string | null): string {
  const left = footerText ? escapeForTemplate(footerText) : "";
  return `<div style="width:100%;font-size:7pt;color:#94A3B8;font-family:Inter,Helvetica,Arial,sans-serif;padding:0 16mm 6mm;display:flex;justify-content:space-between;">
    <span>${left}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

/** These templates are raw HTML strings, so agency text has to be escaped here. */
function escapeForTemplate(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
