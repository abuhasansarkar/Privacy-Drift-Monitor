import { describe, expect, it } from "vitest";
import { cn } from "../cn";

/**
 * `cn` — PLAN.md Part XI §11.2 (type scale), §11.6 (never colour alone).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE BUG IT GUARDS AGAINST SHIPPED SILENTLY FOR AN
 * HOUR AND NOTHING CAUGHT IT.
 *
 * Adopting shadcn/ui required upgrading `cn` from a plain join to `twMerge`, so
 * a caller's `className` could override a component's base classes. But
 * `tailwind-merge` only knows Tailwind's OWN utilities: it saw our custom type
 * scale (`text-small`, `text-caption`, `text-h1` — §11.2) and, finding no such
 * font size, filed each under the `text-<color>` group. A size and a colour
 * then competed, and the size won:
 *
 *     "bg-primary text-primary-foreground h-9 text-small"  →  colour DELETED
 *     "bg-warning-muted text-warning text-caption"         →  colour DELETED
 *
 * Those are the real class strings for every `primary` Button and every
 * `SeverityBadge`. The app compiled, every test passed, and the build
 * succeeded — while §11.6's "colour PLUS icon PLUS text" quietly lost its
 * colour everywhere. It was found by rendering a component to HTML and reading
 * the class list, which is the only place it was visible.
 *
 * Adding a token to `--text-*` in `globals.css` without adding it to
 * `TYPE_SCALE` in `cn.ts` reintroduces exactly this. The first block below is
 * what fails when someone does.
 */

describe("⚠️ custom type-scale tokens must not eat text colours", () => {
  const TYPE_SCALE = [
    "display",
    "h1",
    "h2",
    "h3",
    "h4",
    "body-lg",
    "body",
    "small",
    "caption",
    "mono",
  ];

  for (const size of TYPE_SCALE) {
    it(`text-${size} coexists with a text colour`, () => {
      const result = cn(`text-foreground text-${size}`);
      expect(result, `text-${size} swallowed the colour`).toContain("text-foreground");
      expect(result).toContain(`text-${size}`);
    });
  }

  it("keeps the foreground colour on a primary Button", () => {
    // The exact string `buttonClasses("primary", "md")` produces.
    const result = cn(
      "inline-flex items-center justify-center rounded-md border font-medium",
      "bg-primary text-primary-foreground border-transparent hover:opacity-90",
      "h-9 px-3.5 text-small gap-2 max-sm:h-11",
    );
    expect(result).toContain("text-primary-foreground");
    expect(result).toContain("text-small");
  });

  it("keeps the severity colour on a badge — §11.6", () => {
    // Severity is never conveyed by colour alone, but it IS conveyed partly by
    // colour. Dropping it leaves icon + text carrying the whole signal.
    const result = cn("bg-warning-muted text-warning", "text-caption font-medium");
    expect(result).toContain("text-warning");
    expect(result).toContain("text-caption");
  });
});

describe("conflict resolution — why twMerge is here at all", () => {
  it("a later background wins over an earlier one", () => {
    // shadcn components carry base classes and expect `className` to override.
    expect(cn("bg-primary", "bg-warning")).toBe("bg-warning");
  });

  it("a later type size wins over an earlier one", () => {
    expect(cn("text-small", "text-h1")).toBe("text-h1");
  });

  it("a later text colour wins over an earlier one", () => {
    expect(cn("text-muted-foreground", "text-danger")).toBe("text-danger");
  });

  it("leaves non-conflicting classes exactly as the old plain join did", () => {
    // The compatibility guarantee for ~40 hand-written components that were
    // written against the old implementation.
    expect(cn("flex items-center gap-2")).toBe("flex items-center gap-2");
  });
});

describe("falsy handling — the original behaviour", () => {
  it("drops false, null and undefined", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("supports the conditional-object form clsx adds", () => {
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });

  it("returns an empty string for nothing", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });
});
