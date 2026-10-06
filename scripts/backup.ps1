# Career OS — native PostgreSQL dump (pg_dump -Fc) into .\backups
# Usage: .\scripts\backup.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose run --rm backup
if ($LASTEXITCODE -ne 0) { throw "Backup failed (is the database running? docker compose up -d)" }
Write-Host "Also keep a copy of documents\, data\ (document snapshots) and backups\ outside this computer."
