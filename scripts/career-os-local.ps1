<#
  Career OS (sans Docker) : un double-clic pour tout ouvrir.
  Si l'application ne tourne pas, la démarre dans une fenêtre réduite (base locale + application),
  attend qu'elle réponde, puis l'ouvre dans le navigateur. Fermer cette fenêtre réduite arrête Career OS
  et ferme la base proprement.

  Utilisé par le raccourci « Career OS » du bureau (créé par l'installation avec Claude).
  Options : -NoBrowser (ne pas ouvrir le navigateur).
#>
param([switch]$NoBrowser)

$ErrorActionPreference = 'Continue'
$Proj = Split-Path -Parent $PSScriptRoot
$Port = '3000'
$envFile = Join-Path $Proj '.env'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*APP_PORT\s*=' } | Select-Object -First 1
  if ($line) { $Port = ($line -split '=', 2)[1].Trim() }
}
$Url = "http://localhost:$Port"

function Test-App {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$Url/api/health").StatusCode -eq 200 } catch { $false }
}

if (-not (Test-App)) {
  if (-not (Test-Path (Join-Path $Proj '.next\BUILD_ID'))) {
    Write-Host "Career OS n'est pas encore construit. Dans le dossier $Proj : npm ci puis npm run build:local" -ForegroundColor Red
    Start-Sleep -Seconds 10; exit 1
  }
  Write-Host 'Démarrage de Career OS...' -ForegroundColor Cyan
  Start-Process -FilePath 'powershell.exe' -WorkingDirectory $Proj -WindowStyle Minimized `
    -ArgumentList '-NoProfile', '-Command', "`$host.UI.RawUI.WindowTitle = 'Career OS (fermer pour arrêter)'; npm run local"
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) { if (Test-App) { $ready = $true; break }; Start-Sleep -Seconds 1 }
  if (-not $ready) {
    Write-Host "Career OS ne répond pas sur $Url. Regarde la fenêtre « Career OS » réduite dans la barre des tâches." -ForegroundColor Red
    Start-Sleep -Seconds 10; exit 1
  }
}

if (-not $NoBrowser) { Start-Process $Url }
