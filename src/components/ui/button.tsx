import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * BUTTON — §11.4.
 *
 * Variants are an exhaustive map, not a base class with overrides, so two
 * variants can never half-apply. The focus ring comes from the global
 * `:focus-visible` rule in globals.css (§11.6) and is never removed here.
 *
 * Hit targets are >= 36px high on desktop and >= 44px on touch (§11.5) — the
 * `max-sm:` bump below is that rule, not decoration.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground border-transparent hover:opacity-90",
  secondary:
    "bg-background text-foreground border-border hover:bg-muted",
  ghost:
    "bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
  danger:
    "bg-danger text-danger-foreground border-transparent hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-caption gap-1.5 max-sm:h-11",
  md: "h-9 px-3.5 text-small gap-2 max-sm:h-11",
};

const BASE =
  "inline-flex items-center justify-center rounded-md border font-medium " +
  "whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

function classes(variant: Variant, size: Size, className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

/**
 * The same class string a `<Button>` would render, for the cases that need a
 * button's LOOK on an element that cannot be a `<button>`.
 *
 * ⚠️ EXPORTED SO THERE IS STILL ONE DEFINITION. Radix primitives (`AlertDialog`
 * `Action`/`Cancel`) render their own element and cannot be wrapped in our
 * Button, which does not implement `asChild`. Without this they would carry a
 * hand-copied approximation of these classes, and the two would drift the first
 * time a variant changed — which is precisely the "two variants half-applying"
 * failure the exhaustive maps above exist to prevent.
 *
 * Prefer `<Button>` or `<ButtonLink>`. Reach for this only when the element is
 * not yours to choose.
 */
export function buttonClasses(
  variant: Variant = "secondary",
  size: Size = "md",
  className?: string,
): string {
  return classes(variant, size, className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={classes(variant, size, className)}
      {...props}
    />
  );
}

/** A link that reads as a button. Never a `<button>` with an onClick router push. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
