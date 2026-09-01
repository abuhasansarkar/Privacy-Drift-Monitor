import type { ReactNode } from "react";
import { t } from "@pdm/shared/copy";
import { cn } from "@/lib/cn";

/**
 * ADMIN PRIMITIVES — PLAN.md §3.12.
 *
 * ⚠️ DENSER THAN THE CUSTOMER APP, ON PURPOSE. These screens are read by
 * someone scanning for an anomaly across hundreds of rows, not by an agency
 * owner reading one client's report. The customer components optimise for
 * comprehension of a single item; these optimise for comparison across many.
 */

export function AdminPage({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-h2 tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-small text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function AdminStat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Only for a value that means something is wrong. Never decorative. */
  tone?: "danger" | "warning";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <span className="text-caption font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-h2 tabular-nums",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
      {note ? (
        <span className="text-caption text-muted-foreground">{note}</span>
      ) : null}
    </div>
  );
}

/**
 * A table that scrolls inside its own container.
 *
 * ⚠️ THE PAGE BODY MUST NEVER SCROLL SIDEWAYS (§11.5), and admin tables are the
 * widest thing in the product. The overflow lives here so no page has to
 * remember.
 */
export function AdminTable({
  columns,
  children,
  empty,
}: {
  columns: readonly string[];
  children: ReactNode;
  /** Rendered when `children` is empty — pass `rows.length === 0`. */
  empty?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[40rem] text-small">
        <thead>
          <tr className="border-b border-border text-left text-caption text-muted-foreground">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {empty ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-8 text-center text-muted-foreground"
              >
                {t("admin.empty")}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AdminCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-h4">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A neutral chip for a status word. Colour is never the only signal (§11.6). */
export function AdminPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-caption font-medium",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "good" && "bg-success-muted text-success",
        tone === "warn" && "bg-warning-muted text-warning",
        tone === "bad" && "bg-danger-muted text-danger",
      )}
    >
      {children}
    </span>
  );
}
