import { beforeEach, describe, expect, it } from "vitest";
import { repositoriesFor } from "../repositories";
import { makeAgency, resetDatabase } from "../testing/factories";

/**
 * USAGE METERING UNDER CONCURRENCY — PLAN.md Part IX §9.2,
 * feature doc 17 ("Usage counters are accurate **under concurrency**").
 *
 * ⚠️ THIS SUITE RUNS AGAINST REAL POSTGRES BECAUSE THE CLAIM IS ABOUT POSTGRES.
 * §9.2 says "the unique constraint makes double-counting impossible under
 * concurrency" — that is a statement about a database constraint and an atomic
 * `increment`, and asserting it against a mock proves nothing at all. The same
 * reasoning `vitest.config.ts` already gives for `tenancy.test.ts`.
 */

const PERIOD_START = new Date(Date.UTC(2026, 8, 1));
const PERIOD_END = new Date(Date.UTC(2026, 9, 1));

describe("consume", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates the row on first use and increments after", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    const first = await repos.billing.consume({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      metric: "SCANS",
      quantity: 1,
    });
    const second = await repos.billing.consume({
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      metric: "SCANS",
      quantity: 1,
    });

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(2);
  });

  it("⚠️ TWENTY CONCURRENT CONSUMES RECORD EXACTLY TWENTY", async () => {
    /*
     * THE ASSERTION THE WHOLE DESIGN EXISTS FOR.
     *
     * A read-then-write (`quantity + 1` computed in application code) loses
     * updates the moment two workers interleave, and the symptom is a customer
     * who ran 400 scans being billed for 380 — plausible, wrong, and invisible
     * without the reconciliation job. `{ increment }` under the
     * `(agencyId, periodStart, metric)` unique constraint is what makes this
     * hold: the constraint decides which concurrent CREATE wins, and the loser
     * falls into the atomic UPDATE branch.
     */
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        repos.billing.consume({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          metric: "SCANS",
          quantity: 1,
        }),
      ),
    );

    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(20);
  });

  it("creates exactly ONE row for concurrent first-use", async () => {
    // Without the unique constraint both racers create a row, and every
    // subsequent read sees only one of them — the counter reads half the truth.
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        repos.billing.consume({
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          metric: "AI_CREDITS",
          quantity: 1,
        }),
      ),
    );

    const rows = await repos.db.usageRecord.findMany({
      where: { periodStart: PERIOD_START, metric: "AI_CREDITS" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(10);
  });

  it("keeps metrics and periods in separate buckets", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);
    const nextPeriod = new Date(Date.UTC(2026, 9, 1));

    await repos.billing.consume({ periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "SCANS", quantity: 3 });
    await repos.billing.consume({ periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "REPORTS", quantity: 5 });
    await repos.billing.consume({ periodStart: nextPeriod, periodEnd: nextPeriod, metric: "SCANS", quantity: 7 });

    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(3);
    expect(await repos.billing.usageFor(PERIOD_START, "REPORTS")).toBe(5);
    // A new period starts from zero — that is what "per month" means, and it is
    // why the period is part of the key rather than a filter on one counter.
    expect(await repos.billing.usageFor(nextPeriod, "SCANS")).toBe(7);
  });

  it("respects the quantity — an advanced AI call costs 3", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);
    await repos.billing.consume({
      periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "AI_CREDITS", quantity: 3,
    });
    expect(await repos.billing.usageFor(PERIOD_START, "AI_CREDITS")).toBe(3);
  });
});

describe("release — a failed action costs nothing", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("gives the credit back", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    await repos.billing.consume({ periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "REPORTS", quantity: 1 });
    await repos.billing.release({ periodStart: PERIOD_START, metric: "REPORTS", quantity: 1 });

    // §12.3: "a failed report must not consume the allowance."
    expect(await repos.billing.usageFor(PERIOD_START, "REPORTS")).toBe(0);
  });

  it("⚠️ NEVER GOES NEGATIVE on a double release", async () => {
    /*
     * A retry that releases twice would otherwise drive the counter below zero
     * and hand the agency free quota — which then surfaces in reconciliation as
     * a discrepancy nobody can explain. The repository floors it with a
     * `quantity >= n` predicate rather than clamping after the fact.
     */
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    await repos.billing.consume({ periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "SCANS", quantity: 1 });
    await repos.billing.release({ periodStart: PERIOD_START, metric: "SCANS", quantity: 1 });
    await repos.billing.release({ periodStart: PERIOD_START, metric: "SCANS", quantity: 1 });

    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(0);
  });

  it("releasing more than was consumed is a no-op, not a negative", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);

    await repos.billing.consume({ periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "SCANS", quantity: 1 });
    await repos.billing.release({ periodStart: PERIOD_START, metric: "SCANS", quantity: 5 });

    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(1);
  });

  it("releasing against a period with no row does nothing", async () => {
    const agency = await makeAgency();
    const repos = repositoriesFor(agency.id);
    await repos.billing.release({ periodStart: PERIOD_START, metric: "SCANS", quantity: 1 });
    expect(await repos.billing.usageFor(PERIOD_START, "SCANS")).toBe(0);
  });
});

describe("usage is tenant-scoped", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("one agency's consumption is invisible to another", async () => {
    // P4. A billing counter that leaked across tenants would bill the wrong
    // customer — the most expensive possible isolation failure.
    const first = await makeAgency();
    const second = await makeAgency();

    await repositoriesFor(first.id).billing.consume({
      periodStart: PERIOD_START, periodEnd: PERIOD_END, metric: "SCANS", quantity: 9,
    });

    expect(await repositoriesFor(second.id).billing.usageFor(PERIOD_START, "SCANS")).toBe(0);
    expect(await repositoriesFor(first.id).billing.usageFor(PERIOD_START, "SCANS")).toBe(9);
  });
});
