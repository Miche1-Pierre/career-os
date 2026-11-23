---
name: career-setup
description: Install and configure Career OS for a new user from a freshly downloaded repository. Asks who they are and what they look for, chooses Docker or the local mode (no Docker, database in a folder), creates the data folders and the .env, builds and starts the app, fills the profile, files their CV and creates a desktop shortcut. Use when the user says "installe Career OS", "setup", "configure l'outil", "je viens de télécharger Career OS", or asks to repair or update an install.
---

# Set up Career OS

Goal: a working install whose data survives restarts, with the user's identity, folders and CV in place, in about
ten minutes. Talk in the user's language (French by default), plainly: say what you are about to do, ask grouped
questions, never paste a wall of commands at them. Never invent data. Never print or ask for secrets in the chat
(an API key goes into `.env`, typed by the user).

## 0. Where are we?

- Work from the repository root (`package.json` with `"name": "career-os"`).
- Already installed? If `.env` exists and `GET http://localhost:<APP_PORT>/api/health` answers
  `{"status":"ok","database":{"ok":true}}`, offer to **update or repair** (section 9) instead of reinstalling.
- Check the machine, quietly: OS; `node -v` (local mode needs **Node 22 or newer**); `npm -v`; `git --version`;
  `docker version` (installed? engine running?); free ports (`3000`, `5433`).
