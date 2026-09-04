import { CONSENT_PHASE_LABEL, EVIDENCE_KIND_LABEL } from "@/lib/labels";

/**
 * THE RECORDED EVIDENCE BEHIND ONE ISSUE, rendered on the issue itself.
 *
 * ⚠️ THIS REPLACES A BARE LINK, AND THE ORIGINAL REASONING IS WORTH ANSWERING
 * RATHER THAN DISCARDING. The issue page used to show only "View the scan that
 * recorded this →", on the grounds that "linking rather than duplicating keeps
 * ONE rendering of the evidence — a second, summarised copy here is a second
 * thing that can disagree with what was recorded."
 *
 * The risk it names is real; the remedy overshot. What follows is not a second
 * copy and not a summary: it renders `issue.evidence` — the SAME rows the page
 * has already loaded to build `evidenceLinks` and to derive the vendor name.
 * There is no second query and nothing derived that could drift, because there
 * is no second source. The link to the full scan stays, because this list is
 * deliberately the subset attached to THIS finding rather than everything the
 * scan saw.
 *
 * ⚠️ AND THE PAGE WITHOUT IT WAS THE WORSE FAILURE. This product's whole claim
 * is that a finding traces to something a browser actually observed. The screen
 * where an agency reads a finding — and from which they explain it to a client
 * — showed a severity, a sentence, and a hyperlink to the evidence somewhere
 * else. The claim was true and invisible.
 *
 * ⚠️ IT INTERPRETS NOTHING. Host, cookie name and storage key are read straight
 * out of the recorded payload; when a payload does not carry one, the row says
 * so rather than guessing (P6).
 */

export interface IssueEvidenceRow {
  id: string;
  kind: string;
  consentPhase: string;
  observedAtMs: number;
  payload: unknown;
}

interface EvidenceDetail {
  primary: string;
  secondary?: string;
  context?: string;
}

function parseEvidenceRow(row: IssueEvidenceRow): EvidenceDetail {
  if (typeof row.payload !== "object" || row.payload === null) {
    return { primary: "" };
  }
  const payload = row.payload as Record<string, unknown>;

  if (row.kind === "NETWORK_REQUEST") {
    const urlStr = typeof payload.url === "string" ? payload.url : "";
    if (urlStr) {
      try {
        const u = new URL(urlStr);
        return {
          primary: u.hostname,
          secondary: `${u.origin}${u.pathname}${u.search ? (u.search.length > 120 ? u.search.slice(0, 120) + "..." : u.search) : ""}`,
          context: typeof payload.method === "string" ? payload.method : undefined,
        };
      } catch {
        return { primary: urlStr };
      }
    }
  }

  if (row.kind === "COOKIE") {
    const name = typeof payload.name === "string" ? payload.name : "";
    const domain = typeof payload.domain === "string" ? payload.domain : "";
    return {
      primary: name || "cookie",
      secondary: domain ? `Domain: ${domain}` : undefined,
    };
  }

  if (row.kind === "STORAGE_ENTRY") {
    const key = typeof payload.key === "string" ? payload.key : "";
    const storageType = typeof payload.storageType === "string" ? payload.storageType : "";
    return {
      primary: key || "storage item",
      secondary: storageType ? `Type: ${storageType}` : undefined,
    };
  }

  for (const key of ["url", "name", "key", "host", "domain", "selector"]) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return { primary: value };
  }
  return { primary: "" };
}

/** Seconds from navigation start — comparable across scans, unlike wall-clock. */
function offset(observedAtMs: number): string {
  return `${(observedAtMs / 1000).toFixed(2)}s`;
}

export function IssueEvidenceList({
  rows,
  unknownSubjectLabel,
}: {
  rows: readonly IssueEvidenceRow[];
  /** Shown when a payload carries no identifying string — never a guess. */
  unknownSubjectLabel: string;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row) => {
        const detail = parseEvidenceRow(row);
        const displayPrimary = detail.primary || unknownSubjectLabel;
        return (
          <li
            key={row.id}
            className="flex flex-col gap-1.5 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-caption font-medium text-foreground">
                {EVIDENCE_KIND_LABEL[row.kind] ?? row.kind}
              </span>
              {detail.context ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {detail.context}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate font-mono text-mono font-medium text-foreground">
                {displayPrimary}
              </span>
              {/*
                The consent state is the single most important field in the
                system (§4.5) — a request is only meaningful paired with the
                state it happened under, so it is never dropped for space.
              */}
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                {CONSENT_PHASE_LABEL[row.consentPhase as keyof typeof CONSENT_PHASE_LABEL] ??
                  row.consentPhase}
              </span>
              <span className="shrink-0 font-mono text-caption tabular-nums text-muted-foreground">
                {offset(row.observedAtMs)}
              </span>
            </div>
            {detail.secondary ? (
              <div className="font-mono text-caption text-muted-foreground break-all pl-2 border-l-2 border-border/80">
                {detail.secondary}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
