import Link from "next/link";
import { TRUST_BAR } from "@content/marketing/nav";
import {
  ActivityIcon,
  CalendarIcon,
  CheckIcon,
  DocIcon,
  GlobeIcon,
  RadarIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { Container } from "./section";

/**
 * TRUST BAR — product signals, never fabricated logos.
 *
 * Until real customers exist, this strip states what the product actually does
 * (feature 20's acceptance criteria: "no fabricated logos or testimonials").
 * Each chip maps to a real capability with a real page behind it.
 */

const SIGNALS: ReadonlyArray<{ icon: React.ReactNode; label: string; href: string }> = [
  { icon: <GlobeIcon className="size-4" />, label: TRUST_BAR[0], href: "/how-it-works" },
  { icon: <CheckIcon className="size-4" />, label: TRUST_BAR[1], href: "/#consent-journeys" },
  { icon: <ShieldIcon className="size-4" />, label: TRUST_BAR[2], href: "/methodology" },
  { icon: <RadarIcon className="size-4" />, label: TRUST_BAR[3], href: "/#drift" },
  { icon: <DocIcon className="size-4" />, label: TRUST_BAR[4], href: "/#white-label" },
  { icon: <ActivityIcon className="size-4" />, label: TRUST_BAR[5], href: "/#ai" },
];

export function TrustBar() {
  return (
    <div className="border-y border-border bg-card/60">
      <Container>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 text-caption font-medium text-muted-foreground">
          {SIGNALS.map((signal) => (
            <li key={signal.label}>
              <Link
                href={signal.href}
                className="flex items-center gap-1.5 transition hover:text-foreground"
              >
                <span aria-hidden="true" className="text-primary">
                  {signal.icon}
                </span>
                {signal.label}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

/** Compact "no credit card / cancel anytime" strip used under CTAs. */
export function RiskReversal() {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-caption text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <CalendarIcon className="size-3.5 text-primary" />
        Free scan, no account needed
      </span>
      <span className="flex items-center gap-1.5">
        <CheckIcon className="size-3.5 text-success" />
        Monthly plans, cancel anytime
      </span>
    </p>
  );
}
