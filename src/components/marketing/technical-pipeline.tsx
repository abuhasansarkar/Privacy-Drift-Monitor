"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PIPELINE } from "@content/marketing/homepage";
import { DemoLabel } from "./section";

/**
 * TECHNICAL PIPELINE — the six scan stages as an animated flow.
 *
 * The point of the animation is the ORDER: the connector line draws left to
 * right and each stage lights up in sequence, which is the claim the section
 * makes ("consent is tested before anything is classified"). Reduced motion
 * renders the same diagram statically.
 */
export function TechnicalPipeline() {
  const reduced = useReducedMotion();

  return (
    <div>
      <ol className="relative grid gap-6 md:grid-cols-6 md:gap-4">
        {/* Connector — draws across the row as the steps reveal. */}
        <motion.span
          aria-hidden="true"
          className="absolute left-0 right-0 top-5 hidden h-px origin-left bg-gradient-to-r from-primary/60 via-primary/30 to-transparent md:block"
          initial={reduced ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
        {PIPELINE.steps.map((step, index) => (
          <motion.li
            key={step.title}
            className="relative"
            initial={reduced ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-48px" }}
            transition={{ duration: 0.45, delay: 0.15 + index * 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span
              aria-hidden="true"
              className="relative z-10 grid size-10 place-items-center rounded-full border border-primary/30 bg-background text-small font-semibold text-primary"
            >
              {index + 1}
            </span>
            <h3 className="mt-3 text-h4">{step.title}</h3>
            <p className="mt-1.5 text-small text-muted-foreground">{step.body}</p>
          </motion.li>
        ))}
      </ol>
      <DemoLabel>{`Illustrative pipeline — the stages a real scan runs, in order`}</DemoLabel>
    </div>
  );
}
