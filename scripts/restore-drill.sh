#!/usr/bin/env bash
#
# RESTORE DRILL — PLAN.md Part X §10.10, Phase 7 task 7.4, §12.5.
#
# Restores a dump into a THROWAWAY database and asserts the data is actually
# there. This is the step §12.5 calls out specifically: "restore drill completed
# and documented — a backup that has never been restored is not a backup."
#
# ⚠️ IT RESTORES INTO A SCRATCH DATABASE, NEVER OVER THE SOURCE. A drill that
# can destroy production is a drill nobody runs, which defeats the purpose.
# The scratch database is dropped at the end whether the drill passed or not.
#
# ⚠️ IT COUNTS ROWS IN THE TABLES THE PRODUCT CANNOT FUNCTION WITHOUT. A restore
# that completes with an empty `plans` table looks successful and leaves every
# agency unable to resolve entitlements.
#
# Usage: scripts/restore-drill.sh <dump-file>
set -euo pipefail

# ⚠️ THE POSTGRES CLIENT TOOLS RUN IN THE CONTAINER WHEN THEY ARE NOT ON THE
# HOST. A developer machine frequently has no `pg_dump`, and a drill that only
# runs where somebody happened to `brew install postgresql` is a drill that
# never runs. `PG_EXEC` is the prefix every command below goes through; set
# `PG_LOCAL=1` to force the host binaries.
if [ "${PG_LOCAL:-0}" = "1" ] || command -v pg_dump >/dev/null 2>&1; then
  PG_EXEC=""
else
  PG_EXEC="docker compose exec -T postgres"
fi
run_pg() { if [ -z "${PG_EXEC}" ]; then "$@"; else ${PG_EXEC} "$@"; fi; }

DUMP="${1:?usage: restore-drill.sh <dump-file>}"
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"
# ⚠️ PRISMA'S `?schema=` IS NOT A POSTGRES URI PARAMETER, and `pg_dump` rejects
# the whole URL because of it. Prisma invented it; libpq has never accepted it.
# Stripping the query string is correct here because the dump covers every
# schema in the database anyway.
DB_URL="${DB_URL%%\?*}"
if [ -n "${PG_EXEC}" ]; then DB_URL="${DB_URL/@localhost:/@postgres:}"; DB_URL="${DB_URL/@127.0.0.1:/@postgres:}"; fi
SCRATCH="drift_monitor_restore_drill_$(date -u +%s)"

# Everything up to the database name, so the scratch db lands on the same server.
BASE_URL="${DB_URL%/*}"
ADMIN_URL="${BASE_URL}/postgres"
SCRATCH_URL="${BASE_URL}/${SCRATCH}"

cleanup() {
  echo "→ dropping ${SCRATCH}"
  run_pg psql "${ADMIN_URL}" -q -c "DROP DATABASE IF EXISTS \"${SCRATCH}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "→ creating ${SCRATCH}"
run_pg psql "${ADMIN_URL}" -q -c "CREATE DATABASE \"${SCRATCH}\";"

echo "→ restoring ${DUMP}"
# `--exit-on-error` matters: pg_restore reports partial success by default, and
# "restored with 40 errors" is not a restore.
# Streamed in for the same reason the dump is streamed out — see backup.sh.
run_pg pg_restore --dbname="${SCRATCH_URL}" --no-owner --no-privileges --exit-on-error < "${DUMP}"

echo "→ verifying"
FAILED=0
for TABLE in plans tracker_vendors feature_flags agencies websites scans; do
  COUNT=$(run_pg psql "${SCRATCH_URL}" -t -A -c "SELECT count(*) FROM \"${TABLE}\";" 2>/dev/null || echo "ERR")
  printf "  %-18s %s\n" "${TABLE}" "${COUNT}"
  if [ "${COUNT}" = "ERR" ]; then
    echo "  ✖ ${TABLE} is missing entirely" >&2
    FAILED=1
  fi
done

# The three reference tables are seeded, never empty, and the product is broken
# without them — an empty `tracker_vendors` means every third party reads
# "unknown" and no rule fires, which looks exactly like a clean site.
for TABLE in plans tracker_vendors feature_flags; do
  COUNT=$(run_pg psql "${SCRATCH_URL}" -t -A -c "SELECT count(*) FROM \"${TABLE}\";")
  if [ "${COUNT}" -eq 0 ]; then
    echo "  ✖ ${TABLE} restored empty — the product cannot start from this dump" >&2
    FAILED=1
  fi
done

if [ "${FAILED}" -ne 0 ]; then
  echo "✖ restore drill FAILED" >&2
  exit 1
fi

echo "✔ restore drill passed against ${DUMP}"
