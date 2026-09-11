import { forAgency } from "@pdm/database/tenant";
import { generateGtmRecipe, generateCmpSnippet, type SupportedCmp } from "@pdm/analysis";

/**
 * MCP TOOLS — tenant-scoped (F-002). **SECURITY-CRITICAL.**
 *
 * ⚠️ WHAT WAS HERE, AND WHY IT CANNOT STAY. The first version reached for
 * `unsafeGlobalClient("mcp-server")` whenever no injected `db` was present:
 *
 *   - `pdm_list_websites` with no `agencyId` argument returned the 100 most
 *     recent websites across EVERY agency — urls, health scores, issue
 *     counts, agency ids.
 *   - `pdm_get_drift_timeline` and `pdm_inspect_issue_evidence` resolved any
 *     websiteId/issueId globally; the evidence tool returned full recorded
 *     payloads (request URLs, cookie names, storage keys) for ANOTHER
 *     TENANT'S findings.
 *   - `pdm_trigger_scan`'s "direct database fallback" created a Scan row for
 *     any website id, on any agency's quota.
 *
 * That is product rule 4 — tenant isolation enforced at the data-access
 * layer — broken by a shippable surface. The fix is structural, not a patch
 * on each tool:
 *
 *   1. Every query runs through `forAgency(agencyId)` — the same extension
 *      that injects the tenant predicate on every operation, which is the
 *      layer the product's isolation contract names.
 *   2. The agencyId comes from ONE place: `resolveTenant()`, called at
 *      startup. A server started with a `PDM_API_KEY` resolves the key
 *      against the database and is pinned to that agency. No key, no boot —
 *      a stdio MCP server has no per-request credential, so "runs without a
 *      tenant" was never a valid mode.
 *   3. The direct-database scan fallback is GONE. Creating a scan row needs
 *      the queue, the quota ledger and the idempotency machinery the API
 *      route owns; a bare `scan.create` bypassed all three and silently
 *      burned a customer's quota.
 *
 * Tools that create nothing (`pdm_generate_gtm_fix`) still read through the
 * scoped client so even read paths cannot cross tenants.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "pdm_list_websites",
    description: "Returns a list of client websites, current health scores, monitoring statuses, and open potential issue counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "pdm_get_drift_timeline",
    description: "Fetches temporal privacy drift events, newly detected trackers, and cookie modifications for a website.",
    inputSchema: {
      type: "object",
      properties: {
        websiteId: {
          type: "string",
          description: "The UUID of the website",
        },
        days: {
          type: "number",
          description: "Lookback window in days (default: 30)",
        },
      },
      required: ["websiteId"],
    },
  },
  {
    name: "pdm_inspect_issue_evidence",
    description: "Returns technical evidence traces (requests, initiating domains, cookies, and consent phases) for a finding.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The UUID of the issue to inspect",
        },
      },
      required: ["issueId"],
    },
  },
  {
    name: "pdm_trigger_scan",
    description:
      "Dispatches an on-demand verification scan for a website via the public API and returns the queued scan ID. Requires PDM_API_URL and PDM_API_KEY to be configured.",
    inputSchema: {
      type: "object",
      properties: {
        websiteId: {
          type: "string",
          description: "The UUID of the website to scan",
        },
        priority: {
          type: "string",
          enum: ["LOW", "NORMAL", "HIGH"],
          description: "Scan priority queue level (default: NORMAL)",
        },
      },
      required: ["websiteId"],
    },
  },
  {
    name: "pdm_generate_gtm_fix",
    description: "Generates copy-pasteable Google Tag Manager trigger JSON and CMP wrapper code to remediate an unconsented tracking issue.",
    inputSchema: {
      type: "object",
      properties: {
        issueId: {
          type: "string",
          description: "The UUID of the issue needing remediation",
        },
      },
      required: ["issueId"],
    },
  },
];

export interface ToolContext {
  /**
   * ⚠️ THE TENANT THE WHOLE SERVER IS PINNED TO (F-002). Resolved once at
   * startup from `PDM_API_KEY` (or injected by a host that has already
   * authenticated). Absent, the tools throw — they never fall back to a
   * global client.
   */
  agencyId: string;
  apiUrl?: string;
  apiKey?: string;
}

