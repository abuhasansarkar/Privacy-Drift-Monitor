# Backups and restore

> **Plan ref:** Part X §10.10, Part XII §12.5 (Phase 7 task 7.4)

## The rule this page exists for

**A backup that has never been restored is not a backup.** §12.5 lists the *restore drill*, not
the backup job, as the checklist item — because "the dump completed" and "the dump can be
loaded" are different facts, and only the second one matters when you need it.

## Scripts

| Script | What it does |
|---|---|
| `scripts/backup.sh [dir]` | `pg_dump --format=custom` to `dir` (default `./backups`), then **refuses a dump under 10 KB** |
| `scripts/restore-drill.sh <dump>` | Restores into a throwaway database, counts rows in six tables, drops the scratch database whichever way it went |

Both run the Postgres client tools **inside the container** when the host has none — a drill
that only runs where somebody happened to `brew install postgresql` is a drill that never runs.
Set `PG_LOCAL=1` to force the host binaries.

## Three things that were wrong the first time these ran

Recorded because each one produces a *silent* failure:

1. **`pg_dump --file` inside the container writes to the container.** The host sees no file and
   the job still exits 0. Both scripts stream through stdout instead.
2. **Prisma's `?schema=public` is not a libpq parameter.** `pg_dump` rejects the entire URL with
   `invalid URI query parameter`. The query string is stripped; a dump covers every schema
   anyway.
3. **`pg_dump` exits 0 on an empty database.** A zero-byte dump uploaded on schedule for six
   months is the classic backup failure — green the whole time. Hence the size floor.

## The size floor and the row counts are the actual test

`pg_restore` reports partial success by default: "restored with 40 errors" is not a restore, so
the drill passes `--exit-on-error`. It then counts rows in `plans`, `tracker_vendors`,
`feature_flags`, `agencies`, `websites` and `scans`, and **fails if any of the three reference
tables came back empty** — a restore with an empty `tracker_vendors` looks successful and leaves
every third party classified as "unknown", which is indistinguishable from a clean site.

## Drill log

| Date | Dump | Result | Notes |
|---|---|---|---|
| 2026-09-01 | `drift-monitor-20260901T025305Z.dump` (197 KB, local docker Postgres) | ✅ passed | 4 plans · 75 vendors · 10 flags · 5 agencies · 10 websites · 120 scans. Found and fixed the three failures above. |

**This drill has only been executed against local docker Postgres.** It has never run against a
managed production instance, and the two differ in the ways that matter — extensions, roles,
`pg_dump` version skew between client and server, and the size of the thing. §12.5 is not
satisfied until it has run there.

## Production schedule — NOT YET CONFIGURED

§10.10 asks for daily automated backups with point-in-time recovery and 30-day retention. That
is a managed-database setting, not a script: it needs the production instance to exist. What is
here is the drill that proves whatever the platform produces is loadable.

- [ ] Managed daily backup enabled with PITR
- [ ] 30-day retention configured
- [ ] Backups stored in a **different region** from the primary
- [ ] `restore-drill.sh` run monthly against a real production dump, logged in the table above
