/**
 * WORKER-KILL DRILL — PLAN.md Part XII §12.5, Phase 7 task 7.5.
 *
 * §12.5: "Stuck-scan recovery verified **by killing a worker mid-scan**."
 *
 * ⚠️ THIS IS THE FAILURE THAT LOOKS LIKE SUCCESS. A worker killed mid-scan
 * leaves a row saying RUNNING forever. The scheduler's in-flight check then
 * refuses to schedule that website EVER AGAIN — the site silently stops being
 * monitored, and nothing in the UI says so. It is the worst failure this system
 * can have, because it is indistinguishable from everything working.
 *
 * The drill creates exactly what a killed worker leaves behind and asserts that
 * `recoverStuckScans()` both reclaims it AND frees the website for scheduling —
 * the second half being the part that actually matters.
 *
 * Run: npx tsx worker/src/stuck-scan.drill.ts
 */
import { unsafeGlobalClient } from "@pdm/database";
import { recoverStuckScans } from "./scheduler";

const db = unsafeGlobalClient("an operational drill over every agency's scans");

async function main() {
  const website = await db.website.findFirst({
    where: { archivedAt: null },
    select: { id: true, agencyId: true, url: true },
  });
  if (!website) throw new Error("no website to drill against — seed one first");

  const scan = await db.scan.create({
    data: {
      agencyId: website.agencyId,
      websiteId: website.id,
      status: "RUNNING",
      trigger: "MANUAL",
      scannerVersion: "drill",
      workerId: "worker-killed",
      // Backdated past `SCAN_STUCK_AFTER_MS`. This is precisely the row a
      // process killed mid-scan leaves; nothing else in the system removes it.
      startedAt: new Date(Date.now() - 45 * 60 * 1000),
    },
  });
  console.log(`orphaned scan ${scan.id} (${scan.status})`);

  const reclaimed = await recoverStuckScans();
  console.log(`reclaimed: ${reclaimed}`);

  const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
  console.log(`after: ${after.status} ${after.errorCode ?? ""}`);

  const inFlight = await db.scan.count({
    where: { websiteId: website.id, status: { in: ["QUEUED", "RUNNING"] } },
  });
  console.log(`still in flight for ${website.url}: ${inFlight}`);

  await db.scan.delete({ where: { id: scan.id } });

  const ok =
    after.status === "FAILED" && after.errorCode === "SCAN_TIMEOUT" && inFlight === 0;
  console.log(ok ? "✔ stuck-scan recovery drill passed" : "✖ drill FAILED");
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
