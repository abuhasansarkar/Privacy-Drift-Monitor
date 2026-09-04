import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * CARD — §11.4. The raised surface the app canvas (`bg-canvas`) sits behind.
 */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-xs transition-shadow duration-200", className)}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  action,
}: {
  title: string;
  /** Usually a "View all" link. Optional — not every card needs an escape. */
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3">
      <h2 className="text-h4">{title}</h2>
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}
