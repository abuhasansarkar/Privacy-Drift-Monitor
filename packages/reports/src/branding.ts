import { repositoriesFor } from "@pdm/database/repositories";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
  platformBranding,
  type Branding,
} from "@pdm/shared/branding";

/**
 * THE BRANDING RESOLVER — PLAN.md Part VI §6.9.
 *
 * ⚠️ THIS FILE IS THE CROSS-TENANT LEAKAGE CONTROL. §6.9, restated because it
 * is the single most expensive bug this phase can ship:
 *
 *     "A shared branding cache keyed by anything other than `agencyId` is how
 *      Agency A's logo ends up on Agency B's report."
 *
 * Three properties, all load-bearing, all asserted by
 * `__tests__/branding.test.ts` and by the concurrent-render integration test:
 *
 *   1. `resolveBranding(agencyId)` is the ONLY accessor. Templates never read
 *      the cache and never read the database.
 *   2. The cache key is EXACTLY `agencyId`. Not report id, not client id, not
 *      request — and the cache is never keyed on a composite that happens to
 *      contain the agency id, because the next composite will not.
 *   3. Every renderer takes `branding` as a REQUIRED PARAMETER. There is no
 *      module-level "current branding" and there must not be one — the second
 *      concurrent render in the same worker tick would inherit the first's.
 *
 * ⚠️ THE ENTITLEMENT IS ENFORCED HERE, NOT IN TEMPLATES (§6.9). When
 * `whiteLabel` is false the resolver returns our default brand regardless of
 * what is stored, so a template physically cannot render a brand the plan does
 * not include.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  branding: Branding;
  expiresAt: number;
}

/**
 * ⚠️ KEYED ONLY BY `agencyId`. If you are about to add anything else to this
 * key, the answer is a separate cache, not a composite key.
 *
 * §6.9 specifies Redis with a 5-minute TTL. A per-process map is used here
 * because it is strictly SAFER for the leakage property (nothing crosses a
 * process boundary), and because invalidation is already explicit —
 * `invalidateBranding` is called on save. The Redis form is a swap of this
 * object, not of the accessor.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Does this agency's plan include white-label?
 *
 * ⚠️ THE SINGLE PLACE THIS QUESTION IS ANSWERED. §6.9 puts the entitlement in
 * the resolver "not in each template" — and for a while it lived as a
 * hardcoded `whiteLabelEnabled: true` at seven call sites, which is the same
 * mistake with extra steps: seven places to forget, and no way to tell from a
 * call site whether the literal was a decision or a placeholder.
 *
 * ⚠️ NO SUBSCRIPTION MEANS NO ENTITLEMENT. Until billing lands (Phase 6) no
 * agency has a subscription row, so every agency currently renders with OUR
 * brand. That is the correct default in both directions: it is what an
 * unpaid-for feature should do, and it is what §9.3 sells — white-label starts
 * at Growth.
 */
export async function whiteLabelEntitlement(agencyId: string): Promise<boolean> {
  const repos = repositoriesFor(agencyId);
  const subscription = await repos.db.subscription.findFirst({
    where: { status: { in: ["ACTIVE", "TRIALING"] } },
    select: { plan: { select: { entitlements: true } } },
  });

  const entitlements = subscription?.plan?.entitlements;
  if (!entitlements || typeof entitlements !== "object") return false;
  return (entitlements as Record<string, unknown>).whiteLabel === true;
}

export interface ResolveOptions {
  /**
   * Plan entitlement. **Omit it** and the resolver looks it up — that is the
   * intended call. Pass it explicitly only in a test, or where the answer is
   * already known for a different reason.
   */
  whiteLabelEnabled?: boolean;
  /** Bypasses the cache — used by the settings live preview. */
  fresh?: boolean;
  now?: number;
}

