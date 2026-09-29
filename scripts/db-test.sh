#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres, then runs the SQL
# tests in supabase/tests. Needs the Postgres server binaries (initdb,
# pg_ctl) on PATH or in /usr/lib/postgresql/*/bin. Usage: scripts/db-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
DIR="$(mktemp -d)"
PORT="${PGPORT_TEST:-55439}"
if [ "$(id -u)" = "0" ]; then RUN=(runuser -u postgres --); chown postgres "$DIR"; else RUN=(); fi
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
export PGOPTIONS_TEST="-c client_min_messages=notice"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null || { echo "FAILED applying $f"; exit 1; }
done
echo "applied $(ls supabase/migrations/*.sql | wc -l) migrations"

status=0
for t in supabase/tests/*_test.sql; do
  [ -e "$t" ] || continue
  if PGOPTIONS="$PGOPTIONS_TEST" "${PSQL[@]}" -f "$t" 2>&1 | sed "s/^psql:[^ ]* NOTICE:  /  /"; [ "${PIPESTATUS[0]}" = 0 ]; then echo "PASS $t"; else echo "FAIL $t"; status=1; fi
done
exit $status
