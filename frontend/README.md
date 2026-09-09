# Frontend Zoomathia

Interface web de Zoomathia, développée avec React, TypeScript, Vite et Tailwind CSS.

## Prérequis

- Node.js `20.19+` ou `22.12+`
- npm
- Backend Zoomathia disponible sur le port `3001`

## Développement local

Depuis `frontend/` :

```bash
npm ci
npm run dev
```

L'application est disponible sur <http://localhost:5173>. Le serveur Vite transmet les appels `/api` au backend `http://127.0.0.1:3001`.

Pour cibler un autre backend, créer `frontend/.env.local` :

```dotenv
VITE_API_URL=https://example.org/api
```

Le modèle [`.env.example`](C:/Users/Mazuki/Desktop/zoomathia/web-app/frontend/.env.example) contient la configuration minimale. Copier ce fichier vers `frontend/.env.local` ; ce dernier reste local et n'est pas versionné.

`VITE_API_URL` est injectée au moment du build. En son absence, le frontend utilise `/api`, qui doit être routé vers FastAPI par Vite en développement ou par le reverse proxy en production.

## Build de production

```bash
npm ci
npm run build
npm run preview
```

Les fichiers statiques sont générés dans `dist/`. Le serveur de production doit :

- servir `index.html` pour les routes React qui n'existent pas comme fichiers ;
- transmettre `/api/*` au backend FastAPI sur le port `3001` ;
- conserver le préfixe attendu par le frontend ou le retirer avant transmission, selon la configuration du reverse proxy.

## Déploiement Docker

Le Compose à la racine construit le frontend puis le sert avec Nginx. Nginx transmet automatiquement `/api/*` au service backend `backend:3001` ; aucune URL publique du backend n'est nécessaire dans le navigateur.

```bash
docker compose up -d --build frontend backend
```

Le frontend est disponible sur <http://localhost:8080> lorsque `FRONTEND_PORT=8080` (valeur par défaut). Le port peut être changé dans le `.env` racine, par exemple `FRONTEND_PORT=80`.

Le build utilise `VITE_API_URL=/api` par défaut. Pour une API hébergée à une autre adresse, définir `VITE_API_URL` dans le `.env` racine avant de reconstruire l'image :

```dotenv
VITE_API_URL=https://example.org/api
```

## Commandes

| Commande | Usage |
| --- | --- |
| `npm run dev` | serveur Vite avec rechargement automatique |
| `npm run build` | contrôle TypeScript et build optimisé |
| `npm run preview` | prévisualisation locale du build |

## Organisation

```text
src/
  api/          client HTTP du backend
  components/   composants réutilisables
  i18n/         traductions françaises et anglaises
  pages/        écrans de l'application
  types/        types TypeScript
packages/
  wimmics-venus/ bibliothèque de visualisation embarquée
public/         images, icônes, polices et logos
```
