"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { CONSENT_JOURNEYS, type JourneyDemo } from "@content/marketing/homepage";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";
import { DemoLabel } from "./section";

/**
 * CONSENT JOURNEY DEMO — the interactive centrepiece.
 *
 * Four tabs, one per consent journey. Selecting a journey swaps the recorded
 * request list, cookie set and finding — the fastest way to explain the
 * product to a non-technical buyer, because it shows the unit of proof: a
 * request, the state it fired under, and whether that combination is expected.
 *
 * ⚠️ Accessibility: a real tab pattern — `role=tablist`, arrow-key navigation,
 * `aria-selected`, panel labelled by its tab — not buttons that toggle divs.
 * Reduced motion disables the panel transition entirely.
 */

function stateTone(state: string): string {
  if (state.includes("before consent") || state.includes("Still observed")) {
    return "bg-danger-muted text-danger";
  }
  if (state.includes("No longer")) {
    return "bg-success-muted text-success";
  }
  if (state.includes("consent given") || state.includes("Permitted")) {
    return "bg-info-muted text-info";
  }
  return "bg-muted text-muted-foreground";
}
function JourneyPanel({ journey, reduced }: { journey: JourneyDemo; reduced: boolean }) {
  return (
    <motion.div
      key={journey.key}
      role="tabpanel"
      id={`journey-panel-${journey.key}`}
      aria-labelledby={`journey-tab-${journey.key}`}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]"
    >
      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          Requests observed
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {journey.requests.map((request) => (
            <li key={request.domain} className="text-small">
              <p className="font-mono text-foreground">{request.domain}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">{request.category}</span>
                <span className={`rounded px-1.5 py-0.5 text-caption ${stateTone(request.state)}`}>
                  {request.state}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          Cookies
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {journey.cookies.map((cookie) => (
            <li key={cookie.name} className="text-small">
              <p className="font-mono text-foreground">{cookie.name}</p>
              <p className="mt-0.5 text-muted-foreground">
                {cookie.category} · {cookie.note}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex-1 rounded-lg border border-border bg-background p-4">
          <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            What this journey tests
          </h3>
          <p className="mt-2 text-small text-muted-foreground">{journey.description}</p>
        </div>
        {journey.finding ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-muted p-3 text-small text-danger"
          >
            <AlertTriangleIcon className="mt-0.5 shrink-0" />
            {journey.finding}
          </p>
        ) : (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-muted p-3 text-small text-success"
          >
            <CheckIcon className="mt-0.5 shrink-0" />
            This journey behaved as expected. No finding recorded.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function ConsentJourneyDemo() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion() ?? false;
  const journey = CONSENT_JOURNEYS.journeys[active];

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next =
      (active + delta + CONSENT_JOURNEYS.journeys.length) %
      CONSENT_JOURNEYS.journeys.length;
    setActive(next);
    document
      .getElementById(`journey-tab-${CONSENT_JOURNEYS.journeys[next].key}`)
      ?.focus();
  }

  return (
    <div>
      <DemoLabel>{CONSENT_JOURNEYS.demoLabel}</DemoLabel>

      <div
        role="tablist"
        aria-label={CONSENT_JOURNEYS.selectLabel}
        onKeyDown={onKeyDown}
        className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 sm:inline-flex"
      >
        {CONSENT_JOURNEYS.journeys.map((option, index) => (
          <button
            key={option.key}
            id={`journey-tab-${option.key}`}
            role="tab"
            type="button"
            aria-selected={active === index}
            aria-controls={`journey-panel-${option.key}`}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            className={
              active === index
                ? "rounded-md bg-primary px-3 py-1.5 text-small font-medium text-primary-foreground"
                : "rounded-md px-3 py-1.5 text-small text-muted-foreground transition hover:bg-muted hover:text-foreground"
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <AnimatePresence mode="wait" initial={false}>
          <JourneyPanel key={journey.key} journey={journey} reduced={reduced} />
        </AnimatePresence>
      </div>
    </div>
  );
}