- Node missing or too old: say how to get it (Windows: `winget install OpenJS.NodeJS.LTS`, else https://nodejs.org)
  and wait. Do not install software without the user's yes.

## 1. Ask (one message, then confirm the answers back)

1. Prénom et nom ; e-mail ; téléphone (facultatif) ; ville et pays ; langue de l'app (français / anglais).
   Propose the system time zone (`Get-TimeZone` / `timedatectl`) instead of asking for it.
2. Ce que tu cherches : postes ou formations visés, domaines, lieux, type (CDI, stage, alternance, VIE, master,
   thèse…), critères rédhibitoires s'il y en a.
3. Où ranger tes données : propose `~/Documents/CareerOS` (Windows : `%USERPROFILE%\Documents\CareerOS`). Everything
   personal goes there, outside the repository, so an update or a new download never touches it.
4. Ton CV actuel (chemin d'un PDF ou DOCX), et d'autres documents à ranger (lettres, diplômes, relevés…).
5. Mode d'installation:
   - Docker installed and running → ask: **« Local » (recommandé : la base est un dossier sur ton disque, rien d'autre
     à lancer)** or **« Docker »** (PostgreSQL dans un conteneur).
   - No Docker → local mode, without asking.
6. L'IA dans l'application: **Claude Code** (ton abonnement, celui qui tourne ici : rien à configurer, default),
   **clé API Anthropic** (the user pastes it into `.env` himself), or **aucune** (the app works, Claude Code still
   drives it through MCP).

## 2. Create the folders (under the chosen root, written `<HOME>` below)

```
<HOME>/
  documents/     the app's library: one folder per kind (the app files uploads there too)
    CV/  Cover Letters/  Academic/  Certificates/  Recommendations/  Portfolio/
    Presentations/  Contracts/  Admin/  Other/
  data/          local mode: db/ (the database) and app/ (cache: logos, dictation model…)
  backups/       daily automatic backups (JSON), manual backups
```

Keep these folder names (they are the app's: Academic = diplômes, relevés, documents d'écoles; Admin = identité,
logement, démarches). Write `<HOME>/LISEZ-MOI.txt` (or README.txt in English) in 10 lines: what each folder holds,
that backups are automatic, and « ne supprime pas data/db, c'est ta base ». Copy (never move) the documents the user
pointed to into the matching folders.

## 3. Write `.env`

Copy `.env.example` to `.env`, then set (forward slashes in paths, also on Windows):

- Always: `APP_PORT` (3000 unless taken), `APP_BIND=127.0.0.1`, `APP_URL=http://localhost:<APP_PORT>`, `TZ`,
  `AI_OUTPUT_LANGUAGE` (fr / en), `AI_PROVIDER` (`claude-code`, `anthropic` or `none`), `DOCUMENTS_DIR=<HOME>/documents`.
- **Local mode**:
  ```
  CAREER_OS_DB_DIR=<HOME>/data/db
  DB_PORT=5433                      # another free port if 5433 is taken
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:<DB_PORT>/postgres
  DATABASE_POOL_SIZE=1
  DOCUMENTS_ROOT=<HOME>/documents
  APP_DATA_DIR=<HOME>/data/app
  BACKUPS_DIR=<HOME>/backups
  ```
- **Docker mode**: keep `CAREER_OS_DB_DIR` empty; set a random `POSTGRES_PASSWORD` and the matching `DATABASE_URL`;
  the database lives in the `postgres_data` volume (persistent), documents in `DOCUMENTS_DIR` (mounted).
- Anthropic key: tell the user to open `.env` and paste it after `ANTHROPIC_API_KEY=`; never ask for it in the chat.

## 4. Install, build, start

- **Local**: `npm ci` (a few minutes) → `npm run build:local` (3 to 5 minutes) → start:
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts/career-os-local.ps1` (starts a minimized « Career OS »
    window and opens the browser; closing that window stops the app and closes the database cleanly).
  - macOS / Linux: `npm run local` in its own terminal (or ask the user to keep a terminal open).
- **Docker**: `docker compose up -d --build`.
- Wait for `GET <APP_URL>/api/health` → `"database":{"ok":true}` (up to 2 minutes on the first start: migrations).
  If it fails, read the window or `docker compose logs app`, fix, retry. Typical causes: port taken (change
  `APP_PORT` / `DB_PORT`), Node too old, a second copy already running (the database refuses to open twice).

## 5. Fill the app (REST API, header `Authorization: Bearer <APP_ACCESS_TOKEN>` only if that variable is set)

1. `PATCH /api/v1/settings/general` `{ "userName": "<prénom>", "timezone": "<tz>", "dateLocale": "fr-FR" | "en-GB", "currency": "EUR" }`
2. `PATCH /api/v1/settings/profile` `{ "fullName", "email", "phone", "location", "targetRoles": [...], "targetDomains": [...], "preferredLocations": [...], "languages": [...], "dealBreakers": [...] }`
   with the user's answers only.
3. CV given: read it (Read tool); propose `headline`, `summary`, `skills`, `education`, `yearsOfExperience`, `languages`
   taken from it (nothing else); show them; `PATCH /api/v1/settings/profile` once the user agrees.
4. Documents copied in step 2: `GET /api/v1/documents/scan`, then `POST /api/v1/documents/register` with the new files
   (`[{ "relativePath", "name", "kind" }]`, kind among CV, COVER_LETTER, PORTFOLIO, TRANSCRIPT, DIPLOMA, CERTIFICATE,
   RECOMMENDATION, LANGUAGE_CERT, PRESENTATION, ID_DOCUMENT, CONTRACT, OTHER).
5. `PATCH /api/v1/settings/onboarding` `{ "completedAt": "<now, ISO>" }` (skips the welcome wizard).

## 6. Connect Claude Code to the app (MCP)

`.mcp.json` points to `http://localhost:3000/api/mcp`. If `APP_PORT` is not 3000, update that URL. Then tell the user:
« tape `/mcp` et reconnecte `career-os` » so the Career OS tools appear in this conversation.

## 7. Desktop shortcut (Windows, ask first)

Create « Career OS » on the desktop with `WScript.Shell`:
target `powershell.exe`, arguments `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<repo>\scripts\career-os-local.ps1"`
(Docker mode: `scripts\career-os.ps1`), working directory `<repo>`, icon `<repo>\scripts\career-os.ico`.

## 8. Wrap up (short)

- Adresse : `<APP_URL>` · données : `<HOME>` · démarrer : le raccourci (ou `npm run local` / `docker compose up -d`).
- Persistance : la base est `<HOME>/data/db` (local) ou le volume Docker `postgres_data`; une sauvegarde JSON complète
  est écrite chaque jour dans `<HOME>/backups` (Paramètres → Données pour en faire une à la main ou restaurer).
- Mise à jour : `git pull`, `npm ci`, `npm run build:local`, relancer (Docker : `docker compose up -d --build`).
- Premiers pas : « Ajoute cette offre : … », « Qu'est-ce que je dois faire aujourd'hui ? », la page Rechercher.

## 9. Update, repair, move

- Update: as above; migrations apply by themselves at start.
- App does not start: check `.env` paths exist, ports, `node -v`; local mode: is another « Career OS » window open?
- Move the data: stop the app, copy `<HOME>` elsewhere, update the paths in `.env`, start.

## Persistence rules (do not break them)

- Local mode: **one process owns `<HOME>/data/db`** (the local database server started by `npm run local`). Never open,
  copy, zip or delete that folder while the app runs; scripts reach the data through the API or the database port.
- Docker: never run `docker compose down -v` (it deletes the database volume).
- Never put personal data in the repository folder (it is a public project); everything personal lives in `<HOME>`.
