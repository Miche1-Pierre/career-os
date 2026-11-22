# Déploiement sur un VPS (HTTPS)

Career OS est conçu pour tourner en local. Pour y accéder depuis n'importe où, l'overlay `docker-compose.prod.yml`
ajoute **Caddy** (HTTPS Let's Encrypt automatique) devant l'application et rend le **jeton d'accès obligatoire**.

```
Internet ──443──▶ Caddy (TLS) ──▶ app:3000 ──▶ db:5432
                                   (aucun port publié hormis 80/443)
```

## 1. Prérequis

- Un serveur Linux (1 vCPU / 2 Go de RAM suffisent) avec Docker Engine et le plugin Compose **≥ 2.24**.
- Un nom de domaine dont l'enregistrement DNS `A` (et/ou `AAAA`) pointe vers le serveur.
- Pare-feu : ouvrir uniquement 22 (SSH), 80 et 443, par ex. `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`.

## 2. Installation

Copiez le projet sur le serveur (sans `node_modules`, `.next`, `data`, `backups`), par exemple avec `git` ou `rsync`,
puis créez le `.env` :

```bash
cp .env.example .env
openssl rand -hex 32   # → APP_ACCESS_TOKEN
openssl rand -hex 24   # → POSTGRES_PASSWORD
```

Variables à renseigner dans `.env` :

| Variable | Valeur |
|---|---|
| `DOMAIN` | `career.mondomaine.fr` |
| `APP_ACCESS_TOKEN` | le jeton généré (long et aléatoire) |
| `POSTGRES_PASSWORD` | un mot de passe fort — **avant le premier démarrage** (il est figé à l'initialisation du volume) |
| `DATABASE_URL` | inutile sur le serveur (le conteneur construit la sienne) |
| `AI_PROVIDER` + secrets | `claude-code` avec `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token` sur votre PC), ou `anthropic` + `ANTHROPIC_API_KEY` |
| `DOCUMENTS_DIR` | `./documents` (synchronisez-y vos fichiers : rsync, Syncthing…) |

Le bridge hôte (`npm run bridge`) n'a pas de sens sur un serveur : l'overlay désactive `CLAUDE_BRIDGE_URL`.

## 3. Démarrage

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy app
```

Ouvrez `https://career.mondomaine.fr` : la page de déverrouillage demande le jeton une fois (cookie sécurisé
`HttpOnly`, `Secure`, `SameSite=Lax`, valable un an).

## 4. Claude Code à distance (MCP)

Dans le `.mcp.json` du dossier depuis lequel vous lancez Claude Code :

```json
{
  "mcpServers": {
    "career-os": {
      "type": "http",
      "url": "https://career.mondomaine.fr/api/mcp",
      "headers": { "Authorization": "Bearer ${CAREER_OS_TOKEN}" }
    }
  }
}
```

avec la variable d'environnement `CAREER_OS_TOKEN` définie sur votre poste (le jeton n'est ainsi jamais écrit dans
un fichier versionné). Les clients REST envoient le même en-tête.

## 5. Sauvegardes

- Les sauvegardes JSON automatiques quotidiennes sont écrites dans `backups/` sur le serveur.
- Dump PostgreSQL natif planifié (crontab) :

  ```cron
  0 3 * * * cd /opt/career-os && docker compose run --rm backup >> backups/cron.log 2>&1
  ```

- Copiez régulièrement `backups/`, `data/` (snapshots des documents) et `documents/` **hors du serveur**
  (rsync vers votre PC, stockage objet…). Une sauvegarde qui reste sur la même machine ne protège pas d'une panne.
- Restauration : `scripts/restore.sh backups/<fichier>.dump`, ou *Settings → Data → Backups* pour les sauvegardes JSON.

## 6. Mise à jour

```bash
git pull   # ou rsync de la nouvelle version
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Les migrations sont appliquées automatiquement au démarrage du conteneur. Faites une sauvegarde avant une mise à jour
majeure.

## 7. Check-list sécurité

- [ ] `APP_ACCESS_TOKEN` long et aléatoire (l'overlay refuse de démarrer sans)
- [ ] `POSTGRES_PASSWORD` changé, base non exposée (aucun port publié par l'overlay)
- [ ] Seuls 80/443 (et SSH) ouverts ; SSH par clé uniquement
- [ ] `.env` lisible par vous seul : `chmod 600 .env`
- [ ] Sauvegardes copiées hors du serveur, restauration testée
- [ ] HTTPS actif (Caddy renouvelle les certificats automatiquement ; HSTS activé)
