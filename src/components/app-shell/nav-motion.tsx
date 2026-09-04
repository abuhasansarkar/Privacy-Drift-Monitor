"use client";

import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * NAVIGATION MOTION — the app shell's animation vocabulary.
 *
 * The marketing site had `marketing/motion.tsx` and the product had nothing:
 * every active state in the sidebar and every tab underline swapped instantly,
 * so moving between two destinations gave no sense of having moved. This is the
 * product-side counterpart, and it follows the same three rules.
 *
 * ⚠️ REDUCED MOTION IS A HARD BRANCH, NOT A CSS OVERRIDE. `globals.css` already
 * collapses durations to 0.01ms, which is enough for a fade but NOT for a
 * shared-layout animation: framer-motion measures positions in JavaScript and
 * would still run the measure/transform work, just instantly. These components
 * render a plain element instead, so nothing is measured and no transform is
 * ever written. Identical from first paint.
 *
 * ⚠️ THE INDICATOR IS ONE ELEMENT THAT MOVES, NOT ONE PER ITEM. That is what
 * `layoutId` buys: the browser interpolates between the old and new position,
 * so the eye tracks a single object travelling to the new destination rather
 * than one box vanishing and another appearing. It is also why every indicator
 * in a group must share a `LayoutGroup` — two groups with the same id would
 * fight over the same animating element.
 *
 * ⚠️ MOTION IS DECORATION AND MUST NOT CARRY MEANING. The active destination is
 * conveyed by `aria-current="page"` and by colour+weight on the label itself;
 * the sliding bar is the third signal, never the only one. A screen reader and
 * a reduced-motion reader lose nothing.
 */

/** Matches `marketing/motion.tsx`. One easing curve across the product. */
const EASE = [0.16, 1, 0.3, 1] as const;

/** Fast enough to feel like a response, slow enough to be followed. */
const SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } as const;

export function NavGroup({
  id,
  children,
}: {
  /** Unique per navigation region — sidebar, website tabs, settings nav. */
  id: string;
  children: React.ReactNode;
}) {
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

/**
 * The travelling highlight behind an active navigation item.
 *
 * Rendered ONLY by the active item. Mounting it in every item and toggling
 * opacity would defeat `layoutId` — framer-motion animates between the mounted
 * instances of a shared id, so there must be exactly one at a time.
 */
export function ActiveHighlight({
  layoutId,
  className,
}: {
  layoutId: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const shared = cn("absolute inset-0 -z-10 rounded-md bg-muted", className);

  if (reduced) return <span aria-hidden className={shared} />;

  return (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      className={shared}
      transition={SPRING}
    />
  );
}

/**
 * The travelling underline for a tab strip.
 *
 * Separate from `ActiveHighlight` because a tab underline sits on the container
 * border and must not be clipped by the item's own rounding.
 */
export function ActiveUnderline({
  layoutId,
  className,
}: {
  layoutId: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const shared = cn(
    "absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary",
    className,
  );

  if (reduced) return <span aria-hidden className={shared} />;

  return (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      className={shared}
      transition={SPRING}
    />
  );
}

/**
 * Inline pending feedback for a link whose destination is still loading.
 *
 * ⚠️ MUST BE RENDERED INSIDE A `<Link>`. `useLinkStatus` reads the pending
 * state of the nearest Link ancestor and throws outside one — this is Next 16's
 * documented contract, not a convention we chose.
 *
 * ⚠️ IT IS A SECOND-LINE AFFORDANCE, NOT THE PRIMARY ONE. Next's own guidance
 * is to prefer a route-level `loading.tsx`, which shows content-shaped skeleton
 * for the whole destination; this only covers the window before that boundary
 * commits, which on a warm prefetch is zero. Both exist because they fail at
 * different moments: prefetch can be disabled, in flight, or beaten by a slow
 * dynamic segment, and in each of those the user has clicked and seen nothing.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  const reduced = useReducedMotion();

  if (!pending) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "ms-auto size-1.5 shrink-0 rounded-full bg-current opacity-60",
        // The pulse is the whole signal, so reduced motion keeps a static dot
        // rather than removing the element and leaving no feedback at all.
        reduced ? "" : "animate-pulse",
        className,
      )}
    />
  );
}

/**
 * A subtle enter for freshly-rendered page content.
 *
 * ⚠️ OPACITY AND A 4px LIFT ONLY. Anything larger reads as the page moving,
 * which on a data-dense screen makes text unreadable for the duration and
 * costs more than it adds. This is meant to soften the swap, not to announce it.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
