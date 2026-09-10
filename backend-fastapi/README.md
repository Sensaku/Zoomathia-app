# Backend Zoomathia

API HTTP de Zoomathia, développée avec FastAPI. Elle expose les œuvres et textes du corpus, les concepts du thésaurus, les questions de compétence, les annotations et les requêtes SPARQL. Les requêtes sont exécutées par un serveur Corese.

## Documentation OpenAPI

Une fois le backend démarré sur le port `3001` :

- Swagger UI : <http://localhost:3001/docs>
- ReDoc : <http://localhost:3001/redoc>
- Schéma OpenAPI JSON : <http://localhost:3001/openapi.json>
- État du service : <http://localhost:3001/>

Swagger permet de consulter les modèles, les paramètres et d'exécuter directement les endpoints.

## Lancement avec Docker Compose

Le fichier `docker-compose.yml` situé à la racine démarre uniquement le frontend et FastAPI. Par défaut, l'application interroge l'endpoint SPARQL distant `http://zoomathia.i3s.unice.fr/sparql`.

Pour utiliser une instance locale de Corese, créer le fichier de configuration racine :

```bash
cp .env.example .env
```

Si Corese tourne directement sur le même serveur en local :

```dotenv
SPARQL_ENDPOINT=http://host.docker.internal:8080/sparql
FRONTEND_PORT=80
```

Le changement de `FRONTEND_PORT` est nécessaire si Corese écoute lui aussi sur `8080` sur le même hôte.

Démarrer les services :

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend frontend
```

Ports publiés sur la machine hôte :

| Service | Port | URL |
| --- | ---: | --- |
| Frontend | `8080` par défaut | <http://localhost:8080> |
| FastAPI | `3001` | <http://localhost:3001> |

Le frontend est publié sur le port `8080` par défaut afin de réutiliser le port ouvert de l'ancien service Corese. Il peut être changé avec `FRONTEND_PORT`. Nginx sert l'application React et transmet `/api/*` au backend en retirant le préfixe `/api` attendu uniquement par le frontend.

Si aucun endpoint SPARQL/Corese n'est accessible, l'API et Swagger démarreront, mais les endpoints dépendant des données échoueront.

Arrêt des services :

```bash
docker compose down
```

La commande suivante supprime aussi les volumes persistants, notamment la base SQLite de staging ; elle ne doit être utilisée que si ces données peuvent être perdues :

```bash
docker compose down --volumes
```

## Développement local

Prérequis : Python 3.10 ou supérieur et [uv](https://docs.astral.sh/uv/).

Depuis `backend-fastapi/` :

```bash
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 3001
```

Pour personnaliser le lancement local, copier [`.env.example`](C:/Users/Mazuki/Desktop/zoomathia/web-app/backend-fastapi/.env.example) vers `backend-fastapi/.env`. FastAPI charge ce fichier via `pydantic-settings` lorsque la commande est exécutée depuis ce dossier.

Variables principales :

| Variable | Valeur locale par défaut | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Adresse d'écoute de l'application |
| `PORT` | `3001` | Port du backend |
| `SPARQL_ENDPOINT` | `http://zoomathia.i3s.unice.fr/sparql` | Endpoint SPARQL utilisé par l'API |
| `SPARQL_TIMEOUT` | `30` | Timeout SPARQL en secondes |
| `STAGING_DB_PATH` | `data/staging.db` | Base SQLite des annotations et propositions |
| `XML_DATA_DIR` | `data/files` | Corpus XML téléchargeable |
| `QUERIES_DIR` | `data/queries` | Questions de compétence SPARQL |

`CORS_ORIGINS` doit être écrit comme une liste JSON, par exemple `["http://localhost:5173","http://127.0.0.1:5173"]`.

Pour travailler avec un Corese installé sur le même hôte que FastAPI lancé localement :

```dotenv
SPARQL_ENDPOINT=http://127.0.0.1:8080/sparql
```

## Tests

```bash
uv run pytest
```

`test_perf.py` est un benchmark qui contacte directement un endpoint Corese ; il doit être lancé séparément lorsque Corese est disponible.

## Organisation

```text
app/
  core/       configuration et métadonnées
  models/     modèles Pydantic
  routers/    endpoints FastAPI
  services/   accès Corese, OpenTheso et SQLite
data/
  files/      corpus XML
  queries/    requêtes SPARQL
  staging.db  stockage local de développement
```
