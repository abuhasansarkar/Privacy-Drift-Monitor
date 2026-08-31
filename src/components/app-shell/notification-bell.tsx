"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t } from "@pdm/shared/copy";
import { BellIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/**
 * HEADER BELL — §3.11: "the header bell shows unread count and a popover of the
 * latest five".
 *
 * ⚠️ THE COUNT AND THE ROWS ARE SERVER-RENDERED PROPS. No polling and no client
 * fetch: this is on every authenticated page, and a 30-second poll across an
 * agency's open tabs is a query per tab per half-minute for information that
 * changes a few times a day. It refreshes on navigation, which is when someone
 * is actually looking.
 *
 * ⚠️ TIMESTAMPS ARE RENDERED BY THE BROWSER FROM AN ISO STRING. A relative time
 * computed on the server hydrates as "2 minutes ago" and then never moves;
 * computing it here keeps it honest and avoids the mismatch.
 */

export interface BellNotification {
  id: string;
  title: string;
  body: string;
  severity: string;
  linkUrl: string | null;
  createdAtIso: string;
  unread: boolean;
}

export function NotificationBell({
  unread,
  latest,
}: {
  unread: number;
  latest: BellNotification[];
}) {
  const [open, setOpen] = useState(false);
  /*
   * ⚠️ Pinned at mount, not read during render. A clock read in the render body
   * makes the component non-idempotent — see the same note in
   * `components/portal/time.tsx`.
   */
  const [now] = useState(() => Date.now());
  const container = useRef<HTMLDivElement>(null);

  // Escape and outside-click close it — the popover is transient, and a panel
  // that only closes by clicking the bell again is one people leave open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label={
          unread > 0
            ? `${t("notifications.bellLabel")} (${formatNumber(unread)})`
            : t("notifications.bellLabel")
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
      >
        <BellIcon />
        {/*
          ⚠️ The dot is decorative — the count is in `aria-label` above, so a
          screen-reader user is told there are notifications rather than
          being shown a red circle they cannot perceive (§11.6).
        */}
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute end-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-background"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("notifications.title")}
          className="absolute end-0 z-40 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="text-small font-medium">{t("notifications.title")}</p>
          </div>

          {latest.length === 0 ? (
            <p className="px-3 py-6 text-center text-small text-muted-foreground">
              {t("notifications.emptyAllTitle")}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {latest.map((row) => (
                <li key={row.id} className={cn(row.unread && "bg-primary/5")}>
                  <Link
                    href={row.linkUrl ?? "/app/notifications"}
                    onClick={() => setOpen(false)}
                    className="block border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted"
                  >
                    <span className="block truncate text-small font-medium">
                      {row.title}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {row.body}
                    </span>
                    <time
                      dateTime={row.createdAtIso}
                      className="mt-0.5 block text-caption text-muted-foreground"
                    >
                      {relative(row.createdAtIso, now)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border px-3 py-2">
            <Link
              href="/app/notifications"
              onClick={() => setOpen(false)}
              className="text-small text-primary hover:underline"
            >
              {t("notifications.viewAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

function relative(iso: string, now: number): string {
  let duration = (new Date(iso).getTime() - now) / 1000;
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) return RELATIVE.format(Math.round(duration), unit);
    duration /= amount;
  }
  return RELATIVE.format(Math.round(duration), "year");
}
