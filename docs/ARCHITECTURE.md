# Career OS — Architecture

> Système personnel de pilotage de carrière : capturer n'importe quelle opportunité en quelques secondes,
> puis la piloter jusqu'à la décision finale. Mono-utilisateur, local-first, Docker.

## 1. Analyse du cahier des charges

Le cœur du produit n'est pas le CRUD mais la **boucle quotidienne** :

```
CAPTURE (coller / URL / fichier / conversation Claude)
   → INBOX (brut, jamais perdu)
   → ANALYSE (IA optionnelle, traçable, jamais inventée)
   → REVUE (l'utilisateur valide avant création)
   → STRUCTURE (Opportunity + Organisation + Contacts + Checklist)
   → SUIVI (statuts, relances, entretiens, deadlines, documents)
   → DÉCISION (Offer / Accepted / Rejected / Closed)
```

Trois principes structurent toutes les décisions :

1. **Déterministe d'abord.** Dates, relances, jours ouvrés, doublons, checklists, statistiques : du code testé, jamais de LLM.
2. **L'IA propose, l'utilisateur dispose.** Chaque donnée extraite porte une provenance (`EXTRACTED` / `INFERRED` / `USER_ENTERED` / `UNKNOWN`) avec citation de la source, vérifiée automatiquement contre le texte original.
3. **Rien ne se perd.** Captures brutes conservées, versions de documents figées (snapshot par empreinte SHA-256), historique d'audit, corbeille, export JSON versionné, sauvegardes automatiques.

## 2. Architecture technique

```
                ┌──────────────── Navigateur (desktop / mobile) ────────────────┐
                │  Next.js App Router · React 19 · Tailwind v4 · shadcn/ui     │
                │  Command palette (Ctrl+K) · raccourcis · dnd-kit (Kanban)     │
                └───────────────┬───────────────────────────────────────────────┘
                                │ Server Components (lecture) + Server Actions (écriture)
┌───────────────────────────────▼───────────────────────────────────────────────────┐
│ Conteneur app (Next.js 16, Node 24)                                                │
│                                                                                    │
│  /api/v1/*  REST (CLI, extension navigateur, intégrations)                         │
│  /api/mcp   Serveur MCP (Streamable HTTP) → Claude Code pilote Career OS            │
│  /api/files Documents (bibliothèque montée + snapshots)                            │
│                                                                                    │
│  src/server/services  ← UNIQUE couche métier (UI, REST et MCP l'appellent)         │
│  src/server/ai        ← AIProvider : claude-code | anthropic | openai | none       │
│  src/server/capture   ← texte / URL (+JSON-LD) / PDF / DOCX / email                │
│  background           ← file d'analyse IA, règles, sauvegardes automatiques        │
└──────────┬─────────────────────────────┬───────────────────────────┬──────────────┘
           │                             │                           │
   PostgreSQL 17 (volume          ./documents (bind)          ./data, ./backups (bind)
   postgres_data)                 bibliothèque CV/lettres     snapshots, uploads, sauvegardes
```

| Choix | Pourquoi |
|---|---|
| **Next.js 16 full-stack** (un seul conteneur applicatif) | Un process, une base de code, pas de CORS ni de séparation front/back artificielle. L'API REST existe quand même pour les clients externes. |
| **Drizzle ORM** (plutôt que Prisma) | Schéma TypeScript, SQL explicite, aucun moteur binaire ni génération de client : image Docker simple, migrations appliquées au démarrage par un script de 1 fichier. |
| **PostgreSQL 17** | Source de vérité, JSONB pour les données spécifiques par type, tableaux pour les tags. |
| **Server Actions + services** | Écritures typées, validées par Zod côté serveur ; les mêmes services servent l'UI, l'API REST et le serveur MCP. |
| **MCP intégré à l'app** | Claude Code (dans ce dossier) se connecte à `http://localhost:3000/api/mcp` via `.mcp.json` : aucune dépendance côté hôte. |
| **Pas d'auth par défaut** | Outil personnel : écoute uniquement sur `127.0.0.1`, protection DNS-rebinding/CSRF (Host + Origin). Un jeton d'accès optionnel (`APP_ACCESS_TOKEN`) protège un déploiement VPS. |

## 3. Modèle de données

18 tables, séparation logique nette, sans sur-normalisation.

