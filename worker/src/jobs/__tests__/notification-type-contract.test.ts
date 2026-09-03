import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Prisma } from "@pdm/database";
import { QUEUED_NOTIFICATION_TYPES } from "@pdm/scanner/queue/queues";

/**
 * THE NOTIFICATION-TYPE CONTRACT — the test this defect family earned.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE A TEAM INVITATION SENT ITSELF EIGHT TIMES, NOT
 * BECAUSE A TEST CAUGHT IT. `src/server/actions/team.ts` queued
 * `notificationType: "TEAM_INVITATION"` — a value the Prisma `NotificationType`
 * enum did not contain, typed as `string | null` in `EmailJobData`, and cast
 * through `as never` in the email job. The compiler was silenced three times in
 * a row. The email SENT, then `recordStatus` threw writing history, BullMQ
 * retried, `hasBeenDelivered` found no outcome row, and the same invitation
 * went out again on every one of the eight attempts.
 *
 * The fix has three layers, and this test guards two of them:
 *
 *   1. `EmailJobData.notificationType` is now `QueuedNotificationType | null`,
 *      restated in `packages/scanner` (which stays DB-free, like `AIFeature`)
 *      — a value the queue contract does not know can no longer reach the job.
 *   2. This test: the restated list must equal the Prisma enum, and no source
 *      literal may name a value outside it. Combined with
 *      `packages/database/src/__tests__/enum-parity.test.ts` (schemas ≡ Prisma,
 *      including `notificationType`), all three copies are chained.
 *   3. `worker/src/jobs/email.job.ts` never fails the job after a successful
 *      send — asserted in `email-job-recording.test.ts`.
 */

/**
 * The repo root, found by walking up to the vitest config — NOT by counting
 * `..` segments, which silently miscounts when the runner reports a different
 * module path than the one on disk.
 */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hops = 0; hops < 8; hops += 1) {
    if (existsSync(join(dir, "vitest.config.ts"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("could not locate the repository root from the test file");
}

const ROOT = findRepoRoot();

const prismaEnums = new Map(
  Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]),
);

/** Every QUEUED value must be a value the database accepts — exactly, both ways. */
describe("QUEUED_NOTIFICATION_TYPES mirrors the Prisma NotificationType enum", () => {
  it("is equal to the Prisma NotificationType enum as a set", () => {
    // Read through the DMMF, as `packages/database/src/__tests__/enum-parity.test.ts`
    // does — it is the proven way to read the generated enum, and it keeps this
    // test working whether or not the runtime export shape changes.
    const prismaValues = prismaEnums.get("NotificationType");
    expect(prismaValues, "no Prisma enum named NotificationType").toBeDefined();
    expect([...QUEUED_NOTIFICATION_TYPES].sort()).toEqual([...prismaValues!].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(QUEUED_NOTIFICATION_TYPES).size).toBe(QUEUED_NOTIFICATION_TYPES.length);
  });
});

/**
 * ⚠️ THE LITERAL SCAN. The typed field is the primary guard, but the exact
 * production bug was a literal inside an object that was cast (`as never`) at
 * a boundary — an expression a grep for the field name misses. So scan the
 * actual source: any `notificationType: "SOME_VALUE"` string literal anywhere
 * in `src/` or `worker/src/` must name a value the database accepts. This is
 * the same philosophy as `scripts/check-terminology.ts`: grep the tree,
 * because the type system only sees what it is allowed to see.
 */
describe("no source literal names a NotificationType the database does not accept", () => {
  const SCAN_ROOTS = [join(ROOT, "src"), join(ROOT, "worker", "src")];
  const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "__tests__"]);
  const PATTERN = /notificationType\s*:\s*"([A-Z_]+)"/g;

  function collect(dir: string, into: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) collect(full, into);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
        into.push(full);
      }
    }
    return into;
  }

  it("finds only enum-valid values, across both processes", () => {
    const files = SCAN_ROOTS.flatMap((root) => collect(root));
    // ⚠️ A VACUOUS PASS IS A FAILED GUARD. If the glob stops matching (a
    // directory rename, a Windows path change), this fails instead of
    // silently scanning nothing.
    expect(files.length).toBeGreaterThan(200);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(PATTERN)) {
        const value = match[1]!;
        if (!(QUEUED_NOTIFICATION_TYPES as readonly string[]).includes(value)) {
          offenders.push(`${file}: notificationType "${value}"`);
        }
      }
    }

    expect(
      offenders,
      `These literals will throw PrismaClientValidationError in the email job ` +
        `AFTER the send has already happened. Add the value to the Prisma ` +
        `NotificationType enum (with a migration), or queue null for ` +
        `transactional mail:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
