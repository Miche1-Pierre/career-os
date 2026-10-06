#!/bin/sh
# Career OS container entrypoint: apply migrations + defaults, then start the Next.js server.
set -e

for dir in /data/documents /data/app /data/backups; do
  if [ -d "$dir" ] && [ ! -w "$dir" ]; then
    echo "[career-os] warning: $dir is not writable by uid $(id -u). On Linux: sudo chown -R $(id -u):$(id -g) <host folder>"
  fi
done

echo "[career-os] applying database migrations…"
node dist/migrate.mjs

echo "[career-os] starting on port ${PORT:-3000}"
exec node server.js
