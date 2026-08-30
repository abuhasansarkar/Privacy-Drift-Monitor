import "server-only";

/**
 * ENTITLEMENTS — Part IX §9.3, Phase 1 acceptance criterion.
 *
 * ⚠️ STUB. Real plan limits arrive with billing in Phase 6. What exists today is
 * the ENFORCEMENT POINT, which §12.3 requires from Phase 1: every place that
 * creates a website asks this module rather than inventing its own rule, so
 * Phase 6 fills in one function instead of hunting call sites.
 *
 * `null` means "no limit known", and every caller must treat it as *unknown*
 * rather than *unlimited* in what it SHOWS — the sidebar meter hides instead of
 * drawing a bar against a made-up denominator. Blocking behaviour stays off
 * until the real limits land; that is a deliberate, reviewed gap, not an
 * oversight.
 */

export interface Entitlements {
  /** Max monitored websites, or null while billing is not wired. */
  websiteLimit: number | null;
}

export async function getEntitlements(_agencyId: string): Promise<Entitlements> {
  return { websiteLimit: null };
}

/**
 * The gate `POST /api/websites` and the Add Website action call before creating.
 * Returns the reason to show rather than throwing, so the wizard can render an
 * upgrade prompt inline instead of an error boundary.
 */
export async function canAddWebsite(
  agencyId: string,
  currentCount: number,
): Promise<{ allowed: true } | { allowed: false; limit: number }> {
  const { websiteLimit } = await getEntitlements(agencyId);
  if (websiteLimit === null || currentCount < websiteLimit) {
    return { allowed: true };
  }
  return { allowed: false, limit: websiteLimit };
}
