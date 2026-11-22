#!/bin/sh
# Career OS — native PostgreSQL dump (pg_dump -Fc) into ./backups
# Usage: scripts/backup.sh [extra compose args, e.g. -f docker-compose.yml -f docker-compose.prod.yml]
set -eu
cd "$(dirname "$0")/.."
docker compose "$@" run --rm backup
echo "Also keep a copy of documents/, data/ (document snapshots) and backups/ outside this machine."
