"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { HERO_VISUAL } from "@content/marketing/homepage";
import { cn } from "@/lib/cn";
import { ActivityIcon, AlertTriangleIcon, GlobeIcon } from "@/components/ui/icons";
import { DemoLabel } from "./section";

/**
 * THE HERO VISUAL — a replayed scan trace.
 *
 * ⚠️ NOT A DASHBOARD SCREENSHOT, DELIBERATELY. A screenshot of a table of
 * findings communicates "this product has a table". The one thing a visitor
 * has to understand in five seconds is the SEQUENCE — a consent state is
 * established first, requests are recorded UNDER that state, and the result is
 * compared with last week. That sequence is the product, and it is a thing
 * that happens over time, so it is shown happening over time.
 *
 * ⚠️ IT IS LABELLED ILLUSTRATIVE AND IT IS NOT A LIVE SCAN. On a product whose
 * entire promise is recorded evidence, a homepage animation dressed up as a
 * live feed is the same defect as a fabricated testimonial — it just costs
 * less to produce. `DemoLabel` renders underneath and the copy says "replays
 * the shape of a real recording".
 *
 * ⚠️ REDUCED MOTION GETS THE WHOLE STORY, NOT A FROZEN FRAME. Pausing on
 * journey one would leave those readers looking at "No consent" with three
 * requests and no idea that the other three journeys exist. Instead the
 * replay stops and every journey renders at once, statically — same
 * information, no movement. This is why the component branches on
 * `reduced` for CONTENT and not only for transitions.
 *
 * The whole thing is `aria-hidden`: it is an illustration of copy that already
 * states the same facts in text above it, and announcing a looping list of
 * fictional hostnames to a screen reader is noise, not information.
 */

type Journey = (typeof HERO_VISUAL.journeys)[number];

/** How long each journey holds before the replay advances. */
const JOURNEY_MS = 2600;
/** Stagger between event rows inside one journey. */
const ROW_STAGGER = 0.12;

function EventRow({
  event,
  index,
  animate,
}: {
  event: Journey["events"][number];
  index: number;
  animate: boolean;
}) {
  return (
    <motion.li
      initial={animate ? { opacity: 0, x: -6 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * ROW_STAGGER, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2.5 py-1.5"
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          event.flagged ? "bg-severity-high" : "bg-muted-foreground/40",
        )}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-caption text-foreground/80">
        {event.host}
      </span>
      {event.flagged ? (
        <span className="shrink-0 rounded-full bg-severity-high-bg px-1.5 py-0.5 text-[0.625rem] font-medium leading-none text-severity-high">
          {HERO_VISUAL.labels.beforeConsent}
        </span>
      ) : null}
      <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-muted-foreground">
        {event.at}
      </span>
    </motion.li>
  );
}

/** One journey block — the heading, its caption and its recorded rows. */
function JourneyPanel({ journey, animate }: { journey: Journey; animate: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-caption font-medium text-primary">{journey.label}</span>
        <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {HERO_VISUAL.labels.observed} · {journey.events.length}
        </span>
      </div>
      <p className="mt-1 text-caption text-muted-foreground">{journey.caption}</p>
      <ul className="mt-2 divide-y divide-border/60">
        {journey.events.map((event, index) => (
          <EventRow key={event.host} event={event} index={index} animate={animate} />
        ))}
      </ul>
    </div>
  );
}

export function HeroVisual() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);

  /*
   * The replay. `reduced` short-circuits before the interval is ever created,
   * so a reader who asked for no motion pays for no timer either — this is a
   * component that would otherwise re-render every 2.6 seconds forever, on the
   * page with the product's only above-the-fold CTA.
   */
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(
      () => setActive((current) => (current + 1) % HERO_VISUAL.journeys.length),
      JOURNEY_MS,
    );
    return () => clearInterval(timer);
  }, [reduced]);

  const journey = HERO_VISUAL.journeys[active]!;
  // The verdict is the payoff, so it lands on the last journey of the loop.
  const showVerdict = reduced || active === HERO_VISUAL.journeys.length - 1;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-border bg-card text-start shadow-sm"
      >
        {/* Window chrome — the site under scan. */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-caption text-muted-foreground">
            {HERO_VISUAL.site}
          </span>
          <span className="ms-auto flex items-center gap-1.5">
            <ActivityIcon className="size-3.5 text-primary" />
            <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {HERO_VISUAL.labels.consentState}
            </span>
          </span>
        </div>

        {/* Journey tabs — the four consent states, current one lit. */}
        <div className="flex gap-1 border-b border-border px-3 py-2">
          {HERO_VISUAL.journeys.map((item, index) => (
            <span
              key={item.id}
              className={cn(
                "relative rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors",
                !reduced && index === active
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {!reduced && index === active ? (
                <motion.span
                  layoutId="hero-journey-pill"
                  className="absolute inset-0 -z-10 rounded-md bg-primary/10"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              ) : null}
              {item.label}
            </span>
          ))}
        </div>

        {/* The recording. */}
        <div className="px-4 py-3.5">
          {reduced ? (
            /*
             * Static: every journey at once. See the header note — a frozen
             * first frame would hide three quarters of the point.
             */
            <div className="flex flex-col gap-4">
              {HERO_VISUAL.journeys.map((item) => (
                <JourneyPanel key={item.id} journey={item} animate={false} />
              ))}
            </div>
          ) : (
            /*
             * ⚠️ NO `AnimatePresence mode="wait"` HERE, AND THE REASON IS A BUG
             * THIS COMPONENT SHIPPED WITH. With an exit animation, the tab
             * highlight advanced to the next journey while the OUTGOING panel
             * was still fading — so for ~200ms the header read "Reject all"
             * above a list captioned "No consent". On a product whose whole
             * claim is that a request is recorded against the consent state it
             * happened under, a visual that mislabels which state produced
             * which requests is the worst possible illustration.
             *
             * Keying the panel on the journey id remounts it instantly, so the
             * label and the rows under it always describe the same journey.
             *
             * The min-height fits the LONGEST journey (four rows), so the
             * verdict below never moves as the replay cycles.
             */
            <div className="min-h-[11rem]">
              <motion.div
                key={journey.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <JourneyPanel journey={journey} animate />
              </motion.div>
            </div>
          )}
        </div>

        {/*
          The verdict — what the diff against the previous scan produced.

          ⚠️ THE ICON IS FIXED. It used to swap to a green check while the
          replay was mid-cycle, which put a "pass" tick directly beside the
          words "1 change since the last scan". Severity is conveyed by icon
          AND text here (§11.6), so the two contradicting each other is not a
          cosmetic slip — it is the indicator lying. The row now states one
          thing, and only its emphasis changes as the replay lands on it.
        */}
        <motion.div
          initial={false}
          animate={{ opacity: showVerdict ? 1 : 0.55 }}
          transition={{ duration: 0.3 }}
          className="flex items-start gap-2.5 border-t border-border bg-warning-muted/60 px-4 py-3"
        >
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-caption font-medium text-foreground">
              {HERO_VISUAL.labels.drift} · {HERO_VISUAL.verdict.headline}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {HERO_VISUAL.verdict.detail}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="mt-3 text-center">
        <DemoLabel>{HERO_VISUAL.demoLabel}</DemoLabel>
      </div>
    </div>
  );
}
