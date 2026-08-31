/**
 * BRANDING VALUE TYPE AND CONTRAST VALIDATION — PLAN.md Part VI §6.9, XI §11.6.
 *
 * Lives in `shared` because FOUR surfaces consume it — PDF reports, the client
 * portal, client-facing emails and shared report links — and they live in three
 * different packages plus the app. The RESOLVER (which reads the database,
 * applies the entitlement and caches) is `packages/reports/src/branding.ts`;
 * this file is only the shape and the rules.
 *
 * ⚠️ THE AGENCY APP ITSELF IS NEVER WHITE-LABELLED (§6.9). Agency staff use our
 * brand. Only client-facing surfaces resolve branding, which is what keeps this
 * out of the app shell and out of a custom-domain requirement in v1.
 */

export interface Branding {
  agencyId: string;
  companyName: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  accentColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  reportFooterText: string | null;
  /** Appended to the base disclaimer, never replacing it (§6.8). */
  customDisclaimer: string | null;
  portalWelcomeText: string | null;
  /** False when the plan does not include white-label — our brand is used. */
  isWhiteLabelled: boolean;
}

export const DEFAULT_PRIMARY_COLOR = "#2563EB";
export const DEFAULT_ACCENT_COLOR = "#0EA5E9";

/**
 * ⚠️ THE BASE DISCLAIMER IS NOT CUSTOMISABLE AND APPEARS ON EVERY PDF, portal
 * page and client-facing email (§6.8). "Positioned as legal compliance and sued
 * over a missed issue" is a named risk in §12.7; this sentence and the
 * terminology gate are the mitigation, so an agency may APPEND to it but never
 * replace it.
 */
export const BASE_DISCLAIMER =
  "This report describes technical behaviour observed by an automated browser " +
  "scan at a point in time. It is technical monitoring, not legal advice, and " +
  "it does not determine your regulatory position. Findings may require review " +
  "by your privacy advisor.";

export const METHODOLOGY_NOTE =
  "Each website is loaded in a headless Chromium browser from the EU. Four " +
  "consent journeys are tested — no interaction, Reject All, Accept All and " +
  "withdrawal — and every network request, cookie and storage write is recorded " +
  "against the consent state it happened under.";

/** The brand used when white-label is off, or when nothing has been saved. */
export function defaultBranding(agencyId: string, agencyName: string): Branding {
  return {
    agencyId,
    companyName: agencyName,
    logoLightUrl: null,
    logoDarkUrl: null,
    primaryColor: DEFAULT_PRIMARY_COLOR,
    accentColor: DEFAULT_ACCENT_COLOR,
    contactEmail: null,
    contactPhone: null,
    reportFooterText: null,
    customDisclaimer: null,
    portalWelcomeText: null,
    isWhiteLabelled: false,
  };
}

// ── WCAG contrast (§11.6) ────────────────────────────────────────────────────

/** Surfaces a brand colour is placed against. Both must pass, or the report is unreadable. */
export const CONTRAST_SURFACES = {
  /** Report and portal page background. */
  white: "#FFFFFF",
  /** Our neutral surface — cards, table headers. */
  neutral: "#F8FAFC",
} as const;

/** WCAG 2.2 AA for normal-size text. */
export const AA_NORMAL_TEXT = 4.5;
/** WCAG 2.2 AA for large text and UI components — what a brand accent is used for. */
export const AA_LARGE_TEXT = 3;

export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = Number.parseInt(match[1] as string, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** WCAG relative luminance. The 0.03928 branch is the sRGB linearisation, not a fudge. */
export function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  );
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return ((lighter as number) + 0.05) / ((darker as number) + 0.05);
}

export interface ContrastCheck {
  passes: boolean;
  /** Rounded to 2dp for display next to the colour field. */
  ratio: number;
  against: string;
  required: number;
}

/**
 * Validates one brand colour against both surfaces.
 *
 * ⚠️ REJECTED AT SAVE TIME, NOT AT RENDER TIME (§6.9). A pale yellow accepted
 * into the database produces an unreadable PDF that the agency has already
 * emailed to their client before anyone notices — and the fix then means
 * regenerating documents that are already out in the world.
 */
export function checkBrandColor(
  hex: string,
  required: number = AA_LARGE_TEXT,
): { valid: boolean; checks: ContrastCheck[] } {
  const checks: ContrastCheck[] = [];
  for (const [name, surface] of Object.entries(CONTRAST_SURFACES)) {
    const ratio = contrastRatio(hex, surface);
    if (ratio === null) {
      return { valid: false, checks: [] };
    }
    checks.push({
      passes: ratio >= required,
      ratio: Math.round(ratio * 100) / 100,
      against: name,
      required,
    });
  }
  return { valid: checks.every((check) => check.passes), checks };
}

/**
 * Text colour to place ON the brand colour (a button label, a cover panel).
 *
 * Picked by contrast rather than by a lightness threshold, because a mid-tone
 * brand blue is a coin flip on the threshold and a clear winner on the ratio.
 */
export function readableTextOn(background: string): "#FFFFFF" | "#0F172A" {
  const onWhite = contrastRatio("#FFFFFF", background) ?? 0;
  const onInk = contrastRatio("#0F172A", background) ?? 0;
  return onWhite >= onInk ? "#FFFFFF" : "#0F172A";
}