/**
 * Resolves the server's single tenant from its API key at startup.
 *
 * The key is the SAME `pdm_live_` credential the public API v1 authenticates;
 * resolving it against the database here gives the MCP server the same
 * identity, expiry and agency-status checks without duplicating them.
 *
 * ⚠️ THROWS WHEN THE KEY IS ABSENT OR INVALID. An MCP server that "runs
 * fine" without credentials is the failure mode F-002 exists to prevent.
 */
export async function resolveTenant(deps: {
  apiKey: string | undefined;
  lookup: (keyHash: string) => Promise<{ agencyId: string } | null>;
}): Promise<ToolContext> {
  const apiKey = deps.apiKey;
  if (!apiKey || !apiKey.startsWith("pdm_live_") || apiKey.length < 20) {
    throw new Error(
      "PDM_API_KEY is missing or malformed. The MCP server is tenant-scoped by design " +
        "and refuses to start without a valid pdm_live_ API key.",
    );
  }

  const { createHash } = await import("node:crypto");
  const keyHash = createHash("sha256").update(apiKey).digest("hex");
  const resolved = await deps.lookup(keyHash);
  if (!resolved) {
    throw new Error(
      "PDM_API_KEY does not match any active API key. Refusing to start without a tenant.",
    );
  }
  return { agencyId: resolved.agencyId, apiKey };
}

