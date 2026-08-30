import "server-only";
import { repositoriesFor } from "@pdm/database/repositories";
import { normalizeWebsiteUrl, UrlNormalizationError } from "@pdm/shared/url/normalize";
import type { AgencyContext } from "@/server/auth/context";

/**
 * CSV IMPORT — §3.6, UI_DESIGN_PROMPTS §5.5, Phase 1 task 1.6.
 *
 * ⚠️ PREVIEW BEFORE IMPORT, ALWAYS. §5.5 shows every row with a status chip
 * because a bulk import is the one operation where a small mistake is
 * expensive: a mis-mapped column silently monitors forty wrong addresses and
 * burns forty browser slots a night. The user sees exactly what will happen
 * before anything is written.
 *
 * ⚠️ THE SSRF GUARD STILL RUNS PER ROW, at import time. This module normalizes
 * and de-duplicates — it does NOT decide that an address is safe to fetch.
 * `createWebsite()` re-runs the full chain for every row, because a CSV is
 * caller-supplied input like any other (§10.3).
 */

export type RowStatus = "ready" | "duplicate" | "invalid" | "client-new";

export interface PreviewRow {
  line: number;
  rawUrl: string;
  normalizedUrl: string | null;
  clientName: string | null;
  status: RowStatus;
  /** Shown verbatim in the preview table. */
  message: string | null;
}

export interface ImportPreview {
  rows: PreviewRow[];
  ready: number;
  warnings: number;
  errors: number;
}

/** The header the template ships with. Column order is not significant. */
export const CSV_TEMPLATE = "url,client,label\nhttps://www.example.com,Acme Ltd,Main site\n";

/**
 * A deliberately small CSV reader.
 *
 * Handles quoted fields and embedded commas, which is all a website list needs.
 * A full RFC-4180 parser (escaped quotes, embedded newlines) is a dependency
 * for a format we also generate — and the template is the documented shape.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    rows.push(cells);
  }
  return rows;
}

export async function previewCsv(
  ctx: AgencyContext,
  text: string,
): Promise<ImportPreview> {
  const parsed = parseCsv(text);
  if (parsed.length === 0) {
    return { rows: [], ready: 0, warnings: 0, errors: 0 };
  }

  // Header is matched by NAME, not position — a spreadsheet round-trip
  // reorders columns and a positional reader then imports the label as a URL.
  const header = parsed[0]!.map((cell) => cell.toLowerCase());
  const urlIndex = header.indexOf("url");
  const clientIndex = header.indexOf("client");

  if (urlIndex === -1) {
    return {
      rows: [
        {
          line: 1,
          rawUrl: "",
          normalizedUrl: null,
          clientName: null,
          status: "invalid",
          message: "No 'url' column found in the header row.",
        },
      ],
      ready: 0,
      warnings: 0,
      errors: 1,
    };
  }

  const repos = repositoriesFor(ctx.agencyId);
  const [existing, clients] = await Promise.all([
    repos.db.website.findMany({ where: { archivedAt: null }, select: { url: true } }),
    repos.db.client.findMany({ where: { archivedAt: null }, select: { name: true } }),
  ]);

  const existingUrls = new Set(existing.map((website) => website.url));
  const clientNames = new Set(clients.map((client) => client.name.toLowerCase()));
  // Duplicates WITHIN the file are caught too — the same address twice in one
  // upload would otherwise create two rows and two nightly scans.
  const seenInFile = new Set<string>();

  const rows: PreviewRow[] = parsed.slice(1).map((cells, index) => {
    const line = index + 2;
    const rawUrl = cells[urlIndex] ?? "";
    const clientName = clientIndex === -1 ? null : (cells[clientIndex] ?? null) || null;

    if (rawUrl === "") {
      return {
        line,
        rawUrl,
        normalizedUrl: null,
        clientName,
        status: "invalid",
        message: "Empty address.",
      };
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeWebsiteUrl(rawUrl).url;
    } catch (error) {
      return {
        line,
        rawUrl,
        normalizedUrl: null,
        clientName,
        status: "invalid",
        message:
          error instanceof UrlNormalizationError
            ? error.userMessage
            : "This address could not be read.",
      };
    }

    if (existingUrls.has(normalizedUrl) || seenInFile.has(normalizedUrl)) {
      return {
        line,
        rawUrl,
        normalizedUrl,
        clientName,
        status: "duplicate",
        message: "Already monitored — this row will be skipped.",
      };
    }
    seenInFile.add(normalizedUrl);

    if (clientName && !clientNames.has(clientName.toLowerCase())) {
      return {
        line,
        rawUrl,
        normalizedUrl,
        clientName,
        status: "client-new",
        message: "This client will be created.",
      };
    }

    return {
      line,
      rawUrl,
      normalizedUrl,
      clientName,
      status: "ready",
      message: null,
    };
  });

  return {
    rows,
    ready: rows.filter((row) => row.status === "ready" || row.status === "client-new")
      .length,
    warnings: rows.filter((row) => row.status === "client-new" || row.status === "duplicate")
      .length,
    errors: rows.filter((row) => row.status === "invalid").length,
  };
}
