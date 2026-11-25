# Career OS : installation sur Windows, sans droits administrateur et sans Claude Code.
#
#   irm https://get-career-os.vercel.app/install.ps1 | iex
#
# Ce que fait ce script (lis-le avant de le lancer si tu veux, tout est ici) :
#   1. télécharge Node.js (site officiel nodejs.org) et vérifie son empreinte ;
#   2. télécharge Career OS déjà compilé (GitHub, Miche1-Pierre/career-os) et vérifie son empreinte ;
#   3. installe Claude Code (paquet officiel d'Anthropic sur npm), utilisé par l'assistant de l'app ;
#   4. crée tes dossiers : Documents\CareerOS (documents, sauvegardes) et %USERPROFILE%\.careeros (ta base, gardée
#      sur cet ordinateur : OneDrive synchronise souvent Documents, ce qui peut abîmer une base pendant qu'elle tourne) ;
#   5. crée les raccourcis « Career OS » (bureau et menu Démarrer) et l'entrée de désinstallation ;
#   6. ouvre Career OS dans ton navigateur.
#
# Tout est installé dans %LOCALAPPDATA%\CareerOS ; rien n'est modifié dans Windows (ni PATH, ni droits).
# Mettre à jour : relance la même commande (tes données sont conservées).

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $NodeVersion = '24.22.3'
  $Repo = 'Miche1-Pierre/career-os'
  $Base = if ($env:CAREER_OS_INSTALL_DIR) { $env:CAREER_OS_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'CareerOS' }
  $DataRoot = if ($env:CAREER_OS_DATA_DIR) { $env:CAREER_OS_DATA_DIR } else { Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'CareerOS' }
  # The live database stays on this computer, out of Documents (same folder as the Microsoft Store app, see app-home.mjs).
  $LocalRoot = if ($env:CAREER_OS_LOCAL_DIR) { $env:CAREER_OS_LOCAL_DIR } else { Join-Path $env:USERPROFILE '.careeros' }
  $Bundle = if ($env:CAREER_OS_BUNDLE) { $env:CAREER_OS_BUNDLE } else { "https://github.com/$Repo/releases/latest/download/career-os-windows-x64.zip" }
  $AppDir = Join-Path $Base 'app'
  $NodeDir = Join-Path $Base 'node'
  $Node = Join-Path $NodeDir 'node.exe'
  $ClaudeDir = Join-Path $Base 'claude'
  $ClaudeExe = Join-Path $ClaudeDir 'node_modules\@anthropic-ai\claude-code\bin\claude.exe'
  $Temp = Join-Path $env:TEMP ("career-os-" + [guid]::NewGuid().ToString('N').Substring(0, 8))

  function Say([string]$Text, [string]$Color = 'Gray') { Write-Host "  $Text" -ForegroundColor $Color }
  function Step([int]$N, [string]$Text) { Write-Host ''; Write-Host "  [$N/6] $Text" -ForegroundColor Cyan }

  function Get-File([string]$Source, [string]$Target) {
    if ($Source -match '^https?://') { Invoke-WebRequest -UseBasicParsing -Uri $Source -OutFile $Target }
    else { Copy-Item -LiteralPath $Source -Destination $Target }
  }

  function Expand-Zip([string]$Zip, [string]$Target) {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    if (Test-Path $tar) {
      & $tar -xf $Zip -C $Target
      if ($LASTEXITCODE -ne 0) { throw "extraction impossible de $Zip" }
    } else {
      Expand-Archive -LiteralPath $Zip -DestinationPath $Target -Force
    }
  }

  # Deep paths in the app's libraries can pass Windows' 260-character limit, which Remove-Item (PowerShell 5) does not
  # handle: Node.js does, so it deletes once it is installed.
  function Remove-Tree([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    if (Test-Path $Node) { & $Node -e "require('fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 5 })" $Path }
    if (Test-Path -LiteralPath $Path) { Remove-Item -LiteralPath $Path -Recurse -Force }
    if (Test-Path -LiteralPath $Path) { throw "impossible de remplacer $Path (un fichier est peut-être ouvert)" }
  }

  function Test-PortFree([int]$Port) {
    try {
      $listener = New-Object System.Net.Sockets.TcpListener ([Net.IPAddress]::Loopback), $Port
      $listener.Start(); $listener.Stop(); return $true
    } catch { return $false }
  }

  function Find-Port([int]$From, [int]$To) {
    for ($p = $From; $p -le $To; $p++) { if (Test-PortFree $p) { return $p } }
    throw "aucun port libre entre $From et $To"
  }

  function Read-EnvFile([string]$Path) {
    $values = [ordered]@{}
    if (Test-Path -LiteralPath $Path) {
      foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim() }
      }
    }
    return $values
  }

  function Test-Health([string]$Url) {
    try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$Url/api/health").StatusCode -eq 200 } catch { return $false }
  }

  function New-Shortcut([string]$Path, [string]$Target, [string]$Arguments, [string]$Description, [int]$WindowStyle = 1) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($Path)
    $link.TargetPath = $Target
    $link.Arguments = $Arguments
    $link.WorkingDirectory = $AppDir
    $link.IconLocation = (Join-Path $AppDir 'scripts\career-os.ico')
    $link.Description = $Description
    $link.WindowStyle = $WindowStyle
    $link.Save()
  }

  function Install-CareerOS {
    Write-Host ''
    Write-Host '  Career OS : installation' -ForegroundColor Cyan
    Say "Application : $Base"
    Say "Tes données : $DataRoot"
    Say "Ta base : $(Join-Path $LocalRoot 'db')"

    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Career OS a besoin de Windows 64 bits.' }

    # An update must not replace the app while it runs (it owns its database folder).
    $previous = Read-EnvFile (Join-Path $AppDir '.env')
    if ($previous['APP_URL'] -and (Test-Health $previous['APP_URL'])) {
      Say 'Career OS est ouvert : ferme sa fenêtre « Career OS » (barre des tâches) pour continuer la mise à jour…' 'Yellow'
      $closed = $false
      for ($i = 0; $i -lt 120; $i++) { Start-Sleep -Seconds 2; if (-not (Test-Health $previous['APP_URL'])) { $closed = $true; break } }
      if (-not $closed) { throw 'Career OS est toujours ouvert. Ferme sa fenêtre puis relance la commande.' }
      Start-Sleep -Seconds 2
    }

    New-Item -ItemType Directory -Force -Path $Base, $Temp | Out-Null

    Step 1 "Node.js $NodeVersion"
    $haveNode = (Test-Path $Node) -and ((& $Node --version) -eq "v$NodeVersion")
    if ($haveNode) { Say 'déjà installé' }
    else {
      $name = "node-v$NodeVersion-win-x64"
      Say 'téléchargement depuis nodejs.org (≈ 30 Mo)…'
      Get-File "https://nodejs.org/dist/v$NodeVersion/$name.zip" (Join-Path $Temp "$name.zip")
      Get-File "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" (Join-Path $Temp 'SHASUMS256.txt')
      $expected = (Get-Content (Join-Path $Temp 'SHASUMS256.txt') | Where-Object { $_ -match "\s$name\.zip$" } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
      $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Temp "$name.zip")).Hash
      if (-not $expected -or $actual -ne $expected.ToUpper()) { throw 'Node.js téléchargé ne correspond pas à son empreinte officielle.' }
      Expand-Zip (Join-Path $Temp "$name.zip") (Join-Path $Temp 'node')
      if (Test-Path $NodeDir) { Remove-Item -LiteralPath $NodeDir -Recurse -Force }
      Move-Item -LiteralPath (Join-Path $Temp "node\$name") -Destination $NodeDir
      Say 'installé' 'Green'
    }
    $env:PATH = "$NodeDir;$env:PATH"

    Step 2 'Career OS'
    Say 'téléchargement de la dernière version (≈ 100 Mo)…'
    $zip = Join-Path $Temp 'career-os.zip'
    Get-File $Bundle $zip
    Get-File "$Bundle.sha256" "$zip.sha256"
    $expected = ((Get-Content "$zip.sha256" | Select-Object -First 1) -split '\s+')[0]
    $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash
    if (-not $expected -or $actual -ne $expected.ToUpper()) { throw 'Career OS téléchargé ne correspond pas à son empreinte.' }
    $staged = Join-Path $Base 'app.new'
    Remove-Tree $staged
    Expand-Zip $zip $staged
    if (-not (Test-Path (Join-Path $staged 'server.js'))) { throw 'archive Career OS incomplète.' }
    Remove-Tree $AppDir
    Move-Item -LiteralPath $staged -Destination $AppDir
    $version = (Get-Content (Join-Path $AppDir 'VERSION') -ErrorAction SilentlyContinue | Select-Object -First 1)
    Say "version $version installée" 'Green'

    Step 3 "Claude Code (l'assistant de l'app)"
    if ($env:CAREER_OS_SKIP_CLAUDE) { Say 'ignoré' }
    elseif (Test-Path $ClaudeExe) { Say 'déjà installé' }
    else {
      Say 'téléchargement du paquet officiel d''Anthropic (≈ 200 Mo, quelques minutes)…'
      $npm = Join-Path $NodeDir 'npm.cmd'
      New-Item -ItemType Directory -Force -Path $ClaudeDir | Out-Null
      # npm 11 runs install scripts only for allowed packages: Claude Code's one puts its program in place.
      $manifest = '{ "name": "career-os-claude", "private": true, "allowScripts": { "@anthropic-ai/claude-code": true } }'
      [IO.File]::WriteAllText((Join-Path $ClaudeDir 'package.json'), $manifest, (New-Object Text.UTF8Encoding $false))
      & $npm install --prefix $ClaudeDir --no-audit --no-fund --loglevel=error '@anthropic-ai/claude-code' | Out-Null
      if (Test-Path $ClaudeExe) { Say 'installé' 'Green' }
      else { Say 'Claude Code n''a pas pu être installé : l''app marche, l''assistant s''activera en relançant la commande.' 'Yellow' }
    }

    Step 4 'Tes dossiers'
    $folders = 'Academic', 'Admin', 'CV', 'Certificates', 'Contracts', 'Cover Letters', 'Other', 'Portfolio', 'Presentations', 'Recommendations'
    foreach ($f in $folders) { New-Item -ItemType Directory -Force -Path (Join-Path $DataRoot "documents\$f") | Out-Null }
    New-Item -ItemType Directory -Force -Path (Join-Path $DataRoot 'data\app'), (Join-Path $DataRoot 'backups'), $LocalRoot | Out-Null
    # Same texts as scripts/app-home.mjs (Microsoft Store app), rewritten at each install.
    $dbPath = Join-Path $LocalRoot 'db'
    @(
      'Career OS : tes données',
      '',
      'documents\  tes CV, lettres, diplômes, contrats… rangés par type (Career OS y range aussi ce que tu ajoutes).',
      'data\app\   réglages et fichiers de l''application (dont ta clé Claude si tu l''as collée).',
      'backups\    une sauvegarde complète automatique chaque jour (les 14 dernières).',
      '',
      "Ta base (candidatures, entretiens, logements…) est dans $dbPath, sur cet ordinateur seulement :",
      'un dossier synchronisé, comme Documents avec OneDrive, pourrait l''abîmer pendant qu''elle tourne.',
      '',
      "Désinstaller Career OS ne supprime ni ce dossier ni $LocalRoot.",
      '',
      'Changer d''ordinateur :',
      '1. Dans Career OS : Paramètres > Données et sauvegardes > Sauvegarder maintenant.',
      '2. Copie ce dossier CareerOS dans les Documents du nouvel ordinateur (avec OneDrive, il y est déjà).',
      '3. Installe Career OS sur le nouvel ordinateur, puis Paramètres > Données et sauvegardes > Restaurer la',
      '   sauvegarde la plus récente : tes candidatures, tes documents et tes conversations avec l''assistant reviennent.'
    ) | Set-Content -LiteralPath (Join-Path $DataRoot 'LISEZ-MOI.txt') -Encoding UTF8
    @(
      'Career OS : ta base de données',
      '',
      'db\  tes candidatures, entretiens, logements… Ne supprime pas ce dossier.',
      '',
      'Elle reste sur cet ordinateur exprès, hors de Documents : OneDrive ou un autre outil de synchronisation pourrait',
      'l''abîmer pendant qu''elle tourne. Ne la déplace pas dans un dossier synchronisé.',
      "Tes documents et tes sauvegardes quotidiennes sont dans $DataRoot (voir son LISEZ-MOI.txt).",
      'Désinstaller Career OS ne supprime pas ce dossier.'
    ) | Set-Content -LiteralPath (Join-Path $LocalRoot 'LISEZ-MOI.txt') -Encoding UTF8
    Say 'prêts' 'Green'

    Step 5 'Réglages et raccourcis'
    $appPort = if ($previous['APP_PORT']) { [int]$previous['APP_PORT'] } else { Find-Port 3000 3099 }
    $dbPort = if ($previous['DB_PORT'] -and $previous['CAREER_OS_DB_DIR']) { [int]$previous['DB_PORT'] } else { Find-Port 5433 5499 }
    $slash = { param($p) $p -replace '\\', '/' }
    $dbDir = & $slash $dbPath
    # Where the database lived until now (Documents\CareerOS\data\db for older installs): start-local.mjs moves it,
    # once, to $dbDir at the next start, after checking every file.
    $oldDbDir = & $slash (Join-Path $DataRoot 'data\db')
    if ($previous['CAREER_OS_DB_PREVIOUS_DIR']) { $oldDbDir = $previous['CAREER_OS_DB_PREVIOUS_DIR'] }
    if ($previous['CAREER_OS_DB_DIR'] -and $previous['CAREER_OS_DB_DIR'] -ne $dbDir) { $oldDbDir = $previous['CAREER_OS_DB_DIR'] }
    $settings = [ordered]@{
      APP_PORT = "$appPort"; APP_BIND = '127.0.0.1'; APP_URL = "http://localhost:$appPort"
      CAREER_OS_DB_DIR = $dbDir; CAREER_OS_DB_PREVIOUS_DIR = $oldDbDir; DB_PORT = "$dbPort"
      DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:$dbPort/postgres"; DATABASE_POOL_SIZE = '1'
      DOCUMENTS_DIR = (& $slash (Join-Path $DataRoot 'documents')); DOCUMENTS_ROOT = (& $slash (Join-Path $DataRoot 'documents'))
      APP_DATA_DIR = (& $slash (Join-Path $DataRoot 'data\app')); BACKUPS_DIR = (& $slash (Join-Path $DataRoot 'backups'))
      AI_PROVIDER = 'claude-code'; AI_OUTPUT_LANGUAGE = 'fr'; CLAUDE_REQUIRES_KEY = 'true'
      CLAUDE_BIN = (& $slash $ClaudeExe); TZ = 'Europe/Paris'
    }
    # Keep what was set before (another language, extra keys), refresh what the install owns.
    $merged = [ordered]@{}
    foreach ($k in $previous.Keys) { $merged[$k] = $previous[$k] }
    foreach ($k in $settings.Keys) { if ($k -eq 'AI_OUTPUT_LANGUAGE' -and $previous[$k]) { continue }; $merged[$k] = $settings[$k] }
    $lines = @('# Career OS : réglages écrits par l''installation (relancer la commande les met à jour).')
    foreach ($k in $merged.Keys) { $lines += "$k=$($merged[$k])" }
    [IO.File]::WriteAllLines((Join-Path $AppDir '.env'), $lines, (New-Object Text.UTF8Encoding $false))

    if (-not $env:CAREER_OS_NO_SHORTCUTS) {
      $launch = '"' + (Join-Path $AppDir 'scripts\start-local.mjs') + '" --open'
      $desktop = [Environment]::GetFolderPath('Desktop')
      $menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Career OS'
      New-Item -ItemType Directory -Force -Path $menu | Out-Null
      New-Shortcut (Join-Path $desktop 'Career OS.lnk') $Node $launch 'Ouvrir Career OS' 7
      New-Shortcut (Join-Path $menu 'Career OS.lnk') $Node $launch 'Ouvrir Career OS' 7
      $uninstall = Join-Path $AppDir 'scripts\uninstall-windows.ps1'
      $uninstallArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$uninstall`""
      New-Shortcut (Join-Path $menu 'Désinstaller Career OS.lnk') 'powershell.exe' $uninstallArgs 'Désinstaller Career OS'
      $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CareerOS'
      New-Item -Path $key -Force | Out-Null
      $entries = @{
        DisplayName = 'Career OS'; DisplayVersion = "$version"; Publisher = 'Career OS'; InstallLocation = $Base
        DisplayIcon = (Join-Path $AppDir 'scripts\career-os.ico'); UninstallString = "powershell.exe $uninstallArgs"
        URLInfoAbout = 'https://get-career-os.vercel.app'
      }
      foreach ($e in $entries.GetEnumerator()) { New-ItemProperty -Path $key -Name $e.Key -Value $e.Value -PropertyType String -Force | Out-Null }
      New-ItemProperty -Path $key -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
      New-ItemProperty -Path $key -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
      Say 'raccourci « Career OS » sur le bureau et dans le menu Démarrer' 'Green'
    } else { Say 'raccourcis ignorés' }

    Step 6 'Démarrage'
    if ($env:CAREER_OS_NO_START) { Say 'ignoré'; return }
    Start-Process -FilePath $Node -ArgumentList ('"' + (Join-Path $AppDir 'scripts\start-local.mjs') + '"'), '--open' -WorkingDirectory $AppDir -WindowStyle Minimized
    $url = $settings['APP_URL']
    $ready = $false
    for ($i = 0; $i -lt 120; $i++) { if (Test-Health $url) { $ready = $true; break }; Start-Sleep -Seconds 1 }
    Write-Host ''
    if ($ready) {
      Write-Host '  Career OS est installé et ouvert dans ton navigateur.' -ForegroundColor Green
    } else {
      Write-Host "  Career OS démarre encore : ouvre $url dans ton navigateur dans un instant." -ForegroundColor Yellow
    }
    Say "Adresse : $url"
    Say 'Pour activer l''assistant : colle ta clé Claude à la dernière étape du premier lancement.'
    Say 'Pour rouvrir Career OS : le raccourci « Career OS » sur le bureau.'
    Say 'Pour mettre à jour : relance la même commande.'
    Write-Host ''
  }

  try {
    Install-CareerOS
  } catch {
    Write-Host ''
    Write-Host "  L'installation n'a pas abouti : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Relance la même commande. Si ça bloque encore, envoie ce message à la personne qui t''a partagé Career OS.' -ForegroundColor Red
    Write-Host ''
  } finally {
    try { Remove-Tree $Temp } catch { }
  }
}
