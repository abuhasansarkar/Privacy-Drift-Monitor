"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DRIFT } from "@content/marketing/homepage";
import {
  AlertTriangleIcon,
  CheckIcon,
  PlusIcon,
  ShieldAlertIcon,
} from "@/components/ui/icons";
import { DemoLabel } from "./section";

/**
 * DRIFT TIMELINE — the homepage's differentiator section.
 *
 * Builds progressively as it scrolls into view, because "we remember how the
 * site behaved" is a story about sequence. Status is colour PLUS icon PLUS
 * text (WCAG 1.4.1), using the same severity tokens the product uses.
 */

const STATUS = {
  healthy: {
    icon: <CheckIcon className="size-4" />,
    text: "Healthy",
    dot: "bg-success",
    ring: "border-success/40",
    chip: "bg-success-muted text-success",
  },
  new: {
    icon: <PlusIcon className="size-4" />,
    text: "New tracker",
    dot: "bg-info",
    ring: "border-info/40",
    chip: "bg-info-muted text-info",
  },
  finding: {
    icon: <AlertTriangleIcon className="size-4" />,
    text: "Potential issue",
    dot: "bg-danger",
    ring: "border-danger/40",
    chip: "bg-danger-muted text-danger",
  },
  resolved: {
    icon: <ShieldAlertIcon className="size-4" />,
    text: "Fix verified",
    dot: "bg-success",
    ring: "border-success/40",
    chip: "bg-success-muted text-success",
  },
} as const;

export function DriftTimeline() {
  const reduced = useReducedMotion();

  return (
    <div>
      <ol className="relative flex flex-col gap-4 border-s border-border ps-6">
        {DRIFT.events.map((event, index) => {
          const style = STATUS[event.status];
          return (
            <motion.li
              key={`${event.date}-${event.title}`}
              className="relative rounded-lg border border-border bg-card p-4"
              initial={reduced ? false : { opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                aria-hidden="true"
                className={`absolute -start-[1.85rem] top-5 grid size-6 place-items-center rounded-full border-2 border-background text-primary-foreground ${style.dot}`}
              >
                <span className="[&>svg]:size-3">{style.icon}</span>
              </span>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <time className="text-caption font-medium text-muted-foreground">
                  {event.date}
                </time>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ${style.chip}`}
                >
                  {style.icon}
                  {style.text}
                </span>
              </div>
              <h3 className="mt-1.5 text-h4">{event.title}</h3>
              <p className="mt-1 text-small text-muted-foreground">{event.detail}</p>
            </motion.li>
          );
        })}
      </ol>
      <DemoLabel>{DRIFT.demoLabel}</DemoLabel>
    </div>
  );
}
