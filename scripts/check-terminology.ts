#!/usr/bin/env tsx
/**
 * TERMINOLOGY CI GATE — PLAN.md Part I §1.12, Phase 0 task 0.4.
 *
 * Greps user-facing source for language that positions the product as a
 * compliance authority. This is a legal-posture control, not a style check:
 * "positioned as legal compliance and sued over a missed issue" is a named risk
 * in §12.7, and this script plus the runtime validator in packages/ai are the
 * mitigation.
 *
 * Scans src/, packages/, content/ and emails/ — NOT apps/, which does not exist
 * (see PLAN.md §10.9).
 *
 * Run: npm run check:terminology
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  FORBIDDEN_TERMS,
  TERMINOLOGY_ALLOW_MARKERS,
} from "../packages/shared/src/copy/terminology";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "packages", "content", "emails"];
const EXTENSIONS = new Set([".ts", ".tsx", ".md", ".mdx", ".json", ".html"]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "migrations",
  ".turbo",
]);

/**
 * Files that legitimately contain the forbidden words: the vocabulary
 * definition itself, and this script.
 */
const SKIP_FILES = [
  "packages/shared/src/copy/terminology.ts",
  "scripts/check-terminology.ts",
];

/**
 * Spec files assert that the gate FIRES, so they must quote the banned words.
 *
 * Note this skips assertion code only — `__tests__` directories are otherwise
 * scanned, because AGENTS.md puts **test fixtures** inside the ban: fixture
 * copy is the copy that gets pasted into a template later, and a fixture
 * reading "confirmed violation" is exactly how the language leaks into
 * production.
 */
const SPEC_FILE = /\.(test|spec)\.[cm]?tsx?$/;

interface Violation {
  file: string;
  line: number;
  term: string;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory does not exist yet — fine
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

function scan(file: string): Violation[] {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.some((s) => rel === s)) return [];
  if (SPEC_FILE.test(rel)) return [];

  const violations: Violation[] = [];
  const lines = readFileSync(file, "utf-8").split("\n");

  lines.forEach((text, i) => {
    if (TERMINOLOGY_ALLOW_MARKERS.some((m) => text.includes(m))) return;

    const lower = text.toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      const pattern = new RegExp(
        `(^|[^a-z0-9-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9-]|$)`,
        "i",
      );
      if (pattern.test(lower)) {
        violations.push({ file: rel, line: i + 1, term, text: text.trim() });
      }
    }
  });

  return violations;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const violations = files.flatMap(scan);

if (violations.length > 0) {
  console.error(
    `\n✖ Forbidden terminology found in ${violations.length} place(s).\n` +
      `  Privacy Drift Monitor does not assert legal compliance. See PLAN.md Part I §1.12.\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  "${v.term}"`);
    console.error(`    ${v.text.slice(0, 120)}\n`);
  }
  console.error(
    `  Use: potential issue · tracker detected before consent · review recommended ·\n` +
      `       detected / not detected / could not be determined\n`,
  );
  process.exit(1);
}

console.log(`✔ Terminology check passed (${files.length} files scanned).`);
