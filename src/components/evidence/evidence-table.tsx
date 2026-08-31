import { t } from "@pdm/shared/copy";
import { CONSENT_PHASE_LABEL } from "@pdm/shared/copy/labels";
import { MutedBadge, StatusBadge } from "@/components/ui/severity-badge";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";

/**
 * THE EVIDENCE TABLES — UI_DESIGN_PROMPTS §5.11.
 *
 * Five shapes behind one component, because they share the density rules that
 * make this tab work: monospace values, 32px rows, right-aligned numerics, and
 * a horizontal scroll container so a long URL never widens the page.
 *
 * ⚠️ VALUES ARE ABSENT, NOT TRUNCATED. Cookie and storage values were never
 * stored (§10.6) — the columns show a hash and a length, and say so. Rendering
 * an empty cell would read as "this cookie had no value".
 *
 * ⚠️ "BEFORE CONSENT" IS A CHIP WITH A WORD (§11.6). §5.11 draws it red; the
 * colour is the second signal, and the text carries the meaning on its own.
 */

type Row =
  | { kind: "requests"; items: readonly RequestRow[] }
  | { kind: "cookies"; items: readonly CookieRow[] }
  | { kind: "storage"; items: readonly StorageRow[] }
  | { kind: "console"; items: readonly ConsoleRow[] }
  | { kind: "screenshots"; items: readonly ScreenshotRow[] };

interface RequestRow {
  id: string;
  timestampMs: number;
  method: string;
  url: string;
  host: string;
  resourceType: string;
  status: number | null;
  failureText: string | null;
  transferSize: number | null;
  isThirdParty: boolean;
  consentPhase: keyof typeof CONSENT_PHASE_LABEL;
  trackerVendorId: string | null;
  initiatorType: string | null;
}

interface CookieRow {
  id: string;
  name: string;
  domain: string;
  path: string;
  isSession: boolean;
  durationDays: number | null;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
  isThirdParty: boolean;
  valueLength: number | null;
  consentPhase: keyof typeof CONSENT_PHASE_LABEL;
}

interface StorageRow {
  id: string;
  storageType: string;
  key: string;
  origin: string;
  valueLength: number | null;
  consentPhase: keyof typeof CONSENT_PHASE_LABEL;
}

interface ConsoleRow {
  id: string;
  level: string;
  message: string;
  source: string | null;
  createdAt: Date;
}

interface ScreenshotRow {
  id: string;
  consentPhase: keyof typeof CONSENT_PHASE_LABEL;
  kind: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}

const CELL = "whitespace-nowrap px-3 py-1.5 align-top";
const HEAD =
  "whitespace-nowrap px-3 py-2 text-start text-caption font-semibold uppercase tracking-wide text-muted-foreground";

export function EvidenceTable({
  rows,
  timezone,
  page,
  perPage,
  total,
  params,
}: {
  rows: Row;
  timezone: string;
  page: number;
  perPage: number;
  total: number;
  params: Record<string, string | string[] | undefined>;
}) {
  return (
    <div>
      {/* Horizontal scroll lives HERE, not on the page: a 300-character URL
          must not make the whole layout scroll sideways (§11.5). */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-small">
          <caption className="sr-only">{t("evidence.title")}</caption>
          {rows.kind === "requests" ? <Requests items={rows.items} /> : null}
          {rows.kind === "cookies" ? <Cookies items={rows.items} /> : null}
          {rows.kind === "storage" ? <Storage items={rows.items} /> : null}
          {rows.kind === "console" ? <Console items={rows.items} timezone={timezone} /> : null}
          {rows.kind === "screenshots" ? <Screenshots items={rows.items} /> : null}
        </table>
      </div>

      {rows.kind !== "screenshots" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
          <Pagination page={page} perPage={perPage} total={total} params={params} />
        </div>
      ) : null}
    </div>
  );
}

function PhaseChip({ phase }: { phase: keyof typeof CONSENT_PHASE_LABEL }) {
  // NO_CONSENT is the one that matters: it means this happened before anyone
  // was asked. It gets the warning tone AND the explicit words.
  return phase === "NO_CONSENT" ? (
    <StatusBadge tone="danger" label={t("evidence.beforeConsent")} />
  ) : (
    <MutedBadge>{CONSENT_PHASE_LABEL[phase]}</MutedBadge>
  );
}

