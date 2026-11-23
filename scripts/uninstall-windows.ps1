<#
  Career OS : désinstallation (installation faite avec la commande du site).
  Supprime l'application, Node.js et Claude Code installés pour elle, les raccourcis et l'entrée dans
  « Applications installées ». Tes données (Documents\CareerOS : documents, base, sauvegardes) sont conservées.
#>
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent $PSScriptRoot
$Base = Split-Path -Parent $App

function Get-EnvValue([string]$Name, [string]$Default) {
  $file = Join-Path $App '.env'
  if (Test-Path $file) {
    $line = Get-Content $file | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
    if ($line) { return ($line -split '=', 2)[1].Trim() }
  }
  return $Default
}

$Url = Get-EnvValue 'APP_URL' 'http://localhost:3000'
$Data = Split-Path -Parent (Get-EnvValue 'BACKUPS_DIR' (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'CareerOS\backups'))

Write-Host ''
Write-Host '  Désinstaller Career OS' -ForegroundColor Cyan
Write-Host "  Tes données restent dans : $Data"
Write-Host ''

try {
  $null = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$Url/api/health"
  Write-Host '  Career OS est ouvert : ferme d''abord sa fenêtre (« Career OS » dans la barre des tâches), puis relance la désinstallation.' -ForegroundColor Yellow
  Read-Host '  Appuie sur Entrée pour fermer'
  return
} catch { }

$answer = Read-Host '  Supprimer Career OS de cet ordinateur ? (o/n)'
if ($answer -notmatch '^(o|oui|y|yes)$') { Write-Host '  Rien n''a été supprimé.'; return }

Set-Location $env:TEMP
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
Remove-Item -LiteralPath (Join-Path $desktop 'Career OS.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $programs 'Career OS') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CareerOS' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Base -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $Base) {
  Write-Host "  Certains fichiers sont encore utilisés. Redémarre l'ordinateur puis supprime le dossier : $Base" -ForegroundColor Yellow
} else {
  Write-Host '  Career OS est désinstallé.' -ForegroundColor Green
}
Write-Host "  Tes documents, ta base et tes sauvegardes sont toujours dans : $Data"
Read-Host '  Appuie sur Entrée pour fermer'
