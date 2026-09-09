# Zoomathia

Zoomathia est une plateforme web d'exploration de corpus zoologiques et de connaissances sémantiques. La version actuelle repose sur un frontend React/TypeScript et une API FastAPI. L'API consomme un endpoint SPARQL/Corese configurable, qui n'est pas déployé par le Compose de ce dépôt.

L'ancienne application ExpressJS et l'ancien frontend `web-zoomathia` ont été retirés du dépôt.

## Architecture

```text
frontend/                  React + TypeScript + Vite
    │ /api
    ▼
backend-fastapi/           API FastAPI
    │ SPARQL_ENDPOINT configurable
    ▼
Corese ou endpoint SPARQL  Service externe au Compose
```

| Composant | Rôle | Port |
| --- | --- | ---: |
| `frontend/` | Interface web et visualisations | `8080` en production, `5173` en développement |
| `backend-fastapi/` | API HTTP, annotations, thésaurus et requêtes | `3001` |
| Corese / SPARQL | Source des données interrogée par l'API | configurable |

Le backend est publié sur `3001` et le frontend sur `8080` par défaut, les deux ports déjà ouverts sur la machine d'hébergement. Le port du frontend peut être changé avec `FRONTEND_PORT` si un service externe utilise déjà `8080`.

## Démarrage recommandé avec Docker

Prérequis : Docker Engine et le plugin Docker Compose.

Le Compose racine démarre uniquement le frontend et le backend. Un endpoint SPARQL/Corese doit être déjà accessible depuis le conteneur backend ; le dépôt ne contacte plus l'I3S par défaut et ne lance pas de conteneur Corese.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend frontend
```

Services disponibles :

- Frontend : <http://localhost:8080>
- API FastAPI : <http://localhost:3001>
- Swagger UI : <http://localhost:3001/docs>
- ReDoc : <http://localhost:3001/redoc>
- Schéma OpenAPI : <http://localhost:3001/openapi.json>

Pour arrêter les conteneurs sans supprimer les données persistantes :

```bash
docker compose down
```

Le volume `backend-storage` conserve la base SQLite de staging.

## Endpoint SPARQL externe

Le backend ne peut pas récupérer les données sans endpoint SPARQL accessible. Renseigner `SPARQL_ENDPOINT` dans le fichier `.env` à la racine avant le déploiement.

Si Corese tourne directement sur le même serveur Ubuntu, le Compose utilise l'adresse spéciale Docker suivante :

```dotenv
SPARQL_ENDPOINT=http://host.docker.internal:8080/sparql
# Le port 8080 étant utilisé par le frontend par défaut, choisir un autre port pour lui.
FRONTEND_PORT=80
SPARQL_TIMEOUT=30
```

Si Corese est installé sur une autre machine, remplacer cette valeur par son adresse IP ou DNS, par exemple `http://192.168.1.20:8080/sparql`. Si aucun Corese n'est disponible, l'API et Swagger démarreront, mais les endpoints qui interrogent les données échoueront.

Un modèle est fourni dans [.env.example](C:/Users/Mazuki/Desktop/zoomathia/web-app/.env.example).

### Fichiers d'environnement

Les fichiers `.env` réels sont locaux à chaque contexte et ne doivent pas être commités :

| Fichier | Utilisé par | Rôle |
| --- | --- | --- |
| `.env` à la racine | Docker Compose | endpoint SPARQL, timeout, CORS et ports de publication |
| `backend-fastapi/.env` | FastAPI lancé localement | endpoint SPARQL, port, chemins de données et CORS |
| `frontend/.env.local` | Vite lancé localement | URL publique ou locale de l'API |

Créer les fichiers à partir des modèles correspondants :

```bash
cp .env.example .env
cp backend-fastapi/.env.example backend-fastapi/.env
cp frontend/.env.example frontend/.env.local
```

Sous PowerShell, utiliser `Copy-Item` à la place de `cp`. Le fichier frontend peut rester vide (`VITE_API_URL=`) pour conserver le proxy Vite `/api`.

## Développement local

### Backend

Depuis `backend-fastapi/` :

```bash
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

Pour utiliser un Corese accessible sur le même hôte depuis un backend lancé localement :

```dotenv
SPARQL_ENDPOINT=http://127.0.0.1:8080/sparql
```

La documentation détaillée du backend se trouve dans [backend-fastapi/README.md](C:/Users/Mazuki/Desktop/zoomathia/web-app/backend-fastapi/README.md).

### Frontend

Depuis `frontend/` :

```bash
npm ci
npm run dev
```

L'interface est disponible sur <http://localhost:5173>. Vite transmet les appels `/api` au backend sur `http://127.0.0.1:3001`.

La documentation détaillée du frontend se trouve dans [frontend/README.md](C:/Users/Mazuki/Desktop/zoomathia/web-app/frontend/README.md).

## Vérifications et tests

Build frontend :

```bash
cd frontend
npm run build
```

Tests backend hors benchmark :

```bash
cd backend-fastapi
uv run pytest tests --ignore=tests/test_perf.py
```

Le fichier `test_perf.py` est un benchmark qui contacte directement Corese et doit être lancé séparément lorsque le service est disponible.

## Organisation du dépôt

```text
backend-fastapi/
  app/                    code FastAPI
  data/files/             corpus XML utilisé par l'API
  data/queries/           requêtes SPARQL des questions de compétence
frontend/                 application React/TypeScript
  Dockerfile              build et serveur Nginx de production
  nginx.conf              proxy frontend `/api` vers FastAPI
docker-compose.yml        orchestration frontend + FastAPI
```
