# Publier Career OS sur le Microsoft Store

Tout ce qui se prépare dans le dépôt est prêt : le paquet du Store (`.msix`) est fabriqué par GitHub à chaque mise à
jour de `main`, avec un lanceur sans fenêtre noire. La fiche, les images et les réponses aux questions de Microsoft
sont dans ce dossier. Il reste les étapes que seul le titulaire du compte peut faire.

| Fichier | Contenu |
|---|---|
| [`fiche.md`](fiche.md) | Textes de la fiche du Store, à copier-coller |
| [`certification.md`](certification.md) | Notes pour les testeurs de Microsoft, justification `runFullTrust`, questionnaire d'âge, déclaration IA |
| [`images/`](images) | 10 captures (1920 × 1200, données d'exemple) et le logo 300 × 300 |
| Page de confidentialité | https://get-career-os.vercel.app/confidentialite |

## 1. Ouvrir le compte développeur (gratuit pour un particulier)

1. Va sur **https://storedeveloper.microsoft.com** (c'est cette adresse qui donne l'inscription gratuite).
2. Choisis **Individual** (particulier), connecte-toi avec ton compte Microsoft personnel.
3. Vérification d'identité : pièce d'identité + selfie depuis ton téléphone. Accepte le contrat développeur.

Le nom d'éditeur affiché sera ton nom (compte particulier). Microsoft exige un compte entreprise si le nom d'éditeur
ressemble à une société : garde ton nom.

## 2. Réserver le nom

Partner Center → **Apps et jeux** → **Nouveau produit** → **Application MSIX ou PWA** → nom : **Career OS**.
La réservation tient 3 mois.

## 3. Me donner l'identité du produit

Partner Center → ton produit → **Gestion du produit** → **Identité du produit**. Copie-moi ces trois valeurs :

- `Package/Identity/Name` (ressemble à `12345TonNom.CareerOS`)
- `Package/Identity/Publisher` (commence par `CN=`)
- `Package/Properties/PublisherDisplayName`

Je les enregistre dans GitHub (variables du dépôt `MSIX_IDENTITY_NAME`, `MSIX_PUBLISHER`,
`MSIX_PUBLISHER_DISPLAY_NAME`) et je relance la fabrication. Le paquet `career-os-store-x64.msix` apparaît alors dans la
[dernière version](https://github.com/Miche1-Pierre/career-os/releases/latest). Sans ces valeurs, GitHub fabrique un
paquet de test que le Store refuse.

## 4. Remplir la soumission

Partner Center → ton produit → **Démarrer la soumission** :

| Section | Quoi mettre |
|---|---|
| Tarification et disponibilité | Gratuit. Marchés : tous, ou les pays francophones (la fiche est en français). |
| Propriétés | Catégorie **Productivité**. Politique de confidentialité : `https://get-career-os.vercel.app/confidentialite`. Site web : `https://get-career-os.vercel.app`. Contact support : `https://github.com/Miche1-Pierre/career-os/issues`. Déclarations : voir `certification.md`. |
| Classifications par âge | Questionnaire IARC : réponses dans `certification.md`. |
| Paquets | Glisse `career-os-store-x64.msix` (téléchargé depuis la dernière version GitHub). |
| Fiche du Store (Français) | Textes de `fiche.md`, captures et logo de `images/`. |
| Options de soumission → Notes pour la certification | Texte de `certification.md`. |
| Fonctionnalités restreintes (`runFullTrust`) | Justification dans `certification.md`. |

Puis **Soumettre à la certification**. Microsoft répond en 3 jours ouvrés au plus. S'il refuse, envoie-moi le
rapport : je corrige et GitHub refait le paquet.

## 5. Les versions suivantes

Chaque fusion dans `main` refabrique le paquet avec un numéro plus élevé (`0.1.<n° de fabrication>.0`, comme le Store
l'exige). Pour publier une mise à jour : nouvelle soumission, remplace le paquet, soumets. Le Store met ensuite
Career OS à jour tout seul chez les utilisateurs.

## Comment marche la version Store

- **Lanceur** `CareerOS.exe` (`packaging/windows/CareerOS.cs`) : démarre l'app sans fenêtre noire, ouvre le navigateur,
  affiche un message clair si le démarrage échoue (journal : `Documents\CareerOS\data\app\career-os.log`).
- **L'app voyage en archive** (`app.zip` dans le paquet) : le Store refuse les noms de fichiers avec crochets, que les
  pages de l'app utilisent (`[id]`). Au premier lancement de chaque version, une petite fenêtre « Préparation de
  Career OS… » s'affiche quelques secondes pendant que `unpack.mjs` (Node.js, chemins longs gérés) la décompresse dans
  l'espace privé de l'app (`%LOCALAPPDATA%\CareerOS-Store`, supprimé par Windows avec l'app) ; les anciennes versions
  sont effacées.
- **Données hors du dossier de l'app** : réglages, base, documents et sauvegardes dans `Documents\CareerOS`
  (`scripts/app-home.mjs`), conservés à la désinstallation.
- **Arrêt automatique** : sans fenêtre propre, l'app s'arrête 10 minutes après la fermeture du dernier onglet Career OS
  (chaque page se signale toutes les minutes ; base fermée proprement).
- **Double-clic pendant le démarrage** : un verrou empêche d'ouvrir la base deux fois ; le second lancement attend et
  affiche l'app.
- **Claude Code n'est pas inclus** (logiciel d'Anthropic, non redistribuable). Si l'assistant est voulu, un bouton
  « Installer Claude Code » ouvre l'installateur de Windows (`winget`), qui affiche les conditions d'Anthropic et demande
  l'accord. Tout le reste de l'app marche sans (règle 10.8.3 : un compte particulier ne peut pas exiger de clé
  pour les fonctions principales).
- **Signaler** sous chaque réponse de l'assistant (règle 11.16 sur l'IA générative).

### Tester sur ton PC avant de soumettre (facultatif)

Le paquet n'est pas signé (le Store le signe), donc il ne s'installe pas d'un double-clic. Pour essayer la même
disposition : active le **mode développeur** de Windows (Paramètres → Système → Espace développeurs), puis dans
`C:\Candidature` :

```powershell
$env:NEXT_OUTPUT='standalone'; npm run build; node scripts/build-scripts.mjs; node scripts/package-windows.mjs; node scripts/package-msix.mjs
```

```powershell
Add-AppxPackage -Register release\msix\layout\AppxManifest.xml
```

Career OS apparaît dans le menu Démarrer. Pour l'enlever : clic droit → Désinstaller.
