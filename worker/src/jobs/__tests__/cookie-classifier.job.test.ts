import { describe, expect, it, vi } from "vitest";
import { runCookieClassification } from "../cookie-classifier.job";

describe("Cookie Classifier Worker Job (Phase 17)", () => {
  it("returns zero counts when no unclassified cookies exist", async () => {
    const mockDb = {
      cookieRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const result = await runCookieClassification(
      {
        agencyId: "agency-1",
        websiteId: "site-1",
        scanId: "scan-1",
      },
      { db: mockDb },
    );

    expect(result.totalProcessed).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(mockDb.cookieRecord.updateMany).not.toHaveBeenCalled();
  });

  it("classifies cookies and updates database records", async () => {
    const mockDb = {
      cookieRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "c-1",
            name: "_pk_id.1.abcd",
            domain: "example.com",
            durationDays: 365,
          },
          {
            id: "c-2",
            name: "_pk_id.1.abcd", // duplicate cookie on another path
            domain: "example.com",
            durationDays: 365,
          },
          {
            id: "c-3",
            name: "custom_tracker_id",
            domain: "ads.example.com",
            durationDays: 30,
          },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockClassifier = vi.fn().mockImplementation(async ({ name }) => {
      if (name === "custom_tracker_id") {
        return {
          category: "ADVERTISING",
          vendorName: "CustomAdNetwork",
          purpose: "Ad conversion tracking",
          confidence: 0.9,
        };
      }
      return {
        category: "ANALYTICS",
        vendorName: "Matomo",
        purpose: "Site metrics",
        confidence: 0.95,
      };
    });

    const result = await runCookieClassification(
      {
        agencyId: "agency-1",
        websiteId: "site-1",
        scanId: "scan-1",
      },
      {
        db: mockDb,
        classifier: mockClassifier,
      },
    );

    expect(result.totalProcessed).toBe(3);
    expect(result.updatedCount).toBe(3);

    expect(mockDb.cookieRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["c-1", "c-2"] },
        }),
        data: {
          category: "ANALYTICS",
          trackerVendorId: "Matomo",
        },
      }),
    );

    expect(mockDb.cookieRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["c-3"] },
        }),
        data: {
          category: "ADVERTISING",
          trackerVendorId: "CustomAdNetwork",
        },
      }),
    );
  });
});
