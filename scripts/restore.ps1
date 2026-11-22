# Career OS — restore a native PostgreSQL dump (.dump made by backup.ps1 / `docker compose run --rm backup`).
# REPLACES the current database. JSON backups (.json.gz) are restored from the app: Settings > Data > Backups.
# Usage: .\scripts\restore.ps1 backups\careeros-20260929-030000.dump
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"
$File = (Resolve-Path $File).Path
Set-Location (Join-Path $PSScriptRoot "..")
if ($File -notlike "*.dump") { throw "Expected a .dump file (pg_dump custom format). For .json.gz use Settings > Data > Backups." }
$answer = Read-Host "This REPLACES the current Career OS database with '$(Split-Path $File -Leaf)'. Type 'yes' to continue"
if ($answer -ne "yes") { Write-Host "Cancelled."; exit 1 }

Write-Host "Safety dump of the current database first..."
docker compose run --rm backup
if ($LASTEXITCODE -ne 0) { throw "Safety backup failed; nothing was changed." }

docker compose stop app
try {
  docker compose cp "$File" db:/tmp/restore.dump
  docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U $POSTGRES_USER -d $POSTGRES_DB /tmp/restore.dump; rc=$?; rm -f /tmp/restore.dump; exit $rc'
  if ($LASTEXITCODE -ne 0) { Write-Warning "pg_restore reported errors (see above). Check the app before continuing." }
} finally {
  docker compose start app
}
Write-Host "Restore done: http://localhost:3000"
