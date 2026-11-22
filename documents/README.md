# Bibliothèque de documents

Ce dossier est monté dans le conteneur Career OS (`/data/documents`). Rangez-y vos CV, lettres,
relevés de notes, lettres de recommandation… (sous-dossiers libres, par ex. `CV/`, `Cover Letters/`, `Academic/`).

- **Documents → Scan folder** dans l'app détecte les nouveaux fichiers et ceux que vous avez modifiés.
- Chaque version enregistrée est **copiée** (snapshot immuable dans `data/snapshots`) : si vous modifiez ou
  supprimez le fichier ici, la version exacte envoyée à chaque candidature reste consultable.
- Pour utiliser un autre dossier (ex. `D:/Mes documents/Candidatures`), changez `DOCUMENTS_DIR` dans `.env`
  puis `docker compose up -d`.
