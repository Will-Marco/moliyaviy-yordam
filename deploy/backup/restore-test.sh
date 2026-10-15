#!/usr/bin/env bash
# Proves a dump really restores (M13a): loads it into a throwaway postgres and compares row counts with the live
# database. Run it right after a dump — rows written since then make the counts differ, and that is reported.
#   backup/restore-test.sh backups/daily/moliyaviy-2026-10-15.dump
set -euo pipefail
cd "$(dirname "$0")/.."

dump="${1:?usage: backup/restore-test.sh <dump-file>}"
[ -s "$dump" ] || { echo "no such dump: $dump" >&2; exit 2; }

name="moliyaviy-restore-test-$$"
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=restore-test postgres:17-bookworm >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1' EXIT
# The image runs its init on a unix socket first and only then listens on TCP: waiting on TCP waits for the real start.
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" createdb -h 127.0.0.1 -U postgres restored
docker exec -i "$name" pg_restore -h 127.0.0.1 -U postgres -d restored --no-owner --exit-on-error < "$dump"

restored() { docker exec "$name" psql -h 127.0.0.1 -U postgres -d restored -tAc "select count(*) from $1"; }
live() { docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc 'select count(*) from $1'"; }

status=0
printf '%-20s %10s %10s\n' table restored live
for table in companies contracts rate_changes operations invoice_drafts _prisma_migrations; do
  r=$(restored "$table"); l=$(live "$table")
  mark=''; [ "$r" = "$l" ] || { mark='  <- differs'; status=1; }
  printf '%-20s %10s %10s%s\n' "$table" "$r" "$l" "$mark"
done
[ "$status" = 0 ] && echo "restore OK: $dump" || echo "counts differ (was anything written after the dump?)" >&2
exit "$status"
