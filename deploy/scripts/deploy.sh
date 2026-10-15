#!/usr/bin/env bash
# Updates the server to the checked-out code (M13a): snapshot first (CONSTITUTION §5), then build, migrate, restart.
# Run after `git pull`, from anywhere:  deploy/scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "deploy/.env is missing — copy .env.example and fill it in" >&2; exit 1; }

if docker compose ps --status running --services | grep -qx db; then
  echo "snapshot: $(backup/pg-backup.sh pre-deploy)"
else
  echo "no running database yet — first start, nothing to snapshot"
fi

docker compose build
# `migrate` applies pending migrations and exits; `api` waits for it to succeed before it starts.
docker compose up -d
docker compose ps -a
