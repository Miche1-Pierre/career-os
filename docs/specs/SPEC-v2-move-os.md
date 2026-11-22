# Spec v2 — De la recherche à l'installation

> Statut : **brouillon pour revue** (22/11/2026). Rien n'est implémenté.
> Objectif : que Career OS suive Pierre de la première recherche d'opportunité jusqu'à son installation sur place,
> puis enchaîne sur la suivante. Tout en local, dans la même application, avec Claude comme assistant.

---

## 0. En une page

Aujourd'hui, Career OS couvre **trouver → postuler → suivre → décider**. La v2 ajoute ce qui se passe avant et après :

```
 PRÉPARER            CHERCHER            POSTULER            DÉCIDER             S'INSTALLER            VIVRE LÀ-BAS
 Profil, CV,    →    Offres (jobs,  →    Kit de candidature,  →  Entretiens,   →   Logement, démarches,  →  Budget réel,
 messages types      formations…)        canal, relances        offre, contrat     budget, voyage           prochaine cible
```

Quatre nouveaux blocs, dans l'ordre de valeur pour Pierre :

| # | Bloc | Ce que ça apporte | Exemple concret (BlackFin) |
|---|---|---|---|
| 1 | **Projet d'installation** (« Move ») | Créé quand une offre est signée : destination, dates, adresse du lieu de travail, salaire net, checklist | Bruxelles, 04/01 → 02/07/2027, 106 av. Louise, 1 600 €/mois |
| 2 | **Logement** | Recherches sauvegardées, annonces (scrapées, importées ou collées), shortlist, contacts, visites, comparaison | Le fichier Excel actuel, mais vivant, avec statuts et relances |
| 3 | **Budget** | Plan mensuel + coûts ponctuels, épargne visée, comparaison des logements par épargne restante | « Cohabs Saint-Gilles → 236 €/mois d'épargne » |
| 4 | **Démarches** | Checklists par pays (visa, domiciliation, santé, banque…) avec documents et échéances | France → Belgique : commune, CEAM, compte… ; France → Canada : permis, NAS, RAMQ |

Et deux blocs transverses qui renforcent l'existant :

| # | Bloc | Ce que ça apporte |
|---|---|---|
| 5 | **Moteur de découverte** | Claude (et des connecteurs) cherchent des offres d'emploi **et** des logements selon des critères, alimentent la base, disent ce qu'ils n'ont pas pu atteindre et où chercher à la place |
| 6 | **Matériaux** | CV structuré → PDF généré (variantes FR/EN/rôle), messages d'accroche, lettres, « kit de candidature » par opportunité |

**Principes inchangés** : déterministe d'abord, l'IA propose / l'utilisateur dispose, rien ne se perd, **jamais d'envoi automatique** (on prépare, Pierre envoie).

### Retours de Pierre (22/11) intégrés

| Sujet | Décision |
|---|---|
| Lisibilité du parcours | Le parcours est **linéaire** : on l'affiche comme une suite de blocs (Préparer → Chercher → Postuler → Décider → S'installer → Vivre là-bas) avec une **frise d'avancement** par opportunité et par Move. Chaque écran ne montre que son bloc (§ 8). |
| Un seul endroit pour demander | **Chat intégré** dans l'app, disponible partout (§ 3bis). On lui demande de lancer une recherche, il propose, Pierre valide, il exécute, les résultats arrivent dans le chat **et** dans les écrans. |
| Connexion IA | **Claude d'abord** (abonnement de l'utilisateur, via Claude Code). **Codex (OpenAI)** ensuite : le CLI Codex se connecte avec un compte ChatGPT, donc même principe, à brancher en phase ultérieure. |
| Choix du modèle | **Automatique par tâche**, invisible pour l'utilisateur (§ 3.3). Pas de limite imposée par défaut. |
| Quota | Afficher l'usage du forfait Claude (fenêtre de 5 h, quota hebdomadaire) **si Claude Code l'expose** ; sinon estimation locale à partir des runs. Alerte quand on approche de la limite. |
| CV | Gabarits **sans IA** qui reproduisent fidèlement les CV actuels ; l'IA sert au contenu (adapter à une offre) et à la **traduction FR ↔ EN**. Profil pré-rempli en important un CV existant (§ 7). |
| Sans Docker | Mode **sans Docker** avec base embarquée dans un dossier (§ 2bis), pas de fichiers JSON éparpillés. |
| Contrat | **Analyse de contrat** : points défavorables, clauses manquantes, questions à poser, comparaison au marché (§ 2.1). |
| Logement | Photos récupérées, **détection d'arnaques** par comparaison entre sources, documents à préparer pour un dossier de location. |
| Démarches | Exigences officielles **pour n'importe quel pays**, recherchées sur les sites gouvernementaux, avec liens (§ 6). |
| Voyage | Bloc vol / train : où réserver, options, coût, tendances de prix selon l'anticipation, toujours sourcées (§ 6bis). |
| Calendrier, carte, partage | Visites, échéances et départ dans le calendrier existant (+ ICS) ; carte ; partage de la shortlist. |
| Design | On reste sur le design Sparkle (Dust). |

