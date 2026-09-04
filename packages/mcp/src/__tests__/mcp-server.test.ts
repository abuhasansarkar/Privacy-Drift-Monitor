import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@pdm/database";
import { createMcpServer } from "../server";
import { TOOLS, executeTool } from "../tools";

describe("Model Context Protocol (MCP) Server", () => {
  it("registers all 5 required PDM tools with valid schemas", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();

    const toolNames = TOOLS.map((t) => t.name);
    expect(toolNames).toContain("pdm_list_websites");
    expect(toolNames).toContain("pdm_get_drift_timeline");
    expect(toolNames).toContain("pdm_inspect_issue_evidence");
    expect(toolNames).toContain("pdm_trigger_scan");
    expect(toolNames).toContain("pdm_generate_gtm_fix");
    expect(TOOLS).toHaveLength(5);

    for (const tool of TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  describe("executeTool handlers", () => {
    it("handles pdm_list_websites", async () => {
      const mockWebsites = [
        {
          id: "web-1",
          url: "https://client-a.test",
          label: "Client A",
          healthScore: 92,
          monitoringStatus: "ACTIVE",
          openIssueCount: 2,
          criticalIssueCount: 0,
          lastScanAt: new Date("2026-09-01T10:00:00Z"),
          agencyId: "agency-1",
        },
      ];

      const mockDb = {
        website: {
          findMany: vi.fn().mockResolvedValue(mockWebsites),
        },
      };

      const result = (await executeTool(
        "pdm_list_websites",
        { agencyId: "agency-1" },
        { db: mockDb as unknown as PrismaClient },
      )) as { websites: typeof mockWebsites };

      expect(mockDb.website.findMany).toHaveBeenCalled();
      expect(result.websites).toHaveLength(1);
      expect(result.websites[0]?.url).toBe("https://client-a.test");
      expect(result.websites[0]?.healthScore).toBe(92);
    });

    it("handles pdm_get_drift_timeline", async () => {
      const mockEvents = [
        {
          id: "drift-1",
          changeType: "TRACKER_ADDED",
          severity: "HIGH",
          summary: "New TikTok Pixel detected without user consent",
          addedItems: ["tiktok.com"],
          removedItems: [],
          detectedAt: new Date("2026-09-02T12:00:00Z"),
          previousScanId: "scan-1",
          currentScanId: "scan-2",
        },
      ];

      const mockDb = {
        privacyDriftEvent: {
          findMany: vi.fn().mockResolvedValue(mockEvents),
        },
      };

      const result = (await executeTool(
        "pdm_get_drift_timeline",
        { websiteId: "web-1", days: 14 },
        { db: mockDb as unknown as PrismaClient },
      )) as { websiteId: string; eventCount: number; events: typeof mockEvents };

      expect(mockDb.privacyDriftEvent.findMany).toHaveBeenCalled();
      expect(result.websiteId).toBe("web-1");
      expect(result.eventCount).toBe(1);
      expect(result.events[0]?.summary).toContain("TikTok");
    });

    it("handles pdm_inspect_issue_evidence", async () => {
      const mockIssue = {
        id: "issue-1",
        title: "TikTok Pixel fired before consent",
        message: "A network request to analytics.tiktok.com was observed prior to consent.",
        technicalReason: "Network request recorded during NO_CONSENT phase.",
        ruleId: "PDM-R001",
        severity: "CRITICAL",
        status: "OPEN",
        category: "TRACKER_WITHOUT_CONSENT",
        firstDetectedAt: new Date("2026-09-01T08:00:00Z"),
        lastSeenAt: new Date("2026-09-03T08:00:00Z"),
        website: { id: "web-1", url: "https://client-a.test" },
        evidence: [
          {
            id: "ev-1",
            kind: "NETWORK_REQUEST",
            pageUrl: "https://client-a.test/",
            consentPhase: "NO_CONSENT",
            observedAtMs: 340,
            detectionRuleId: "PDM-R001",
            confidence: 1.0,
            payload: { url: "https://analytics.tiktok.com/api/v2/pixel" },
            createdAt: new Date("2026-09-03T08:00:00Z"),
          },
        ],
      };

      const mockDb = {
        issue: {
          findUnique: vi.fn().mockResolvedValue(mockIssue),
        },
      };

      const result = (await executeTool(
        "pdm_inspect_issue_evidence",
        { issueId: "issue-1" },
        { db: mockDb as unknown as PrismaClient },
      )) as { issue: typeof mockIssue };

      expect(mockDb.issue.findUnique).toHaveBeenCalled();
      expect(result.issue.id).toBe("issue-1");
      expect(result.issue.evidence).toHaveLength(1);
      expect(result.issue.evidence[0]?.kind).toBe("NETWORK_REQUEST");
    });

    it("handles pdm_trigger_scan via database fallback", async () => {
      const mockDb = {
        website: {
          findUnique: vi.fn().mockResolvedValue({ id: "web-1", agencyId: "agency-1", url: "https://client-a.test" }),
        },
        scan: {
          create: vi.fn().mockResolvedValue({ id: "scan-new-123", status: "QUEUED" }),
        },
      };

      const result = (await executeTool(
        "pdm_trigger_scan",
        { websiteId: "web-1", priority: "HIGH" },
        { db: mockDb as unknown as PrismaClient },
      )) as { scanId: string; status: string };

      expect(mockDb.website.findUnique).toHaveBeenCalled();
      expect(mockDb.scan.create).toHaveBeenCalled();
      expect(result.scanId).toBe("scan-new-123");
      expect(result.status).toBe("QUEUED");
    });

    it("handles pdm_generate_gtm_fix", async () => {
      const mockIssue = {
        id: "issue-tiktok",
        title: "TikTok tracker active before consent",
        ruleId: "PDM-R001",
        category: "TRACKER_WITHOUT_CONSENT",
        evidence: [
          {
            kind: "NETWORK_REQUEST",
            payload: { url: "https://analytics.tiktok.com/i18n/pixel/events.js" },
          },
        ],
      };

      const mockDb = {
        issue: {
          findUnique: vi.fn().mockResolvedValue(mockIssue),
        },
      };

      const result = (await executeTool(
        "pdm_generate_gtm_fix",
        { issueId: "issue-tiktok" },
        { db: mockDb as unknown as PrismaClient },
      )) as {
        issueId: string;
        vendorName: string;
        category: string;
        remediationGuidance: string;
        gtmRecipe: {
          containerVersion: {
            container: {
              publicId: string;
            };
          };
        };
        cmpSnippets: Record<string, { codeSnippet: string; instructions: string }>;
      };

      expect(mockDb.issue.findUnique).toHaveBeenCalled();
      expect(result.issueId).toBe("issue-tiktok");
      expect(result.vendorName).toBe("analytics.tiktok.com");
      expect(result.category).toBe("MARKETING");
      expect(result.gtmRecipe).toBeDefined();
      expect(result.gtmRecipe.containerVersion.container.publicId).toBe("GTM-PDMFIX");
      expect(result.cmpSnippets).toBeDefined();
      expect(result.cmpSnippets.cookiebot).toBeDefined();
      expect(result.cmpSnippets.cookiebot?.codeSnippet).toContain("type=\"text/plain\"");
      expect(result.cmpSnippets.cookiebot?.codeSnippet).toContain("data-cookieconsent=\"marketing\"");
    });

    it("throws a descriptive error for unknown tools", async () => {
      await expect(
        executeTool("pdm_unknown_tool", {}, {}),
      ).rejects.toThrow("Unknown tool: pdm_unknown_tool");
    });
  });
});
