# Réponses pour la certification Microsoft

Les testeurs de Microsoft lisent l'anglais : les textes à coller sont en anglais.

## Notes pour la certification

Partner Center → Soumission → Options de soumission → **Notes pour la certification** :

```text
No account or sign-in is needed. Career OS runs entirely on the user's PC.

How it works: CareerOS.exe (no window) starts a bundled Node.js server and a local database bound to 127.0.0.1 only (port 3300 by default), then opens the app in the default web browser. On the first launch of each version, a small "Préparation de Career OS…" window shows for a few seconds: the app's files ship inside the package as app.zip (MSIX does not accept the bracketed folder names, like [id], that the app's web pages use) and are unpacked once into the package's own local storage. Nothing is downloaded. User data, settings and daily backups are stored in Documents\CareerOS (kept on uninstall). The app stops by itself about 10 minutes after its last browser tab is closed; launching it again while it runs just reopens the browser tab.

Suggested test path:
1. Launch Career OS from the Start menu. The welcome wizard opens in the browser.
2. Enter a first name, click "Continuer" three times, then choose "Découvrir avec des exemples" to load sample data (applications, interviews, documents, housing comparison). These can be deleted later in Settings.
3. Browse "Aujourd'hui", "Candidatures", "Installation", "Documents", "CV".

Optional AI assistant (disclosed in the description): it uses Anthropic's Claude Code, which is NOT bundled. If missing, the app shows an "Installer Claude Code" button that opens Windows Package Manager (winget install Anthropic.ClaudeCode) in a visible console, where the user accepts Anthropic's terms. The assistant also needs the user's own Claude API key or Claude subscription. Every other feature works without it; testing the assistant is not required. Each assistant answer has a "Signaler" (report) link.

The UI is in French.
```

## Justification de `runFullTrust`

Partner Center → **Fonctionnalités restreintes** (demandé à la soumission) :

```text
Career OS is a desktop application packaged with its own Node.js runtime. At launch, CareerOS.exe starts Node.js child processes: a local web server and a local database listening on 127.0.0.1 only, which serve the app's interface in the user's browser. It reads and writes the user's documents, database and backups in Documents\CareerOS, and can start the optional Claude Code command-line program installed separately by the user. When the user clicks "Installer Claude Code", it opens Windows Package Manager (winget install Anthropic.ClaudeCode) in a visible console. It needs no administrator rights, installs no service or driver, and sends no data to the developer. These are standard Win32 desktop behaviors that require running as a full-trust desktop application.
```

## Questionnaire d'âge (IARC)

Catégorie : **Application (pas un jeu)**, puis :

| Question (en substance) | Réponse |
|---|---|
| Violence, sexe, nudité, langage grossier, drogues, alcool, tabac, discriminations | Non |
| Jeux d'argent ou simulation de jeux d'argent | Non |
| Les utilisateurs peuvent-ils communiquer ou échanger du contenu entre eux ? | Non |
| L'app partage-t-elle la position de l'utilisateur avec d'autres ? | Non |
| Achats numériques dans l'app | Non |
| Accès non restreint à Internet (navigateur, moteur de recherche) | Non : l'app ouvre des liens et consulte des sites de recherche d'emploi et de logement, mais n'est pas un navigateur |
| Contenu généré par une IA | Oui : assistant facultatif (Claude d'Anthropic), avec lien de signalement |

Si une question ne correspond pas exactement, réponds selon ce tableau ; la classification attendue est « 3+ / Tout public » ou proche.

## Déclarations du produit

Partner Center → Propriétés → **Déclarations du produit** :

- Utilise l'IA générative : **oui** (assistant facultatif, voir description).
- Peut être installé sur un autre lecteur : **oui**.
- Dépend de pilotes ou services Windows non Microsoft : **non**.
- Accessibilité testée : à ne cocher que si tu l'as vérifiée.

## Si Microsoft refuse

Copie-moi le rapport de certification. Points déjà traités, en cas de question des testeurs :

- **10.2.2 / 10.2.3** (code téléchargé, logiciel tiers) : l'app ne télécharge pas de code. Claude Code n'est installé
  que sur clic de l'utilisateur, par winget, depuis le dépôt officiel, avec accord explicite aux conditions d'Anthropic.
- **10.2.4** (dépendance) : indiquée en tête de description.
- **10.5.1** (confidentialité) : https://get-career-os.vercel.app/confidentialite
- **10.8.3** (clé API, compte particulier) : l'assistant est facultatif, toutes les fonctions principales marchent sans.
- **11.16** (IA générative) : déclarée, signalée en description, lien « Signaler » sous chaque réponse.
