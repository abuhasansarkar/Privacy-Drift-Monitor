import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/button";

/**
 * MARKETING LAYOUT PRIMITIVES — dev-doc/features/20-marketing-site.md.
 *
 * One container width for the whole public surface (max-w-6xl, matching the
 * existing header), consistent section rhythm, and a shared section-heading
 * pattern so twenty homepage sections do not each hand-roll spacing.
 *
 * Server components on purpose: these render on every statically prerendered
 * marketing page and carry zero client JS.
 */

/** Page-width container. `narrow` opt-in for prose-heavy pages. */
export function Container({
  children,
  className,
  narrow = false,
}: {
  children: React.ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4",
        narrow ? "max-w-3xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Full-width section with consistent vertical rhythm. */
export function Section({
  children,
  className,
  bordered = false,
  tinted = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  /** Adds hairline top+bottom borders and a card background. */
  bordered?: boolean;
  /** Subtle primary tint — used sparingly, for CTA bands only. */
  tinted?: boolean;
  /** Anchor id for in-page navigation (e.g. `/#drift`). */
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24",
        bordered && "border-y border-border bg-card",
        tinted && "border-t border-border bg-primary/5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-semibold uppercase tracking-widest text-primary">
      {children}
    </p>
  );
}

/** Section heading block: eyebrow + heading + optional intro, centred or left. */
export function SectionHeading({
  eyebrow,
  heading,
  intro,
  center = true,
  as: Heading = "h2",
}: {
  eyebrow?: string;
  heading: string;
  intro?: string;
  center?: boolean;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Heading
        className={cn(
          "mt-2 text-balance tracking-tight",
          Heading === "h1"
            ? "text-display md:text-display"
            : Heading === "h2"
              ? "text-h2 md:text-h1"
              : "text-h3",
        )}
      >
        {heading}
      </Heading>
      {intro ? (
        <p className="mt-3 text-body-lg text-muted-foreground">{intro}</p>
      ) : null}
    </div>
  );
}

/** Small caption marking illustrative/demo data on product mock-ups. */
export function DemoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-muted-foreground" aria-label="Illustrative data notice">
      {children}
    </p>
  );
}

/** Closing conversion band, reused by every page. */
export function CtaSection({
  title,
  titleAccent,
  body,
  primary,
  secondary,
}: {
  title: string;
  titleAccent?: string;
  body?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <Section tinted>
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-h1 tracking-tight text-balance">
            {title}{" "}
            {titleAccent ? (
              <span className="text-primary">{titleAccent}</span>
            ) : null}
          </h2>
          {body ? (
            <p className="mt-3 text-body-lg text-muted-foreground">{body}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={primary.href} className={buttonClasses("primary", "md")}>
              {primary.label}
            </Link>
            {secondary ? (
              <Link
                href={secondary.href}
                className={buttonClasses("secondary", "md")}
              >
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </Container>
    </Section>
  );
}
