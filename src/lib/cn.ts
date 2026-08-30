/**
 * Conditional className join.
 *
 * Deliberately NOT clsx/tailwind-merge: this codebase has no runtime class
 * conflicts to resolve because variants are exhaustive maps rather than
 * overrideable defaults, so a merge pass would cost a dependency and buy
 * nothing. Falsy entries drop out, which is the whole feature.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
