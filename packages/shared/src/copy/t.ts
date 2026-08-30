import { en, type Copy, type CopyKey } from "./en";

/**
 * COPY LOOKUP — PLAN.md Part XI §11.11.
 *
 * Usage:
 *   import { t } from "@pdm/shared/copy";
 *   <button>{t("auth.signIn")}</button>
 *
 * The key type is derived from the dictionary, so a typo or a renamed key is a
 * TYPE error, not a blank string discovered in production. That type safety is
 * the whole reason this exists rather than components importing `en` directly.
 *
 * There is exactly one locale today. When a second arrives, `t` takes the
 * dictionary from a request-scoped provider; call sites do not change.
 */

const DICTIONARY: Copy = en;

/** Resolves a dot path against the dictionary. */
export function t(key: CopyKey): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[segment]
          : undefined,
      DICTIONARY,
    );

  if (typeof value !== "string") {
    // Unreachable while `CopyKey` is derived from the dictionary, but a runtime
    // guard beats rendering "undefined" if a locale file ever falls behind.
    throw new Error(`Missing copy for key "${key}"`);
  }

  return value;
}

export { en, type Copy, type CopyKey };
