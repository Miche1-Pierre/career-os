<p align="center">
  <img src="docs/assets/logo.png" alt="Career OS" height="72">
</p>

Système personnel de pilotage de candidatures : emplois, stages, alternances, VIE, masters/formations, thèses.
Capturer une opportunité en quelques secondes (coller un texte, une URL, un fichier, un email), la faire analyser
par Claude **sans jamais inventer d'information**, la vérifier, puis la suivre jusqu'à la décision : statuts,
relances automatiques, entretiens, documents envoyés (version exacte), contacts, deadlines, statistiques.

Mono-utilisateur, local, vos données restent chez vous (PostgreSQL + dossiers sur votre disque).

- Stack : Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · PostgreSQL 17 (Drizzle) · Docker Compose
- Direction artistique : reprise du design system open source **Sparkle** de Dust (licence MIT, voir
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)) — police Geist, gris chauds, accent bleu, clair et sombre
- IA : Claude via Claude Code (votre abonnement), l'API Anthropic, un endpoint compatible OpenAI, ou aucune
- Architecture et choix détaillés : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Démarrage rapide

Prérequis : [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up -d
```

Ouvrez **http://localhost:3000**. Le premier build prend quelques minutes ; les migrations de la base sont
appliquées automatiquement à chaque démarrage. L'assistant d'accueil propose de renseigner votre profil et, si vous
le souhaitez, de charger des données de démonstration (supprimables en un clic : *Settings → Data*).

| Commande | Effet |
|---|---|
| `docker compose up -d` | Démarre (ou redémarre) Career OS |
| `docker compose up -d --build` | Reconstruit l'image après une mise à jour du code |
| `docker compose logs -f app` | Journaux de l'application |
| `docker compose down` | Arrête tout — **les données sont conservées** (volume `postgres_data`) |
| `docker compose down -v` | ⚠️ Arrête **et supprime la base de données** |

Par défaut l'app n'écoute que sur `127.0.0.1` : elle n'est pas accessible depuis le réseau.

---

## L'IA : deux façons de travailler avec Claude

### 1. Depuis une conversation Claude Code (recommandé, rien à configurer)

Ce dossier contient un serveur MCP (`.mcp.json` → `http://localhost:3000/api/mcp`), un `CLAUDE.md` et des
skills (`.claude/skills/`). Lancez Claude Code dans `C:\Candidature` (`claude`, puis `/mcp` pour vérifier que
`career-os` est connecté) et parlez-lui normalement :

- « Ajoute cette offre : *(texte collé, URL ou chemin d'un PDF)* »
- « Traite mon inbox »
- « Qu'est-ce que je dois faire aujourd'hui ? »
- « J'ai postulé chez Doctolib aujourd'hui » · « Relance Roche, rédige le mail »
- « Voici l'email reçu de Siemens : … » → Claude propose les mises à jour (statut, entretien, contact) et les applique
- « Ajoute un entretien technique avec Zefir mardi 14h » · « Prépare mon entretien chez Owkin »
- « Lis mon CV (`documents/CV/CV.pdf`) et remplis mon profil »

Claude extrait les informations avec leur **provenance** (citation exacte de la source, ou « déduit »), vérifie
les doublons, crée les fiches et vous donne leur lien. Il demande confirmation avant toute action irréversible et
n'envoie jamais d'email à votre place.

### 2. Dans l'application (Quick Import, Inbox, analyse d'offre, commandes en langage naturel)

Choisissez **une** option dans `.env`, puis `docker compose up -d`. Vérifiez dans *Settings → AI → Test*.

| Option | Configuration | Remarques |
|---|---|---|
| **A. Bridge hôte** (défaut) | Lancez `npm run bridge` (ou double-cliquez `scripts\start-bridge.cmd`) et laissez la fenêtre ouverte | Utilise votre Claude Code déjà connecté sur ce PC. `CLAUDE_BRIDGE_TOKEN` est déjà généré dans `.env`. Nécessite Node ≥ 20 sur le PC. |
| **B. Jeton dans le conteneur** | `claude setup-token` sur votre PC, collez le jeton dans `CLAUDE_CODE_OAUTH_TOKEN=` | Aucun process à laisser ouvert ; fonctionne aussi sur un VPS. |
| **C. API Anthropic** | `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=` | Facturation à l'usage (modèle par défaut `claude-opus-5-5`). |
| **D. Compatible OpenAI** | `AI_PROVIDER=openai` + `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI, Ollama, LM Studio… |
| **E. Aucune** | `AI_PROVIDER=none` | Tout reste utilisable ; les captures attendent dans l'Inbox que Claude Code (MCP) les traite. |

Réglages communs : `AI_MODEL` (`opus`, `sonnet`… pour Claude Code ; identifiant complet pour l'API),
`AI_EFFORT`, `AI_OUTPUT_LANGUAGE=fr`. Les clés ne quittent jamais le serveur (jamais envoyées au navigateur).

Ce qui est déterministe reste déterministe : dates, relances, jours ouvrés et fériés, doublons, checklists,
statistiques sont calculés par du code testé, sans IA.

---

## Au quotidien

| Raccourci | Action |
|---|---|
| `Ctrl+K` | Palette de commandes et recherche globale (aussi : question en langage naturel à l'IA) |
| `N` | Nouvelle opportunité |
| `I` | Quick Import (coller / URL / fichier) |
| `/` | Rechercher |
| `T` | Aller à *Today* |
| `?` | Liste des raccourcis |

- **Today** : relances dues, entretiens, deadlines, documents manquants, candidatures sans réponse.
- **Relances** : planifiées automatiquement à la candidature (ex. candidature le 29/09 + 7 jours → 06/10),
  intervalle par type, jours ouvrés et fériés français optionnels (*Settings → Follow-ups*).
- **Kanban** (glisser-déposer), liste filtrable avec vues enregistrées, calendrier (export ICS), tâches, statistiques.

## Documents

Rangez vos CV, lettres, relevés… dans `documents/` (ou le dossier défini par `DOCUMENTS_DIR`). Le navigateur ne
peut pas lire vos fichiers locaux, et l'app ne contourne pas cette protection : le dossier est **monté** dans le
conteneur. *Documents → Scan folder* détecte les nouveaux fichiers et ceux modifiés depuis la dernière version.
Chaque version est **copiée** dans `data/snapshots` (empreinte SHA-256) : la version exacte envoyée à chaque
candidature reste consultable même si vous modifiez ou supprimez le fichier d'origine.

## Sauvegardes et restauration

- **Automatique** : une sauvegarde JSON par jour dans `backups/` (14 conservées — `AUTO_BACKUP_HOURS`, `AUTO_BACKUP_KEEP`).
- **Depuis l'app** (*Settings → Data*) : export JSON complet, ZIP (JSON + CSV + fichiers), CSV par table ; import
  (fusion ou remplacement) ; restauration d'une sauvegarde (une sauvegarde de sécurité est faite avant).
- **Dump PostgreSQL natif** :

  ```bash
  docker compose run --rm backup
  ```

  ou `scripts\backup.ps1` (Windows) / `scripts/backup.sh`. Restauration : `scripts\restore.ps1 backups\<fichier>.dump`
  (remplace la base actuelle, demande confirmation).
- Pensez à inclure `documents/`, `data/` et `backups/` dans votre sauvegarde habituelle (OneDrive, disque externe…).

## Déploiement sur un VPS (HTTPS)

Overlay de production avec Caddy (certificat Let's Encrypt automatique) et jeton d'accès obligatoire :
voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## API

- REST : `http://localhost:3000/api/v1/*` (ex. `GET /api/v1/today`, `POST /api/v1/capture`, `GET /api/v1/export?format=json`),
  réponses `{ data }` / `{ error }`. Base pour une future extension navigateur ou une CLI.
- MCP : `http://localhost:3000/api/mcp` (Streamable HTTP, 31 outils).
- Calendrier : `http://localhost:3000/api/v1/calendar.ics`.
- Si `APP_ACCESS_TOKEN` est défini, les clients envoient `Authorization: Bearer <jeton>` ; pour Claude Code, ajoutez
  `"headers": { "Authorization": "Bearer <jeton>" }` au serveur `career-os` de `.mcp.json`.

---

## Développement

```bash
npm install
docker compose up -d db      # PostgreSQL seul, sur localhost:5433
npm run db:migrate
npm run dev                  # http://localhost:3000 (arrêtez le conteneur app avant : même port)
```

| Commande | |
|---|---|
| `npm test` | Tests Vitest : dates/fuseaux/jours ouvrés, relances, doublons, extraction IA (fixtures), intégration base de données (PGlite en mémoire), import/export, MCP, API |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm run db:generate` | Nouvelle migration Drizzle après modification de `src/server/db/schema.ts` |
| `npm run db:studio` | Drizzle Studio |

Organisation du code :

```
src/app/            pages (App Router), Server Actions, routes API (v1, mcp, files, health)
src/components/     UI (shadcn/ui dans components/ui)
src/lib/            logique pure partagée : dates, relances, doublons, schémas Zod, réglages
src/server/services couche métier unique (utilisée par l'UI, l'API REST et le serveur MCP)
src/server/ai       fournisseurs IA, prompts versionnés, vérification anti-hallucination
src/server/capture  extraction texte/URL (JSON-LD)/PDF/DOCX/email, fetch anti-SSRF
src/server/mcp      serveur MCP et outils
bridge/             bridge hôte Claude Code (option A)
drizzle/            migrations SQL
tests/              tests Vitest
```
