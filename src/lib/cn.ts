import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * OUR TYPE SCALE — PLAN.md Part XI §11.2, defined as `--text-*` in
 * `globals.css` and used as `text-h1`, `text-small`, `text-mono`, …
 *
 * ⚠️ THESE MUST BE DECLARED TO tailwind-merge OR IT DELETES OUR TEXT COLOURS.
 * `tailwind-merge` groups classes by what they set, and it only knows Tailwind's
 * OWN utilities. It sees `text-small` and, finding no such font size in the
 * default theme, files it under `text-<color>` — the same group as
 * `text-primary-foreground` and `text-warning`. Two classes in one group means
 * the last wins, so:
 *
 *     twMerge("bg-primary text-primary-foreground h-9 text-small")
 *       → "bg-primary h-9 text-small"          ← the foreground colour is GONE
 *
 *     twMerge("bg-warning-muted text-warning text-caption")
 *       → "bg-warning-muted text-caption"      ← the severity colour is GONE
 *
 * Both are real class strings from this codebase: the first is every `primary`
 * and `danger` Button, the second is every `SeverityBadge`. The result compiles,
 * renders, and passes every test — it just silently drops the colour half of
 * §11.6's "colour PLUS icon PLUS text" requirement across the whole app.
 *
 * Listing them here puts them in the font-size group where they belong, so a
 * size and a colour stop competing.
 */
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
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_SCALE] }],
    },
  },
});

/**
 * Conditional className join with Tailwind conflict resolution.
 *
 * ⚠️ THIS USED TO BE A PLAIN `filter(Boolean).join(" ")`, AND THAT WAS A
 * DEFENSIBLE CHOICE UNTIL shadcn/ui ARRIVED. The old rationale was that this
 * codebase has no runtime class conflicts to resolve, because our own variants
 * are exhaustive maps rather than overrideable defaults — true, and still true
 * of every hand-written component here.
 *
 * It stopped being sufficient because shadcn components are built the other
 * way: they carry base classes and expect a caller's `className` to WIN. With a
 * plain join, `<Badge className="bg-warning">` emits both `bg-primary` and
 * `bg-warning`, and which one you see is decided by the order Tailwind happened
 * to emit them in — a bug that looks like a styling accident and moves when an
 * unrelated file changes.
 *
 * `twMerge` resolves that by keeping the LAST conflicting utility, which is what
 * every caller means. For non-conflicting classes it produces exactly what the
 * old implementation did — provided it knows our custom scale, hence the block
 * above.
 */
export function cn(...parts: ClassValue[]): string {
  return twMerge(clsx(parts));
}
