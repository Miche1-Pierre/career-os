#!/bin/sh
# Career OS — restore a native PostgreSQL dump (.dump). REPLACES the current database.
# JSON backups (.json.gz) are restored from the app: Settings > Data > Backups.
# Usage: scripts/restore.sh backups/careeros-20260929-030000.dump [extra compose args]
set -eu
FILE=${1:?Usage: scripts/restore.sh <file.dump> [compose args]}
shift
case "$FILE" in *.dump) ;; *) echo "Expected a .dump file (pg_dump custom format)." >&2; exit 1 ;; esac
FILE=$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")
cd "$(dirname "$0")/.."
printf "This REPLACES the current Career OS database with '%s'. Type 'yes' to continue: " "$(basename "$FILE")"
read -r answer
[ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }

echo "Safety dump of the current database first..."
docker compose "$@" run --rm backup

docker compose "$@" stop app
trap 'docker compose "$@" start app' EXIT
docker compose "$@" cp "$FILE" db:/tmp/restore.dump
docker compose "$@" exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/restore.dump; rc=$?; rm -f /tmp/restore.dump; exit $rc' \
  || echo "pg_restore reported errors (see above). Check the app before continuing." >&2
echo "Restore done."
