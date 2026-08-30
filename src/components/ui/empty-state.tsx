import type { ReactNode } from "react";
import { RadarIcon } from "./icons";

/**
 * EMPTY STATE — §11.8.
 *
 * Every list ships one, and every one names the CONCEPT, its VALUE and the
 * ACTION. An empty state that only says "No data" is not a designed state.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center sm:py-20">
      <RadarIcon className="size-12 text-primary" />
      <h3 className="mt-2 text-h4">{title}</h3>
      <p className="max-w-sm text-small text-muted-foreground">{body}</p>
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