export async function resolveBranding(
  agencyId: string,
  options: ResolveOptions = {},
): Promise<Branding> {
  if (!agencyId) {
    // Failing loudly beats rendering a default brand onto a document that was
    // supposed to be branded — the latter is a silent quality bug a customer
    // finds after they have sent it.
    throw new Error("resolveBranding() requires an agencyId");
  }

  const now = options.now ?? Date.now();

  if (!options.fresh) {
    const hit = cache.get(agencyId);
    /*
     * ⚠️ A cached entry is only reusable for the SAME entitlement answer. An
     * agency whose plan lapses mid-cache-window must not keep serving their own
     * brand for another five minutes — and one that upgrades should see the
     * change immediately, not after the TTL.
     */
    if (
      hit &&
      hit.expiresAt > now &&
      (options.whiteLabelEnabled === undefined ||
        hit.branding.isWhiteLabelled === options.whiteLabelEnabled)
    ) {
      // Returned by value. Handing out the cached object would let one
      // template's mutation reach every later render for that agency.
      return { ...hit.branding };
    }
  }

  const repos = repositoriesFor(agencyId);
  const [row, agency, entitled] = await Promise.all([
    repos.branding.find(),
    repos.branding.agencyProfile(),
    options.whiteLabelEnabled === undefined
      ? whiteLabelEntitlement(agencyId)
      : Promise.resolve(options.whiteLabelEnabled),
  ]);

  const agencyName = agency?.name ?? "";

  /*
   * ⚠️ `platformBranding`, NOT the agency's name. §6.9 puts the entitlement in
   * the resolver precisely so a template cannot render a brand it was never
   * handed — and "our default brand" means OURS, company name included. An
   * earlier version fell back to `defaultBranding(agencyId, agencyName)`, which
   * gave away the most visible half of a paid feature.
   */
  const branding: Branding = !entitled
    ? platformBranding(agencyId)
    : {
        agencyId,
        companyName: row?.companyName?.trim() || agencyName,
        logoLightUrl: row?.logoLightUrl ?? null,
        logoDarkUrl: row?.logoDarkUrl ?? null,
        primaryColor: row?.primaryColor || DEFAULT_PRIMARY_COLOR,
        accentColor: row?.accentColor || DEFAULT_ACCENT_COLOR,
        contactEmail: row?.contactEmail ?? null,
        contactPhone: row?.contactPhone ?? null,
        reportFooterText: row?.reportFooterText ?? null,
        customDisclaimer: row?.customDisclaimer ?? null,
        portalWelcomeText: row?.portalWelcomeText ?? null,
        isWhiteLabelled: true,
      };

  cache.set(agencyId, { branding, expiresAt: now + CACHE_TTL_MS });
  return { ...branding };
}

/** Called from the branding save action. Never called with anything but an agency id. */
export function invalidateBranding(agencyId: string): void {
  cache.delete(agencyId);
}

/** Tests only. Never call this to "fix" a live cache. */
export function resetBrandingCache(): void {
  cache.clear();
}

/**
 * Freezes branding onto a report at generation time (§6.8).
 *
 * ⚠️ WITHOUT THIS, REGENERATING LAST QUARTER'S REPORT PRODUCES A DOCUMENT THAT
 * DOES NOT MATCH THE ONE THE CLIENT ALREADY HAS. The snapshot is written once
 * and never refreshed.
 */
export function toBrandingSnapshot(branding: Branding): Record<string, unknown> {
  return { ...branding, snapshotVersion: 1 };
}

/** Reads a snapshot back, tolerating a row written by an older version. */
export function fromBrandingSnapshot(
  snapshot: unknown,
  fallback: Branding,
): Branding {
  if (!snapshot || typeof snapshot !== "object") return fallback;
  const raw = snapshot as Partial<Branding>;
  if (typeof raw.agencyId !== "string" || typeof raw.primaryColor !== "string") {
    return fallback;
  }
  return {
    agencyId: raw.agencyId,
    companyName: raw.companyName ?? fallback.companyName,
    logoLightUrl: raw.logoLightUrl ?? null,
    logoDarkUrl: raw.logoDarkUrl ?? null,
    primaryColor: raw.primaryColor,
    accentColor: raw.accentColor ?? fallback.accentColor,
    contactEmail: raw.contactEmail ?? null,
    contactPhone: raw.contactPhone ?? null,
    reportFooterText: raw.reportFooterText ?? null,
    customDisclaimer: raw.customDisclaimer ?? null,
    portalWelcomeText: raw.portalWelcomeText ?? null,
    isWhiteLabelled: raw.isWhiteLabelled ?? fallback.isWhiteLabelled,
  };
}
