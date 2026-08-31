"use client";

import { useState } from "react";

/**
 * PORTAL TIMESTAMPS.
 *
 * ⚠️ RENDERED IN THE BROWSER, FROM AN ISO STRING. A portal user is the
 * agency's CLIENT: we do not know their timezone, and we deliberately do not
 * ask — §10.6 keeps data collection minimal, and a date is one of the few
 * things a browser can localise correctly on its own.
 */

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

export function PortalDate({ iso }: { iso: string }) {
  return <time dateTime={iso}>{DATE.format(new Date(iso))}</time>;
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export function PortalRelative({ iso }: { iso: string }) {
  /*
   * ⚠️ `Date.now()` IS READ IN A LAZY INITIALISER, NOT DURING RENDER. A clock
   * read in the render body makes the component non-idempotent: React may
   * re-render at any time, and "3 hours ago" would silently drift between two
   * renders of the same props. Pinning it at mount is both pure and honest —
   * the page is server-rendered per navigation anyway.
   */
  const [now] = useState(() => Date.now());
  let duration = (new Date(iso).getTime() - now) / 1000;
  let label = "";
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) {
      label = RELATIVE.format(Math.round(duration), unit);
      break;
    }
    duration /= amount;
  }
  return <time dateTime={iso}>{label}</time>;
}
