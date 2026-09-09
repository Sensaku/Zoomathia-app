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

Le fichier `docker-compose.yml` situé à la racine démarre FastAPI et Corese ensemble :

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend corese
```

Ports publiés sur la machine hôte :

| Service | Port | URL |
| --- | ---: | --- |
| FastAPI | `3001` | <http://localhost:3001> |
| Corese | `8080` | <http://localhost:8080/sparql> |

Dans le réseau Docker, FastAPI contacte Corese via `http://corese:8080/sparql`.

Par défaut, Corese charge les fichiers RDF du dossier racine `dumps/`. Pour utiliser le répertoire historique du serveur, créer un fichier `.env` à la racine :

```dotenv
CORESE_DATA_DIR=/home/abarbe/Corese/Zoomathia
CORESE_JVM_XMX=16G
SPARQL_TIMEOUT=30
```

Corese génère sa configuration au premier démarrage. Après une modification de la liste des fichiers RDF, supprimer `corese-profile.ttl` dans le volume de configuration ou recréer uniquement ce volume pour forcer sa régénération.

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

Variables principales :

| Variable | Valeur locale par défaut | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Adresse d'écoute de l'application |
| `PORT` | `3001` | Port du backend |
| `SPARQL_ENDPOINT` | endpoint Zoomathia distant | Endpoint Corese utilisé par l'API |
| `SPARQL_TIMEOUT` | `30` | Timeout SPARQL en secondes |
| `STAGING_DB_PATH` | `data/staging.db` | Base SQLite des annotations et propositions |
| `XML_DATA_DIR` | `data/files` | Corpus XML téléchargeable |
| `QUERIES_DIR` | `data/queries` | Questions de compétence SPARQL |

Pour travailler avec Corese lancé par Compose tout en exécutant FastAPI hors Docker :

```dotenv
SPARQL_ENDPOINT=http://127.0.0.1:8080/sparql
```

## Tests

```bash
uv run pytest tests --ignore=tests/test_perf.py
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