function Requests({ items }: { items: readonly RequestRow[] }) {
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, "text-end")}>{t("evidence.columnTime")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnMethod")}</th>
          <th scope="col" className={cn(HEAD, "w-full")}>{t("evidence.columnUrl")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnType")}</th>
          <th scope="col" className={cn(HEAD, "text-end")}>{t("evidence.columnStatus")}</th>
          <th scope="col" className={cn(HEAD, "text-end")}>{t("evidence.columnSize")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnParty")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnPhase")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((request) => (
          <tr
            key={request.id}
            className={cn(
              "border-t border-border",
              request.consentPhase === "NO_CONSENT" && request.isThirdParty && "bg-danger-muted/40",
            )}
          >
            <td className={cn(CELL, "text-end font-mono text-mono tabular-nums text-muted-foreground")}>
              {formatNumber(request.timestampMs)}ms
            </td>
            <td className={cn(CELL, "font-mono text-mono")}>{request.method}</td>
            <td className={cn(CELL, "max-w-0 truncate font-mono text-mono")} title={request.url}>
              {request.url}
              {request.initiatorType ? (
                <span className="ms-2 text-caption text-muted-foreground">
                  ← {request.initiatorType}
                </span>
              ) : null}
            </td>
            <td className={CELL}>
              <MutedBadge>{request.resourceType}</MutedBadge>
            </td>
            <td className={cn(CELL, "text-end font-mono text-mono tabular-nums")}>
              {request.status ?? (request.failureText ? "—" : "")}
            </td>
            <td className={cn(CELL, "text-end tabular-nums text-muted-foreground")}>
              {request.transferSize === null ? "" : formatBytes(request.transferSize)}
            </td>
            <td className={CELL}>
              {request.isThirdParty ? (
                <MutedBadge>{t("evidence.thirdParty")}</MutedBadge>
              ) : (
                <span className="text-caption text-muted-foreground">
                  {t("evidence.firstParty")}
                </span>
              )}
            </td>
            <td className={CELL}>
              <PhaseChip phase={request.consentPhase} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

function Cookies({ items }: { items: readonly CookieRow[] }) {
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, "w-full")}>{t("cookies.columnName")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnOrigin")}</th>
          <th scope="col" className={HEAD}>{t("cookies.columnExpiry")}</th>
          <th scope="col" className={HEAD}>{t("cookies.columnFlags")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnValue")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnPhase")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((cookie) => (
          <tr key={cookie.id} className="border-t border-border">
            <td className={cn(CELL, "font-mono text-mono")}>{cookie.name}</td>
            <td className={cn(CELL, "font-mono text-mono text-muted-foreground")}>
              {cookie.domain}
              {cookie.path !== "/" ? cookie.path : ""}
            </td>
            <td className={cn(CELL, "text-muted-foreground")}>
              {cookie.isSession
                ? t("cookies.session")
                : `${formatNumber(cookie.durationDays ?? 0)} ${t("cookies.days")}`}
            </td>
            <td className={cn(CELL, "font-mono text-mono text-muted-foreground")}>
              {[
                cookie.secure ? "Secure" : null,
                cookie.httpOnly ? "HttpOnly" : null,
                cookie.sameSite,
              ]
                .filter(Boolean)
                .join(" ")}
            </td>
            <td className={cn(CELL, "text-caption text-muted-foreground")}>
              {/* §10.6: the value was never stored. Saying so beats an empty cell. */}
              {t("evidence.valueRedacted")}
              {cookie.valueLength === null
                ? ""
                : ` · ${t("evidence.valueLength")} ${formatNumber(cookie.valueLength)}`}
            </td>
            <td className={CELL}>
              <PhaseChip phase={cookie.consentPhase} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

function Storage({ items }: { items: readonly StorageRow[] }) {
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, "w-full")}>{t("evidence.columnKey")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnType")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnOrigin")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnValue")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnPhase")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((entry) => (
          <tr key={entry.id} className="border-t border-border">
            <td className={cn(CELL, "font-mono text-mono")}>{entry.key}</td>
            <td className={CELL}>
              <MutedBadge>{entry.storageType}</MutedBadge>
            </td>
            <td className={cn(CELL, "font-mono text-mono text-muted-foreground")}>
              {entry.origin}
            </td>
            <td className={cn(CELL, "text-caption text-muted-foreground")}>
              {t("evidence.valueRedacted")}
              {entry.valueLength === null
                ? ""
                : ` · ${t("evidence.valueLength")} ${formatNumber(entry.valueLength)}`}
            </td>
            <td className={CELL}>
              <PhaseChip phase={entry.consentPhase} />
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

function Console({
  items,
  timezone,
}: {
  items: readonly ConsoleRow[];
  timezone: string;
}) {
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className={HEAD}>{t("evidence.columnLevel")}</th>
          <th scope="col" className={cn(HEAD, "w-full")}>{t("evidence.columnMessage")}</th>
          <th scope="col" className={cn(HEAD, "text-end")}>{t("evidence.columnTime")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((log) => (
          <tr key={log.id} className="border-t border-border">
            <td className={CELL}>
              {/*
                ⚠️ A console error is DIAGNOSTIC, never evidence for a finding
                (§4.5). The tone is muted for that reason — a red row here would
                read as a detection.
              */}
              <MutedBadge>{log.level}</MutedBadge>
            </td>
            <td className={cn(CELL, "max-w-0 truncate font-mono text-mono")} title={log.message}>
              {log.message}
              {log.source ? (
                <span className="ms-2 text-caption text-muted-foreground">{log.source}</span>
              ) : null}
            </td>
            <td className={cn(CELL, "text-end text-caption text-muted-foreground")}>
              {formatDateTime(log.createdAt, timezone)}
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}

function Screenshots({ items }: { items: readonly ScreenshotRow[] }) {
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className={cn(HEAD, "w-full")}>{t("evidence.columnPhase")}</th>
          <th scope="col" className={HEAD}>{t("evidence.columnType")}</th>
          <th scope="col" className={cn(HEAD, "text-end")}>{t("evidence.columnSize")}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((shot) => (
          <tr key={shot.id} className="border-t border-border">
            <td className={CELL}>{CONSENT_PHASE_LABEL[shot.consentPhase]}</td>
            <td className={CELL}>
              <MutedBadge>{shot.kind}</MutedBadge>
            </td>
            <td className={cn(CELL, "text-end tabular-nums text-muted-foreground")}>
              {shot.width && shot.height ? `${shot.width}×${shot.height} · ` : ""}
              {shot.sizeBytes === null ? "" : formatBytes(shot.sizeBytes)}
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}
