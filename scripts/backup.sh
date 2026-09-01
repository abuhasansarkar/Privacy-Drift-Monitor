#!/usr/bin/env bash
#
# BACKUP — PLAN.md Part X §10.10, Phase 7 task 7.4.
#
# ⚠️ A BACKUP THAT HAS NEVER BEEN RESTORED IS NOT A BACKUP. §12.5 lists the
# restore drill, not the backup job, as the checklist item — because a dump that
# completes and a dump that can be loaded are different facts, and only the
# second one matters at 3am. `scripts/restore-drill.sh` proves it.
#
# ⚠️ `--format=custom`, NOT PLAIN SQL. Custom format supports parallel restore
# and selective table restore, both of which matter when the thing you need back
# is one table and the dump is 40 GB.
#
# Usage: scripts/backup.sh [output-directory]
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

OUT_DIR="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"
# Inside the container, `localhost` is the container itself.
# ⚠️ PRISMA'S `?schema=` IS NOT A POSTGRES URI PARAMETER, and `pg_dump` rejects
# the whole URL because of it. Prisma invented it; libpq has never accepted it.
# Stripping the query string is correct here because the dump covers every
# schema in the database anyway.
DB_URL="${DB_URL%%\?*}"
if [ -n "${PG_EXEC}" ]; then DB_URL="${DB_URL/@localhost:/@postgres:}"; DB_URL="${DB_URL/@127.0.0.1:/@postgres:}"; fi
FILE="${OUT_DIR}/drift-monitor-${STAMP}.dump"

mkdir -p "${OUT_DIR}"

echo "→ dumping to ${FILE}"
# ⚠️ STDOUT, NOT `--file`. When `pg_dump` runs inside the container, `--file`
# writes to the CONTAINER's filesystem and the host sees nothing — a backup job
# that reports success and produces no file. Streaming to stdout puts the bytes
# on the host either way.
run_pg pg_dump --dbname="${DB_URL}" --format=custom --no-owner --no-privileges > "${FILE}"

# ⚠️ THE SIZE CHECK IS THE POINT. `pg_dump` exits 0 on an empty database, and a
# zero-byte dump uploaded on schedule for six months is the classic backup
# failure — the job is green the whole time.
SIZE=$(wc -c < "${FILE}")
if [ "${SIZE}" -lt 10000 ]; then
  echo "✖ dump is only ${SIZE} bytes — refusing to treat this as a backup" >&2
  exit 1
fi

echo "✔ ${FILE} (${SIZE} bytes)"
echo "${FILE}"
