import { unsafeGlobalClient } from "@pdm/database";
import { generateGtmRecipe, generateCmpSnippet, type SupportedCmp } from "@pdm/analysis";
import type { PrismaClient } from "@pdm/database";

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
      properties: {
        agencyId: {
          type: "string",
          description: "Optional agency ID to filter websites by tenant",
        },
      },
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
    description: "Dispatches an on-demand verification scan for a website and returns the queued scan ID.",
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
          description: "Scan priority queue level (default: HIGH)",
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
  db?: PrismaClient;
  apiUrl?: string;
  apiKey?: string;
}

function getDatabase(ctx?: ToolContext): PrismaClient {
  return ctx?.db ?? (unsafeGlobalClient("mcp-server") as unknown as PrismaClient);
}

export async function handleListWebsites(
  args: { agencyId?: string },
  ctx?: ToolContext,
) {
  const db = getDatabase(ctx);
  const websites = await db.website.findMany({
    where: {
      archivedAt: null,
      ...(args.agencyId ? { agencyId: args.agencyId } : {}),
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
  ctx?: ToolContext,
) {
  const db = getDatabase(ctx);
  const days = args.days && args.days > 0 ? args.days : 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const events = await db.privacyDriftEvent.findMany({
    where: {
      websiteId: args.websiteId,
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
  ctx?: ToolContext,
) {
  const db = getDatabase(ctx);
  const issue = await db.issue.findUnique({
    where: { id: args.issueId },
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
    throw new Error(`Issue not found: ${args.issueId}`);
  }

  return { issue };
}

export async function handleTriggerScan(
  args: { websiteId: string; priority?: "LOW" | "NORMAL" | "HIGH" },
  ctx?: ToolContext,
) {
  const apiUrl = ctx?.apiUrl ?? process.env.PDM_API_URL;
  const apiKey = ctx?.apiKey ?? process.env.PDM_API_KEY;

  if (apiUrl && apiKey) {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/v1/websites/${args.websiteId}/scans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trigger: "MCP_TRIGGERED",
        priority: args.priority ?? "HIGH",
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

  // Direct database fallback
  const db = getDatabase(ctx);
  const site = await db.website.findUnique({
    where: { id: args.websiteId },
    select: { id: true, agencyId: true },
  });

  if (!site) {
    throw new Error(`Website not found: ${args.websiteId}`);
  }

  const scan = await db.scan.create({
    data: {
      agencyId: site.agencyId,
      websiteId: site.id,
      trigger: "MANUAL",
      status: "QUEUED",
      scannerVersion: "3.0.0",
    },
    select: { id: true, status: true },
  });

  return {
    scanId: scan.id,
    websiteId: site.id,
    status: scan.status,
    message: "Scan has been enqueued successfully",
  };
}

export async function handleGenerateGtmFix(
  args: { issueId: string },
  ctx?: ToolContext,
) {
  const db = getDatabase(ctx);
  const issue = await db.issue.findUnique({
    where: { id: args.issueId },
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
  ctx?: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "pdm_list_websites":
      return handleListWebsites(args as { agencyId?: string }, ctx);
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