---

## 1. Parcours utilisateur cible

1. **Préparer** — Pierre remplit son profil, ses variantes de CV (AI Product FR, Founding EN…) et ses messages types.
   Il exporte un CV en PDF en un clic, la version envoyée est figée (comme aujourd'hui pour les documents).
2. **Chercher** — Il crée une recherche « Forward Deployed Engineer · Bruxelles, Paris, remote EU · CDI ou stage ».
   Le moteur ramène des offres dans l'Inbox avec provenance ; ce qui n'est pas atteignable (LinkedIn) devient un lien
   de recherche pré-rempli + « colle l'annonce ici ».
3. **Postuler** — Sur une opportunité : kit de candidature (CV version X, lettre, message LinkedIn), canal choisi
   (LinkedIn, Indeed, HelloWork, site, email direct), la candidature est datée, les relances se planifient (existant).
4. **Décider** — Entretiens (existant), puis **Offre** : salaire brut/net, dates, lieu, type de contrat, avantages,
   checklist de relecture du contrat (durée, préavis, congés, propriété intellectuelle…), contrat signé archivé.
5. **S'installer** — L'offre acceptée propose « Créer le projet d'installation ». Le Move regroupe :
   logement (recherche → shortlist → contact → visites → choix), budget, démarches, voyage, documents.
6. **Vivre là-bas** — Le budget passe en suivi réel léger, et Pierre peut définir sa **prochaine cible** :
   le cycle recommence (recherche sauvegardée, alertes).

---

## 2. Modèle de données (ajouts)

Conventions existantes conservées : `uuid` PK, `createdAt/updatedAt`, soft delete, `provenance` JSONB, dates
calendrier en `date`, montants en **centimes entiers** + `currency` (ISO 4217).

### 2.1 Offre et contrat (extension d'`opportunities`)

`details.offer` (JSONB validé par Zod) :
`salaryGross`, `salaryNet`, `period` (MONTH/YEAR/HOUR), `currency`, `startDate`, `endDate`, `workAddress`,
`contractType` (CDI, CDD, stage, CIP, VIE, freelance…), `benefits[]` (chèques-repas 10 €/jour…),
`trialPeriod`, `noticePeriod`, `paidLeave`, `contractDocumentVersionId`, `reviewChecklist[]`.

**Analyse de contrat** (bouton sur l'offre, Opus) : à partir du PDF signé ou à signer, l'outil produit
- les clauses en défaveur de l'utilisateur (ex. « pas de préavis possible de ton côté », « absences non payées ») ;
- les clauses absentes (congés, propriété intellectuelle, confidentialité, télétravail) ;
- les incohérences internes (adresse 106 / 120, 37,5 h / 38 h) ;
- les **questions à poser** avant de signer, en brouillon de mail ;
- une comparaison au minimum légal du pays quand une source officielle existe (citée).
Chaque point cite l'article concerné. Descriptif, jamais « signe / ne signe pas ».

### 2bis. Stockage : avec ou sans Docker

- **Avec Docker** (actuel) : PostgreSQL dans un conteneur.
- **Sans Docker** : la même base, embarquée (**PGlite**, déjà utilisée par les tests), stockée dans un dossier
  `CareerOS/data/db`. Mêmes tables, mêmes migrations, rien à installer. L'app se lance comme un programme normal.
- Dans les deux cas, un dossier lisible par un humain :
  ```
  CareerOS/
    documents/   CV, lettres, contrats, pièces (bibliothèque existante)
    data/        base, snapshots, photos des annonces
    backups/     sauvegardes JSON quotidiennes (une archive complète, lisible)
    exports/     exports Excel / PDF partagés
  ```
- Pas de « un fichier JSON par opportunité » comme source de vérité : trop fragile dès qu'il y a des liens entre
  objets. Le JSON reste le format de sauvegarde et d'export.

### 2.2 Nouvelles tables

```
moves                       projet d'installation
  id, opportunityId?, title, city, country, timezone, currency,
  arrivalDate, departureDate?, workPlaceId → places,
  status (PLANNING | SEARCHING_HOUSING | READY | MOVED | DONE), notes

places                      adresses géocodées réutilisables (bureau, logements, club de judo…)
  id, label, address, city, country, lat, lng, geocodeSource, kind (WORK | HOUSING | POI)

housing_searches            critères d'une recherche logement (liée à un move)
  id, moveId, criteria JSONB {
    maxTotalMonthly, currency, furnished: REQUIRED|PREFERRED|ANY, types[ROOM_COLIVING|ROOM_FLATSHARE|STUDIO|APARTMENT],
    from, to (dates), maxCommuteMinutes, commuteMode (WALK|TRANSIT|BIKE), mustHave[], niceToHave[],
    maxHousemates?, privateBathroom?, gender restrictions to EXCLUDE }
  sources[] (ids de housing_sources), schedule (OFF|DAILY|WEEKLY), lastRunAt

housing_listings            une annonce (dédupliquée)
  id, moveId, searchId?, sourceId, externalId, url, title, placeId,
  rentCents, chargesCents, chargesInclude[] (eau, gaz, élec, wifi, ménage, assurance…), allInclusive bool,
  depositCents, depositText, oneOffFees[{label, cents}], availableFrom, minLeaseMonths, leaseText,
  furnished (YES|SEMI|NO|UNKNOWN), type, roomSizeM2, privateBathroom, housemates, housemateProfile,
  contacts { appUrl, email, phone, whatsapp, contactForm, managerName },
  commute { distanceKm, walkMinutes, transitMinutes?, computedAt },
  fit { dates: OK|KO|UNKNOWN, budget, furnished, commute } (calculé, déterministe),
  status (NEW | SHORTLISTED | TO_CONTACT | CONTACTED | REPLIED | VISIT_PLANNED | VISITED | APPLIED |
          ACCEPTED | DECLINED | GONE | EXCLUDED), excludedReason, myRating (1–5), familyApproved bool,
  notes, provenance, rawCaptureId → inbox_items

housing_visits              id, listingId, date, time, mode (IN_PERSON|VIDEO), address, checklist[], outcome, notes

budgets                     un plan par move (ou « vie courante »)
  id, moveId?, currency, months, savingsTargetCents,
  income[{label, cents, restrictedTo?: FOOD}], expenses[{label, cents, category, linkedTo?: HOUSING|TRANSPORT}],
  oneOff[{label, cents, dueDate?}], assumptions[{label, value, source}]

procedures                  démarches administratives
  id, moveId, templateKey?, title, country, category (VISA|RESIDENCE|HEALTH|TAX|BANK|TRANSPORT|OTHER),
  status (TODO|IN_PROGRESS|WAITING|DONE|NOT_NEEDED), dueDate, officialUrl, notes
procedure_steps             id, procedureId, order, title, done, dueDate, requiredDocuments[], documentVersionIds[]

trips                       id, moveId, date, from, to, mode, costCents, bookingRef, notes (simple)

discovery_sources           registre des sites par pays et par domaine
  id, domain (JOBS|HOUSING), name, baseUrl, countries[], access (API|PUBLIC_FETCH|JSONLD|LOGIN_ONLY|MANUAL),
  connectorKey?, notes (« Immoweb : favoris derrière login »), typicalPriceHint, lastCheckedAt, health

saved_searches (jobs)       critères de recherche d'offres + schedule (réutilise discovery_sources)

research_runs               journal de chaque recherche (IA ou connecteur)
  id, kind (JOBS|HOUSING|COUNTRY_INFO), searchId, provider, model, startedAt, durationMs, costUsd,
  sourcesTried[{sourceId, ok, reason}], resultsFound, resultsNew, suggestions[] (sites non atteints + pourquoi)

message_drafts              brouillons (jamais envoyés par l'app)
  id, target (OPPORTUNITY|LISTING|CONTACT), targetId, channel (EMAIL|WHATSAPP|SMS|APP|LINKEDIN|FORM),
  language, subject, body, templateKey, status (DRAFT|SENT_MANUALLY|REPLIED), sentAt (déclaré par Pierre)

cv_profiles / cv_variants   CV structuré (sections, entrées, langues) + variantes (ordre, sélection, accroche)
templates                   messages types et lettres (variables {{company}}, {{role}}, {{dates}}…)
```

La table `timeline_events` est réutilisée pour tout (statut d'annonce, message envoyé, visite) avec une cible
polymorphe (`targetType`, `targetId`) au lieu du seul `opportunityId`.

---

## 3. Moteur de découverte (« scraping »)

### 3.1 Trois niveaux, du plus fiable au plus souple

| Niveau | Comment | Quand | Coût |
|---|---|---|---|
| **A. Connecteurs** | Code déterministe par source : API officielles (ex. France Travail, Adzuna, Jooble pour l'emploi), pages publiques + JSON-LD / microdonnées, sitemaps/RSS. Réutilise `capture/safe-fetch` (anti-SSRF, timeouts). | Sources stables et autorisées | Gratuit, rapide |
| **B. Agent Claude** | `claude -p` via le bridge, **outils limités à WebSearch + WebFetch**, sortie JSON stricte (schéma Zod), citations vérifiées contre les pages récupérées | Sources sans connecteur, pays nouveaux, « trouve-moi des colocs meublées à Montréal < 1 100 CAD » | Quota Claude, borné |
| **C. Assisté navigateur** | Pierre ouvre ses favoris (Immoweb, LinkedIn…) ; Claude in Chrome ou une future extension envoie la page à `POST /api/v1/capture` | Sites derrière login / anti-bot | Manuel, déclenché par Pierre |

### 3.2 Règles

- **Pas d'automatisation de connexion côté serveur**, pas de contournement d'anti-bot ou de CAPTCHA, respect des
  conditions des sites (LinkedIn et Indeed interdisent le scraping → liens de recherche pré-remplis + import par
  collage ou navigateur).
- Débit limité par domaine, cache des pages, `User-Agent` générique (aucune donnée personnelle).
- **Déduplication** : URL canonique, puis (adresse + loyer + surface) pour les logements, (entreprise + titre + ville)
  pour les offres. Une même annonce vue sur deux sites devient une seule fiche avec deux sources.
- **Vérification** : le prix « affiché » n'est pas le prix total. Le moteur lit le détail de l'annonce et sépare
  loyer / charges / ce que couvrent les charges / garantie / frais (cas réel : « 565 € » sur la liste = 835 € tout
  compris, bail 12 mois).
- **Rapport honnête** à chaque run : « 14 annonces trouvées, 3 nouvelles. Pas pu lire Zimmo (login) et Kot.be
  (bloqué) : voici les liens de recherche pré-remplis. Pour Bruxelles, regarde aussi Spotahome, Cohabs, Ikoab,
  Neybor (prix typiques 750–900 € pour une chambre en coliving). »

### 3.3 Coûts et modèles

Le modèle est **choisi automatiquement selon la tâche** ; l'utilisateur n'a rien à régler (un réglage avancé
existe pour qui veut). Opus est le plus lourd : réservé aux tâches où il fait la différence.

| Tâche | Modèle |
|---|---|
| Extraction d'une annonce, d'une offre, d'un CV | Haiku |
| Recherche web, chat courant, rédaction de messages | Sonnet |
| Analyse de contrat, analyse de fit, préparation d'entretien, démarches d'un nouveau pays | Opus |

Pas de plafond imposé par défaut. Chaque run garde son modèle et son coût estimé (`research_runs`). Un indicateur
dans la barre latérale montre l'usage du forfait Claude (fenêtre de 5 h et semaine) si Claude Code l'expose,
avec une alerte vers 80 %. Un plafond optionnel est disponible pour les petits forfaits.

## 3bis. Chat intégré

- Un **panneau de chat** ouvrable partout (raccourci `C`, ou bouton en bas de la barre latérale), qui connaît
  l'écran courant : depuis le Move Bruxelles, « cherche-moi des colocs » sait de quoi on parle.
- Derrière : Claude Code via le bridge hôte ou le jeton du conteneur, avec **les outils de Career OS** (les
  mêmes que le serveur MCP) + recherche et lecture web. Rien d'autre (pas de shell, pas de fichiers).
- **Proposer, puis exécuter** : pour toute action qui écrit (lancer une recherche, créer des annonces, changer un
  statut), le chat affiche ce qu'il va faire sous forme de carte « Lancer / Modifier / Annuler ».
- Les résultats apparaissent dans le chat (résumé + liens vers les fiches) et dans les écrans concernés.
- Historique des conversations conservé et rattaché au Move ou à l'opportunité.
- Fournisseurs : **Claude** (P1), **Codex / ChatGPT** (plus tard, même interface).

### 3.4 Planification

Recherches sauvegardées : manuel, quotidien, hebdomadaire. Exécutées par la file de fond existante quand l'app tourne.
Nouveaux résultats → Inbox (offres) ou liste « Nouveaux » du logement + notification.

---

## 4. Logement

### 4.1 Écrans

**Move › Logement**, trois vues sur la même liste :

1. **Shortlist (par défaut)** — tableau compact : nom, quartier, total/mois, épargne/mois, trajet, dispo, bail,
   statut. Un badge par critère bloquant (bail 12 mois, non meublé, dispo trop tard) au lieu d'une colonne chacun.
   Tri par défaut : critères OK, puis épargne.
2. **Pipeline** — Kanban par statut (Nouveau → À contacter → Contacté → Réponse → Visite → Choisi), glisser-déposer.
3. **Carte** — points sur fond OpenStreetMap, lieu de travail et POI (club de judo), rayon de marche.

**Fiche annonce** (panneau latéral, pas une nouvelle page) :
coûts détaillés (loyer, charges et ce qu'elles couvrent, garantie, frais, **total**), conditions (dispo, bail,
meublé), la maison (colocs, profil, salle de bain), trajet, contacts dans l'ordre **app → email → téléphone/WhatsApp**,
brouillon de message, visites, notes, avis « parents OK ».

**Comparer** : 2 à 4 annonces côte à côte, différences surlignées.

### 4.2 Contact et visites (sans envoi automatique)

- « Préparer un message » génère un brouillon depuis un modèle (FR/EN selon l'annonce) avec les questions manquantes
  (dates, bail minimum, ce que couvrent les charges, garantie, colocs) **déduites des champs vides** de la fiche.
- Boutons : copier, ouvrir le mail pré-rempli, ouvrir WhatsApp (`wa.me`) pré-rempli, ouvrir le site. Pierre envoie ;
  il marque « envoyé », une relance J+3 se crée (règle existante).
- **Planificateur de visites « one-shot »** : Pierre choisit un jour (ex. samedi 12/12), l'outil propose un ordre de
  visites par proximité et des créneaux de 45 min, puis prépare les messages de proposition de créneau.
- Checklist de visite (état, bruit, cuisine partagée, propreté des communs, ambiance, colocs rencontrés).

### 4.2bis Fiabilité des annonces

- **Photos** récupérées (vignettes stockées localement) pour comparer et repérer les réutilisations.
- **Signaux d'arnaque** affichés en badge : prix très en dessous du quartier, même photos sur une autre annonce
  à un autre prix, paiement demandé avant visite, contact uniquement par messagerie étrangère, annonce
  différente entre deux sites. Toujours avec les liens pour vérifier soi-même.
- **Dossier de location** : liste des pièces souvent demandées (pièce d'identité, contrat/convention, preuve de
  revenus, garant) reliée à la bibliothèque de documents, prête à envoyer.

### 4.3 Partage famille

Export de la shortlist en **Excel** (format du fichier actuel) et **PDF lisible**, ou lien en lecture seule
(si déployé sur VPS). Case « validé par les parents » par annonce.

### 4.4 Reprise de l'existant

Import de `documents/Logement/Logements-Bruxelles-2027.xlsx` dans un Move « BlackFin Bruxelles » à la mise en
service (statuts, contacts, notes, colonnes « Mon top »).

---

## 5. Budget

- **Entrées** : salaire net (saisi ou depuis l'offre), avantages fléchés (chèques-repas → uniquement nourriture).
  Option « revenu prudent » (ex. 1 500 € au lieu de 1 600 €).
- **Dépenses mensuelles** par catégorie : logement (lié à l'annonce choisie ou comparée), courses, transport
  (calculé : 0 si trajet à pied < seuil, sinon abonnement local), sport, téléphone, loisirs/imprévus, autres.
- **Coûts ponctuels** : garantie, frais de dossier, premier mois, voyage, achats d'installation → « argent à avoir
  avant le départ ».
- **Sorties** : épargne mensuelle, épargne sur la durée, écart à l'objectif, mois de matelas.
- Vue « une ligne par logement » : épargne/mois si je prends celui-là (la colonne de l'Excel, en direct).
- Multi-devises : montants dans la devise du Move, conversion indicative (taux BCE du jour, mis en cache) pour comparer.
- Calculs 100 % déterministes et testés. Aucun calcul fiscal inventé : le net est saisi ou estimé avec la source
  indiquée (« selon BlackFin »).

---

## 6. Démarches

- **Modèles par couple de pays** (`templateKey`, fichiers versionnés dans le repo, sources officielles citées) :
  - FR → BE (stage/emploi) : inscription à la commune, couverture santé (CEAM ou mutuelle), banque, STIB, assurance RC…
  - FR → CA : permis de travail (EIC/PVT ou employeur), NAS, RAMQ (délai de carence), banque, logement temporaire…
  - FR → US : type de visa (J-1, H-1B, O-1…), DS-160, rendez-vous consulaire, SSN, assurance santé…
  - Générique : passeport valide, permis international, résiliations en France, changement d'adresse, impôts.
- Chaque démarche : étapes cochables, documents requis (liés à la bibliothèque existante), échéances (dans Today),
  lien officiel, statut.
- **N'importe quel pays** : dès qu'une opportunité a un pays, Claude (Opus) recherche les exigences sur les sites
  **gouvernementaux** du pays d'accueil et du pays d'origine (visa, titre de séjour, enregistrement, santé, impôts),
  et produit une checklist **avec le lien officiel de chaque étape**. Elle est marquée « à vérifier » tant que
  l'utilisateur ne l'a pas relue, et datée (les règles changent).
- Les modèles versionnés (FR → BE, FR → CA, FR → US…) servent de base rapide et sont mis à jour par ces recherches.

## 6bis. Voyage

- Trajets du Move (aller, retours prévus) : dates, mode (avion, train, bus), coût.
- Pour chaque trajet, Claude (Sonnet) prépare : les sites où réserver (comparateurs et compagnies), les options
  (bagage, tarif flexible), une fourchette de prix observée **avec ses sources**, et les tendances selon
  l'anticipation quand une source fiable les publie. Pas de prix inventés : sans source, on affiche des liens de
  recherche pré-remplis (dates, villes).
- Le billet acheté (PDF) va dans la bibliothèque ; le départ apparaît dans le calendrier.

---

## 7. Matériaux et candidature

- **Profil pré-rempli** : on importe un CV existant (PDF), Claude (Haiku) le découpe en sections et entrées,
  l'utilisateur relit avant enregistrement (provenance, comme pour les offres).
- **CV structuré** : sections (profil, expériences, projets, compétences, formation), entrées réutilisables,
  **variantes** (sélection + ordre + accroche + langue).
- **Gabarits sans IA** : la mise en page est un gabarit HTML/CSS qui reproduit fidèlement les CV actuels
  (police, titres, colonnes de dates). Le PDF est généré par le moteur de rendu, **sans appel à l'IA** : même
  contenu = même PDF. On peut dupliquer et ajuster un gabarit dans l'app.
- **IA en option** : adapter l'accroche et l'ordre à une offre, raccourcir, **traduire FR ↔ EN** (la variante
  traduite est relue avant usage). Chaque export est une `document_version` figée, liée à la candidature.
- **Modèles de messages** : accroche LinkedIn, email spontané, relance, remerciement, lettre ; variables ;
  génération assistée par Claude à partir de l'offre + profil, toujours en brouillon.
- **Kit de candidature** sur l'opportunité : CV choisi, lettre, message, canal (LinkedIn / Indeed / HelloWork /
  site / email direct) et lien. « J'ai postulé » date la candidature et lance les relances (existant).

---

## 8. Navigation et UX

Application PC d'abord. Objectif : moins d'informations par écran, la bonne action au bon endroit.

```
Sidebar
  Today                ← agrège TOUT : relances jobs, messages logement à envoyer, visites, échéances de démarches
  Inbox
  ─ Opportunités
    Recherches          (nouveau : recherches sauvegardées + runs)
    Pipeline            (liste + board actuels)
    Calendrier · Tâches
  ─ Installation        (visible dès qu'un Move existe ; un sélecteur si plusieurs)
    Vue d'ensemble      compte à rebours, budget en 1 chiffre, avancement logement/démarches
    Logement · Budget · Démarches · Voyage
  ─ Réseau             Entreprises · Établissements · Contacts
  ─ Bibliothèque       Profil & CV · Modèles · Documents
  Analytics · Settings
```

Règles UX :
- **Une action principale par vue** (bouton `highlight`), le reste en menu.
- **Résumé avant détail** : chaque page commence par 3 chiffres max (ex. Logement : 4 en shortlist, 2 visites
  samedi, meilleur fit 236 €/mois d'épargne).
- **Critères bloquants en badges** (rouge/ambre), pas en colonnes.
- Panneaux latéraux plutôt que changements de page ; raccourcis clavier (existant) étendus (`H` logement…).
- Mode sombre, design Sparkle existant, aucune nouvelle couleur hors tokens.

---

## 9. International

- Devise, fuseau et jours fériés **par Move** (pas globaux).
- Géocodage : Nominatim/OpenStreetMap (débit limité, cache, attribution) ; saisie manuelle possible.
- Trajet : distance + temps de marche calculés localement ; temps en transport via lien Google Maps / Citymapper
  pré-rempli (pas d'API payante au départ ; OpenRouteService en option).
- Registre `discovery_sources` livré avec des pays de départ : Belgique, France, Canada (Québec), Luxembourg, Suisse,
  Pays-Bas, Allemagne, Royaume-Uni, États-Unis. Ajout d'un pays = des lignes dans le registre + éventuellement
  un modèle de démarches.

---

## 10. API, MCP, skills

- Services nouveaux dans `src/server/services/*` (moves, housing, budgets, procedures, discovery, materials),
  exposés à l'UI (Server Actions), au REST (`/api/v1/moves/...`) et au MCP.
- Outils MCP ajoutés : `create_move`, `housing_add_listing`, `housing_update_listing`, `housing_list`,
  `housing_draft_message`, `plan_visits`, `budget_get`, `budget_update`, `procedures_list`, `procedure_update`,
  `run_research`, `list_sources`. Les contrats des 31 outils existants ne changent pas.
- Skills `.claude/skills/` : `career-housing` (« trouve-moi un logement »), `career-relocate` (« j'ai signé, prépare
  l'installation »), `career-research` (« cherche des offres FDE à Bruxelles »).
- Export : `EXPORT_SCHEMA_VERSION` incrémenté avec migration de l'ancien format.

---

## 11. Sécurité et vie privée

- Aucun envoi de message, aucune candidature, aucun paiement fait par l'app.
- Aucun mot de passe de site tiers stocké ; le niveau C (navigateur) est toujours déclenché par Pierre.
- Pièces sensibles (passeport, RIB) : dans la bibliothèque locale uniquement, jamais envoyées à l'IA sauf action
  explicite ; masquage dans les exports partagés.
- Les données envoyées aux sites et aux API ne contiennent pas d'informations personnelles (requêtes génériques).
- Contenu des pages scrapées = données non fiables : jamais interprété comme instructions par l'agent.

---

## 12. Tests

Comme aujourd'hui : logique pure (budget, fit dates/bail/meublé, trajet, dédup), fixtures d'extraction (pages
d'annonces réelles anonymisées : Immoweb, EU Quarter Homes, Kijiji…), intégration PGlite (migrations), MCP.
Un test par règle de calcul budgétaire et par connecteur.

---

## 13. Découpage en livraisons

Une PR par phase, depuis une branche `feat/...` vers `dev`, puis `dev → main` après validation.

| Phase | Contenu | Pourquoi dans cet ordre | Taille |
|---|---|---|---|
| **P1 — Chat + Move + Logement + Budget** | Chat intégré (Claude, propose puis exécute), indicateur de forfait, tables moves/places/housing_*/budgets, écrans Logement (shortlist, pipeline, carte, fiche, comparer), photos, budget, import de l'Excel, export Excel/PDF, brouillons de messages, visites dans le calendrier | Besoin immédiat (Bruxelles, janvier) | XL |
| **P2 — Offre & contrat → Move** | `details.offer`, checklist de relecture de contrat, bouton « créer le projet d'installation », Today agrégé | Relie le pipeline existant à l'installation | M |
| **P3 — Démarches** | procedures + modèles FR→BE, FR→CA, FR→US, génériques ; échéances dans Today | Utile dès le prochain départ hors UE | M |
| **P4 — Moteur de découverte** | Registre de sources, connecteurs (2–3 logement BE, 2 emploi via API), agent Claude borné, runs + rapport, recherches planifiées | Le plus complexe ; s'appuie sur P1 | L |
| **P5 — Matériaux** | CV structuré + variantes + PDF, modèles de messages, kit de candidature | Remplace les CV faits à la main | L |
| **P6 — Finitions** | Carte, multi-devises, pays supplémentaires, partage en lecture seule | Confort | M |

---

## 14. Décisions

Validées le 22/11 :
- Phase 1 = installation (Move) + logement + budget, avec le chat intégré en socle.
- Modèles choisis automatiquement par tâche, pas de plafond par défaut, indicateur d'usage du forfait.
- Pas de scraping des sites qui l'interdisent : liens pré-remplis, collage d'URL ou d'annonce, import navigateur.
- Claude d'abord, Codex ensuite.
- Design Sparkle conservé.

Encore ouvertes :
1. **APIs d'emploi** gratuites avec clé (Adzuna, France Travail) : c'est toi qui crées les comptes développeur, en P4.
2. **Partage avec tes parents** : export Excel/PDF en P1 ; lien en lecture seule seulement si l'app est déployée.
3. **CV** : je reconstruis les gabarits à partir de tes PDF actuels (pas de source disponible), tu valides le rendu.
4. **Langue de l'UI** : anglais (actuel) ou français ?
5. **Branche et merge** : une PR par phase vers `dev`, puis `dev → main` une fois la PR relue et les tests verts.