export async function handleListWebsites(
  _args: Record<string, never>,
  ctx: ToolContext,
) {
  const db = forAgency(ctx.agencyId);
  const websites = await db.website.findMany({
    where: {
      archivedAt: null,
      agencyId: ctx.agencyId,
    },
    select: {
      id: true,
      url: true,
      label: true,
      healthScore: true,
      monitoringStatus: true,
      openIssueCount: true,
      criticalIssueCount: true,
      lastScanAt: true,
      agencyId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return { websites };
}

export async function handleGetDriftTimeline(
  args: { websiteId: string; days?: number },
  ctx: ToolContext,
) {
  const db = forAgency(ctx.agencyId);
  const days = args.days && args.days > 0 ? args.days : 30;
  const since = new Date(Date.now() - days * 86_400_000);

  // `forAgency` injects the agency predicate; a websiteId from another tenant
  // matches zero rows rather than returning its drift feed.
  const events = await db.privacyDriftEvent.findMany({
    where: {
      websiteId: args.websiteId,
      agencyId: ctx.agencyId,
      detectedAt: { gte: since },
    },
    select: {
      id: true,
      changeType: true,
      severity: true,
      summary: true,
      addedItems: true,
      removedItems: true,
      detectedAt: true,
      previousScanId: true,
      currentScanId: true,
    },
    orderBy: { detectedAt: "desc" },
  });

  return {
    websiteId: args.websiteId,
    lookbackDays: days,
    eventCount: events.length,
    events,
  };
}

export async function handleInspectIssueEvidence(
  args: { issueId: string },
  ctx: ToolContext,
) {
  const db = forAgency(ctx.agencyId);
  const issue = await db.issue.findFirst({
    where: { id: args.issueId, agencyId: ctx.agencyId },
    select: {
      id: true,
      title: true,
      message: true,
      technicalReason: true,
      ruleId: true,
      severity: true,
      status: true,
      category: true,
      firstDetectedAt: true,
      lastSeenAt: true,
      website: {
        select: { id: true, url: true },
      },
      evidence: {
        select: {
          id: true,
          kind: true,
          pageUrl: true,
          consentPhase: true,
          observedAtMs: true,
          detectionRuleId: true,
          confidence: true,
          payload: true,
          createdAt: true,
        },
        take: 50,
      },
    },
  });

  if (!issue) {
    // "Not found", never "belongs to someone else" — the same convention the
    // API uses (a 403 would confirm the id exists in another tenant).
    throw new Error(`Issue not found: ${args.issueId}`);
  }

  return { issue };
}

export async function handleTriggerScan(
  args: { websiteId: string; priority?: "LOW" | "NORMAL" | "HIGH" },
  ctx: ToolContext,
) {
  const apiUrl = ctx.apiUrl ?? process.env.PDM_API_URL;
  const apiKey = ctx.apiKey ?? process.env.PDM_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error(
      "pdm_trigger_scan requires PDM_API_URL and PDM_API_KEY. Scan creation runs through " +
        "the public API so quota, idempotency and the queue are enforced; there is no " +
        "direct-database fallback.",
    );
  }

  const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/v1/websites/${args.websiteId}/scans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      trigger: "MANUAL",
      priority: args.priority ?? "NORMAL",
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    data?: unknown;
  } | null;

  if (!res.ok) {
    throw new Error(`API Error triggering scan: ${data?.error?.message ?? res.statusText}`);
  }
  return data?.data;
}

export async function handleGenerateGtmFix(
  args: { issueId: string },
  ctx: ToolContext,
) {
  const db = forAgency(ctx.agencyId);
  const issue = await db.issue.findFirst({
    where: { id: args.issueId, agencyId: ctx.agencyId },
    select: {
      id: true,
      title: true,
      ruleId: true,
      category: true,
      evidence: {
        take: 10,
        select: { kind: true, payload: true },
      },
    },
  });

  if (!issue) {
    throw new Error(`Issue not found: ${args.issueId}`);
  }

  // Derive vendorName and category
  let vendorName = "Marketing Tracker";
  const reqEvidence = issue.evidence.find((e) => e.kind === "NETWORK_REQUEST");
  const cookieEvidence = issue.evidence.find((e) => e.kind === "COOKIE");

  if (reqEvidence && typeof reqEvidence.payload === "object" && reqEvidence.payload !== null) {
    const url = (reqEvidence.payload as Record<string, unknown>).url;
    if (typeof url === "string") {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (host) vendorName = host;
      } catch {
        // ignore
      }
    }
  } else if (cookieEvidence && typeof cookieEvidence.payload === "object" && cookieEvidence.payload !== null) {
    const domain = (cookieEvidence.payload as Record<string, unknown>).domain;
    if (typeof domain === "string") {
      const d = domain.replace(/^\./, "").replace(/^www\./, "");
      if (d) vendorName = d;
    }
  } else if (issue.title) {
    const firstWord = issue.title.split(" ")[0];
    if (firstWord && firstWord.length > 2 && !["Tracker", "Cookie", "Consent", "Unknown"].includes(firstWord)) {
      vendorName = firstWord;
    }
  }

  const categoryMap: Record<string, "MARKETING" | "ANALYTICS" | "ADVERTISING" | "FUNCTIONAL"> = {
    TRACKER_WITHOUT_CONSENT: "MARKETING",
    COOKIE_WITHOUT_CONSENT: "ANALYTICS",
    STORAGE_WITHOUT_CONSENT: "FUNCTIONAL",
    FINGERPRINTING: "MARKETING",
    CLOAKING: "ADVERTISING",
    GPC_SIGNAL_IGNORED: "MARKETING",
    SESSION_REPLAY_ACTIVE: "ANALYTICS",
  };
  const category = categoryMap[issue.category] ?? "MARKETING";

  const gtmRecipe = generateGtmRecipe({
    vendorName,
    category,
    containerName: `PDM Fix — ${vendorName}`,
  });

  const supportedCmps: SupportedCmp[] = ["cookiebot", "onetrust", "usercentrics", "termly"];
  const cmpSnippets: Record<string, { codeSnippet: string; instructions: string }> = {};
  for (const cmp of supportedCmps) {
    cmpSnippets[cmp] = generateCmpSnippet({ cmp, vendorName, category });
  }

  return {
    issueId: issue.id,
    vendorName,
    category,
    remediationGuidance: `To stop ${vendorName} from firing before user consent, import the generated GTM Recipe into Google Tag Manager or wrap the inline script tag with your CMP gating attributes.`,
    gtmRecipe,
    cmpSnippets,
  };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "pdm_list_websites":
      return handleListWebsites(args as Record<string, never>, ctx);
    case "pdm_get_drift_timeline":
      return handleGetDriftTimeline(args as { websiteId: string; days?: number }, ctx);
    case "pdm_inspect_issue_evidence":
      return handleInspectIssueEvidence(args as { issueId: string }, ctx);
    case "pdm_trigger_scan":
      return handleTriggerScan(args as { websiteId: string; priority?: "LOW" | "NORMAL" | "HIGH" }, ctx);
    case "pdm_generate_gtm_fix":
      return handleGenerateGtmFix(args as { issueId: string }, ctx);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
