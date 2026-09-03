import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

/**
 * ⚠️ THE INVARIANT THE STRICT CSP DEPENDS ON.
 *
 * `src/proxy.ts` allows exactly one inline script under the strict policy, by
 * SHA-256: the pre-hydration theme script. Every other inline script in the app
 * lives under `(marketing)`, where the policy is `'unsafe-inline'` because
 * those pages are prerendered and their bootstrap scripts can carry neither a
 * nonce nor a stable hash.
 *
 * The moment somebody adds a second inline script to an authenticated surface,
 * that script is REFUSED by the browser — and the symptom is not an error but
 * a feature that quietly does nothing on production and works fine in `next dev`
 * (dev sends `'unsafe-eval'` and a looser policy). This test is the only place
 * that failure is visible before a user finds it.
 *
 * If you are adding one deliberately: add its hash to `contentSecurityPolicy`
 * in `src/proxy.ts` and list it below, with a note saying why it must be inline.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : walk(full);
    }
    return full.endsWith(".tsx") ? [full] : [];
  });
}

interface InlineScript {
  file: string;
  line: number;
}

function findInlineScripts(): InlineScript[] {
  return walk(SRC).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((text, index) =>
        text.includes("dangerouslySetInnerHTML")
          ? [{ file: relative(process.cwd(), file), line: index + 1 }]
          : [],
      ),
  );
}

/** Static, `'unsafe-inline'`-covered surface. */
function isMarketing(file: string): boolean {
  return (
    file.includes(`${sep}(marketing)${sep}`) ||
    file.includes(`${sep}marketing${sep}`)
  );
}

describe("inline scripts under the strict CSP", () => {
  it("finds the theme script, so the scan itself is working", () => {
    const found = findInlineScripts();
    expect(found.some((s) => s.file.endsWith(join("components", "theme-provider.tsx")))).toBe(
      true,
    );
  });

  it("allows no inline script outside (marketing) except the theme script", () => {
    const offenders = findInlineScripts().filter(
      (script) =>
        !isMarketing(script.file) &&
        !script.file.endsWith(join("components", "theme-provider.tsx")),
    );

    expect(
      offenders,
      "Inline scripts outside (marketing) are refused by the strict CSP. " +
        "Add a hash in src/proxy.ts, or move the script to a file.",
    ).toEqual([]);
  });

  it("keeps the hashed script free of interpolation", () => {
    /*
     * A hash covers exact bytes. If the script ever contained per-request or
     * per-build data it could not be hashed ahead of time, and the policy would
     * silently stop matching the script it is meant to allow.
     */
    expect(THEME_INIT_SCRIPT).not.toContain("${");
    expect(THEME_INIT_SCRIPT.length).toBeGreaterThan(0);
  });
});
