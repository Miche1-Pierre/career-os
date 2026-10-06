<#
  Career OS launcher — un double-clic pour tout ouvrir.
  Démarre Docker Desktop si besoin, lance les conteneurs (app + base de données),
  attend que l'application réponde, (re)démarre le bridge IA, puis ouvre Career OS
  dans le navigateur.

  Utilisé par le raccourci « Career OS » du bureau.
  Options : -NoBrowser (ne pas ouvrir le navigateur), -NoBridge (ne pas lancer le bridge IA).
#>
param([switch]$NoBrowser, [switch]$NoBridge)

$ErrorActionPreference = 'Continue'
$Proj = 'C:\Candidature'
$Url  = 'http://localhost:3000'
$Docker = 'docker'

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }

$host.UI.RawUI.WindowTitle = 'Career OS'
Write-Host 'Career OS' -ForegroundColor White

# Localiser docker s'il n'est pas dans le PATH
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $cand = "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $cand) { $Docker = $cand }
}

function Test-Engine {
  $null = & $Docker version --format '{{.Server.Version}}' 2>$null
  return ($LASTEXITCODE -eq 0)
}

Step 'Vérification de Docker...'
$engine = $false
for ($i = 0; $i -lt 3; $i++) { if (Test-Engine) { $engine = $true; break }; Start-Sleep -Milliseconds 800 }
if (-not $engine) {
  Step 'Démarrage de Docker Desktop (cela peut prendre une minute)...'
  $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process $dd }
  for ($i = 0; $i -lt 90; $i++) { if (Test-Engine) { $engine = $true; break }; Start-Sleep -Seconds 2 }
  if (-not $engine) {
    Write-Host 'Docker ne répond pas. Ouvre Docker Desktop à la main puis relance le raccourci.' -ForegroundColor Red
    Start-Sleep -Seconds 10; exit 1
  }
}

Step 'Démarrage des conteneurs (app + base de données)...'
Push-Location $Proj
& $Docker compose up -d
Pop-Location

Step "Attente du démarrage de l'application..."
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-WebRequest "$Url/api/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if ($ready) { Write-Host '    Career OS est prêt.' -ForegroundColor Green }
else { Write-Host "    L'app met du temps à répondre ; ouverture quand même." -ForegroundColor Yellow }

# Bridge IA (nécessaire pour les fonctions IA dans l'app). Démarré seulement s'il n'écoute pas déjà.
if (-not $NoBridge) {
  $bridgeUp = $false
  try { $t = New-Object Net.Sockets.TcpClient; $t.Connect('127.0.0.1', 4319); $bridgeUp = $t.Connected; $t.Close() } catch {}
  if (-not $bridgeUp) {
    Step 'Démarrage du bridge IA (fenêtre minimisée, à garder ouverte pour l''IA)...'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run bridge' -WorkingDirectory $Proj -WindowStyle Minimized
  }
}

if (-not $NoBrowser) { Step 'Ouverture de Career OS...'; Start-Process $Url }
Start-Sleep -Seconds 2