```
organizations (kind: COMPANY | INSTITUTION)          ← Company et Institution = même entité
   │ 1─n
   ├── contacts ──n─n── opportunities (via opportunity_contacts, rôle)
   │
opportunities  (type: JOB | FORMATION | INTERNSHIP | ALTERNANCE | VIE | PHD | PROGRAM | OTHER)
   ├── stage_id → pipeline_stages (pipeline JOB | EDUCATION, catégorie, couleur, ordre — personnalisables)
   ├── colonnes communes : titre, lieu, remote, URL, liens[], deadline, dates de candidature/relance,
   │   listes (missions, prérequis, compétences, technos, avantages, documents demandés), tags[], priorité, source
   ├── details JSONB (validé par Zod selon la famille : job ↔ salaire/contrat/séniorité,
   │   éducation ↔ niveau/rentrée/frais/langue/matières/débouchés)
   ├── provenance JSONB   { champ → { source, confiance, citation, vérifiée } }
   ├── analysis JSONB     (matching descriptif décomposable)
   ├── 1─n interviews     (type, date, participants, préparation, questions, feedback, résultat)
   ├── 1─n tasks          (checklist + tâches datées ; auto-complétion par règles)
   ├── 1─n timeline_events (statuts, communications, notes, relances… avec acteur USER/CLAUDE/AI/RULE)
   └── n─n document_versions (via opportunity_documents, rôle CV/lettre…) — version précise, figée
documents 1─n document_versions (chemin hôte, chemin relatif bibliothèque, SHA-256, snapshot)
inbox_items    (capture brute + résultat IA + méta : provider, modèle, prompt, durée)
audit_logs     (qui a changé quoi : champ, avant, après)
tags · settings (clé → JSONB) · saved_views · goals · notifications
```

Décisions notables :

- **Dates « calendrier » en `date`** (deadline, relance, candidature) et non en timestamp : aucune dérive de fuseau.
  « Aujourd'hui » est calculé dans le fuseau de l'utilisateur (`Europe/Paris` par défaut).
- **Statuts = étapes de pipeline en base**, regroupées en 8 catégories stables (`BACKLOG`, `TO_APPLY`, `PREPARING`,
  `APPLIED`, `INTERVIEW`, `OFFER`, `WON`, `LOST`). Les règles métier et le Kanban s'appuient sur les catégories,
  l'utilisateur peut renommer/ajouter/réordonner les étapes librement.
- **Tags en `text[]`** + registre `tags` (couleurs) : filtres rapides (`&&`), export lisible, renommage transactionnel.
- **Soft delete** (`deleted_at`) + archive (`archived_at`) sur les entités importantes ; corbeille restaurable.

## 4. IA

```
AIProvider.generateStructured({ task, system, prompt, schema }) → { data, meta }
   ├── claude-code  : CLI Claude Code headless (`claude -p --json-schema --tools ""`)
   │                  • dans le conteneur (CLAUDE_CODE_OAUTH_TOKEN via `claude setup-token`)
   │                  • ou via le bridge hôte (bridge/claude-bridge.mjs, session Claude déjà connectée)
   ├── anthropic    : SDK officiel, sorties structurées (output_config.format), modèle claude-opus-5-5
   ├── openai       : tout endpoint compatible OpenAI (OpenAI, Ollama, LM Studio, Gemini…)
   └── none         : l'app reste 100 % utilisable ; les captures attendent dans l'Inbox
```

- **Prompts versionnés** (`capture_analysis_v1`, `matching_analysis_v1`, …) avec schéma JSON dérivé de Zod ; sortie
  toujours structurée, validée par Zod, jamais de parsing de texte libre.
- **Anti-hallucination** : tous les champs sont nullables (`null` = Unknown) ; chaque champ renseigné cite sa source ;
  le serveur vérifie que la citation existe réellement dans le texte, sinon le champ est rétrogradé en `INFERRED`.
- **Pré-extraction déterministe** : JSON-LD `JobPosting` des pages d'offres, métadonnées HTML, en-têtes d'email.
- **File d'analyse en arrière-plan** : capturer puis continuer à travailler ; l'item passe « Ready for review » dans l'Inbox.

### Claude Code comme opérateur (« depuis une conversation ici »)

- `.mcp.json` enregistre le serveur MCP `career-os` → 31 outils (today, search, create_opportunity, set_status,
  follow_up, add_interview, attach_document, inbox…, save_analysis…).
- `CLAUDE.md` + skills `.claude/skills/*` décrivent les workflows (importer, traiter l'Inbox, relances, préparation
  d'entretien, analyse). Claude extrait lui-même, avec provenance, et crée les objets via MCP — sans clé API.

## 5. Documents locaux

Le navigateur ne peut pas ouvrir `C:\...` pour des raisons de sécurité : on ne contourne rien.
Solution : **un dossier bibliothèque monté dans le conteneur** (`DOCUMENTS_DIR`, par défaut `C:\Candidature\documents`).

- Scan du dossier → proposition d'enregistrement (type deviné d'après le sous-dossier : `CV/`, `Cover Letters/`, `Academic/`…).
- Chaque version enregistre chemin hôte, chemin relatif, SHA-256, taille, date ; **le contenu est copié dans un
  snapshot adressé par empreinte** (`data/snapshots`) : modifier ou supprimer le fichier plus tard ne détruit jamais
  ce qui a été réellement envoyé.
