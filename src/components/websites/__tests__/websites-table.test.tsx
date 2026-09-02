import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WebsitesTable } from "../websites-table";
import type { Column, Row } from "@/components/ui/data-list";

// Mock next/navigation useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe("WebsitesTable", () => {
  const columns: Column[] = [
    { key: "site", label: "Website" },
    { key: "health", label: "Health", align: "end" },
    { key: "lastScan", label: "Last scan" },
    { key: "issues", label: "Open potential issues" },
    { key: "frequency", label: "Frequency" },
    { key: "monitoring", label: "Monitoring" },
  ];

  const rows: Row[] = [
    {
      id: "site_1",
      href: "/app/websites/site_1",
      primary: "https://abuhasan.site",
      secondary: "AbuHasan",
      cells: {
        health: "68",
        lastScan: "7 hours ago",
        issues: "1 Critical",
        frequency: "Weekly",
        monitoring: "Active",
      },
    },
  ];

  it("renders the table exactly ONCE (no duplicate rendering)", () => {
    const html = renderToStaticMarkup(
      <WebsitesTable
        columns={columns}
        rows={rows}
        ids={["site_1"]}
        canUpdate={true}
        canArchive={true}
        canScan={true}
        clients={[]}
        groups={[]}
        footer={<div>Showing 1-1 / 1</div>}
      />,
    );

    // Count occurrences of <table in the generated HTML
    const tableMatches = html.match(/<table/g);
    expect(tableMatches).not.toBeNull();
    expect(tableMatches?.length).toBe(1);

    // Count occurrences of the column header "OPEN POTENTIAL ISSUES" or "Open potential issues"
    const headerMatches = html.match(/Open potential issues/g);
    expect(headerMatches?.length).toBe(2); // 1 in <table> thead, 1 in mobile stacked <dl>

    // Footer appears exactly once
    const footerMatches = html.match(/Showing 1-1 \/ 1/g);
    expect(footerMatches?.length).toBe(1);

    // The website URL appears
    expect(html).toContain("https://abuhasan.site");
    expect(html).toContain("AbuHasan");
  });
});
