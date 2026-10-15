#!/usr/bin/env bash
# pg_dump of the shared database (M13a). Run from cron daily, and by deploy.sh before every update (CONSTITUTION §5).
#   backup/pg-backup.sh            daily: keeps 14 days; the dump of the 1st of each month is also kept as monthly
#   backup/pg-backup.sh pre-deploy  snapshot before an update: keeps the last 10
# Prints the path of the dump it wrote. Dumps go to $BACKUP_DIR (default deploy/backups).
set -euo pipefail
cd "$(dirname "$0")/.."
# A dump is the whole database: readable by its owner only.
umask 077

kind="${1:-daily}"
root="${BACKUP_DIR:-backups}"
case "$kind" in
  daily) dir="$root/daily"; file="$dir/moliyaviy-$(date +%F).dump" ;;
  pre-deploy) dir="$root/pre-deploy"; file="$dir/moliyaviy-$(date +%F-%H%M%S).dump" ;;
  *) echo "usage: $0 [daily|pre-deploy]" >&2; exit 2 ;;
esac
mkdir -p "$dir"

# The database credentials live in the db container's own environment; nothing is read from .env here.
tmp="$file.partial"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$tmp"
# A dump that is cut short must not take the place of a good one.
[ -s "$tmp" ] || { rm -f "$tmp"; echo "pg_dump wrote nothing" >&2; exit 1; }
mv "$tmp" "$file"

if [ "$kind" = daily ]; then
  if [ "$(date +%d)" = 01 ]; then
    mkdir -p "$root/monthly"
    cp "$file" "$root/monthly/"
  fi
  find "$dir" -name 'moliyaviy-*.dump' -mtime +13 -delete
else
  ls -1t "$dir"/moliyaviy-*.dump | tail -n +11 | xargs -r rm -f
fi
echo "$file"
