"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * MOTION PRIMITIVES — the whole marketing surface's animation vocabulary.
 *
 * ⚠️ REDUCED MOTION IS A HARD BRANCH, NOT A CSS AFTERTHOUGHT. globals.css
 * already kills animation durations globally; these primitives go further and
 * render static content when `prefers-reduced-motion: reduce` is set, so no
 * transform is ever applied at all and layout is identical from first paint.
 *
 * Everything is `whileInView`-based and one-shot (`viewport.once`): scroll
 * reveal, staggered children, counting numbers. No parallax, no cursor
 * following, no autoplay loops — motion supports conversion, never blocks it.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Seconds — used to sequence a group, not to fake stagger one by one. */
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Wraps direct children in a sequential fade-up. Children must be elements. */
export function Stagger({
  children,
  className,
  step = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-48px" }}
              transition={{ duration: 0.45, delay: index * step, ease: EASE }}
            >
              {child}
            </motion.div>
          ))
        : children}
    </div>
  );
}

/**
 * Counts up to `value` when scrolled into view. Tabular numbers and a fixed
 * width keep the layout shift-free while it runs.
 */
export function Counter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-48px" });
  const [counted, setCounted] = useState(0);

  /*
   * ⚠️ THE REDUCED-MOTION VALUE IS DERIVED, NOT STORED. This used to be a
   * `setDisplay(value)` inside the effect, which React's `set-state-in-effect`
   * rule rejects — and rightly: a reader who has asked for reduced motion got
   * a render showing 0 followed by a second render showing the real number,
   * which is a flash of wrong data produced by the very branch meant to remove
   * animation. Reading it straight from the prop renders the final number
   * first time, and the effect below never runs for those readers at all.
   */
  const display = reduced ? value : counted;

  useEffect(() => {
    if (!inView || reduced) return;
    let raf: number;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCounted(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display}
    </span>
  );
}