- Détection des fichiers modifiés depuis la dernière version → « créer v4 ».
- Upload (glisser-déposer) possible, écrit dans la bibliothèque sans jamais écraser un fichier existant.
- Chemins externes (hors bibliothèque) acceptés comme simple référence (bouton « copier le chemin »).

## 6. Sécurité

Validation Zod serveur partout · requêtes paramétrées (Drizzle) · Markdown sans HTML brut · en-têtes de sécurité (CSP,
nosniff, frame-ancestors) · liste blanche d'hôtes (anti DNS-rebinding) et contrôle d'`Origin` sur les mutations ·
import d'URL protégé contre le SSRF (IP privées bloquées, redirections re-vérifiées, taille/timeout bornés) ·
uploads limités (taille, extensions, noms assainis, jamais d'écrasement) · anti path-traversal sur les fichiers ·
secrets uniquement en variables d'environnement, jamais envoyés au navigateur · CLI Claude lancé sans shell, sans outils,
dans un répertoire vide · HTTPS en production via Caddy.

## 7. Déploiement

- **Local** : `docker compose up -d` → http://localhost:3000 (port lié à 127.0.0.1). Migrations au démarrage.
- **VPS** : `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` → Caddy (HTTPS Let's Encrypt
  automatique) → app → PostgreSQL. `APP_ACCESS_TOKEN` obligatoire en production.
- **Sauvegardes** : JSON automatique quotidien (`./backups`, rotation), export JSON/CSV/ZIP depuis l'UI,
  `scripts/backup.(ps1|sh)` pour un `pg_dump` natif, restauration depuis l'UI ou `scripts/restore.*`.

## 8. Périmètre par phase

| Phase | Contenu | État |
|---|---|---|
| **1 — MVP** | Opportunités multi-types, statuts personnalisables, Today, Dashboard, liste filtrable + vues, Kanban, fiche complète, timeline, entretiens, relances (jours ouvrés + fériés FR), deadlines, checklist, documents & versions, contacts, entreprises, établissements, calendrier, tâches, recherche globale + palette, tags, notes Markdown, doublons, audit, corbeille, export/import, Docker | ✅ |
| **2 — Intelligence** | Quick Import (texte/URL/fichier), Inbox, extraction IA avec provenance vérifiée, revue avant création, emails → actions proposées, analyse/matching décomposable, serveur MCP + skills Claude Code, rappels intelligents | ✅ |
| **3 — Automatisation** | Moteur de règles (déclencheur → condition → action) configurable, notifications in-app (architecture multi-canaux), flux ICS calendrier, templates de relance | ✅ (règles intégrées) |
| **3+ — Futur** | Intégration Gmail/Outlook, extension navigateur (l'API `POST /api/v1/capture` est prête), notifications email/Telegram/Discord, sync Google Calendar bidirectionnelle | architecture prête |
| **4 — Power user** | CLI (`career …` sur l'API REST), carte géographique, PWA, LLM local (provider `openai` compatible Ollama) | partiel |

## 9. Risques techniques & parades

| Risque | Parade |
|---|---|
| Sites d'offres (LinkedIn) derrière login / anti-bot | Import URL « best effort » + message clair → coller le texte. JSON-LD exploité quand présent. |
| Hallucinations LLM | Tous champs nullables, provenance + citation vérifiée, revue obligatoire avant création. |
| Latence du CLI Claude (5–60 s) | Analyse asynchrone en file, l'Inbox reçoit le résultat ; l'UI n'est jamais bloquée. |
| Authentification Claude dans Docker | Deux voies : `claude setup-token` (jeton longue durée) ou bridge hôte ; troisième voie sans config : Claude Code + MCP. |
| Fuseaux horaires / dates | Dates calendrier en `date`, arithmétique pure sur `YYYY-MM-DD`, tests dédiés (week-ends, fériés, bissextiles). |
| Fichiers locaux inaccessibles au navigateur | Dossier monté + snapshots ; pas de hack. |
| Perte de données | Volume persistant, sauvegardes auto, export versionné (`schemaVersion`), soft delete. |

## 10. Points de décision (pris par défaut, réversibles)

- **UI en anglais** (comme les maquettes du cahier des charges), dates au format français, sorties IA générées en français (configurable).
- **Accueil = Today** (l'écran le plus utilisé) ; le Dashboard reste à un clic.
- **Modèle IA par défaut** : `claude-opus-5-5` (API) / alias `opus` (CLI Claude Code) — modifiable via `AI_MODEL`.
- **Données de démonstration** proposées à l'onboarding (jamais imposées), supprimables en un clic.
