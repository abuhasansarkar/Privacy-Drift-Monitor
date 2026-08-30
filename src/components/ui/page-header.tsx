import type { ReactNode } from "react";

/**
 * PAGE HEADER — §11.4.
 *
 * Actions wrap under the title below `sm` rather than squeezing beside it;
 * a two-button action group next to a heading is the first thing to break on a
 * 390px screen.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-h2 sm:text-h1">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-small text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{actions}</div>
      ) : null}
    </div>
  );
}
