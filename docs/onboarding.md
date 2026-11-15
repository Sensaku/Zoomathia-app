# Onboarding

Welcome! This guide takes a new developer, junior or not, from zero to a first contribution. Read it in order: each step points to the detailed document.

## 1. Understand the project (30 minutes)

- What Zoomathia is and who uses it: [vision.md](vision.md) (French).
- The words you will meet everywhere (œuvre, témoin, annotation, concept…) and their English names in the code: [glossaire.md](glossaire.md) (French).
- How the pieces fit together: [architecture.md](architecture.md).

## 2. Learn the semantic web basics

Zoomathia stores its data as RDF and queries it with SPARQL. You do not need to master them on day one, but you will need the basics. We link to existing courses rather than rewrite tutorials.

| Topic | Resource |
|---|---|
| Linked data, RDF, SPARQL, RDFS, OWL | MOOC [Introduction to a Web of Linked Data](https://www.fun-mooc.fr/en/courses/introduction-web-linked-data/) (FUN MOOC, English, self-paced), created by the Wimmics team, which also develops Corese. French version: "Web sémantique et Web de données", check the FUN MOOC catalogue for an open session. |
| RDF | [RDF 1.1 Primer](https://www.w3.org/TR/rdf11-primer/) (W3C) |
| SPARQL | [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/) (W3C) |
| SKOS, the thesaurus model | [SKOS Primer](https://www.w3.org/TR/skos-primer/) (W3C) |
| Annotations | [Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) (W3C) |
| TEI, the text encoding | [TEI Guidelines](https://tei-c.org/guidelines/) |
| Corese, our triplestore | [corese-core documentation](https://corese-stack.github.io/corese-core/), sources in the [corese-stack](https://github.com/corese-stack) organization |

Tip: try a query in the application's SPARQL playground before writing code that builds it, and always add a `LIMIT`: the endpoint is shared with other projects.

## 3. Set up your machine (1 hour)

Prerequisites: Git, Python 3.12 and [uv](https://docs.astral.sh/uv/), Node.js 22 and npm. Docker is optional.

Backend, from `backend-fastapi/`:

```bash
uv sync
uv run uvicorn app.main:app --reload --port 3001
```

Frontend, from `frontend/`:

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>; the API documentation is at <http://localhost:3001/docs>.

Before running the backend tests, read the warning in [AGENTS.md](https://github.com/Sensaku/Zoomathia-app/blob/main/AGENTS.md) ("Known pitfalls"): they must use a temporary database.

Recommended: install code-review-graph (`pip install code-review-graph`, then `code-review-graph build` at the repository root). It lets you explore who calls what before you change anything.

## 4. Find your way in the code

The current layout is described in [AGENTS.md](https://github.com/Sensaku/Zoomathia-app/blob/main/AGENTS.md) ("Repository map"); the target layout is in [development-guidelines.md](development-guidelines.md). Good files to read first:

| File | Why |
|---|---|
| `backend-fastapi/app/main.py` | How the API is assembled |
| `backend-fastapi/app/services/sparql_client.py` | How the backend talks to Corese |
| `frontend/src/api/client.ts` | Every call from the frontend to the backend |
| `frontend/src/components/reading/` | The reading view, recently cleaned up |

With code-review-graph, `get_architecture_overview_tool` gives a map of the code, and `generate_wiki_tool` writes a local wiki in `.code-review-graph/wiki/`.

## 5. How we work

Humans and AI agents follow the same rules: [AGENTS.md](https://github.com/Sensaku/Zoomathia-app/blob/main/AGENTS.md) for the essentials, [development-guidelines.md](development-guidelines.md) for the details. The three that matter most on day one:

1. **Stay in the scope of your task:** no renaming or refactoring along the way.
2. **Every business rule comes from [regles-metier.md](regles-metier.md)**, and its ID appears in your test names.
3. **Ask when a rule is unclear:** never guess.

## 6. Your first contribution

1. Ask the project owner for a small, well-scoped task.
2. Read the business rules it involves.
3. Write the test first when you can.
4. Run the checks of the "Definition of done" in [AGENTS.md](https://github.com/Sensaku/Zoomathia-app/blob/main/AGENTS.md).
5. Get a review: the project owner for humans, a cross-model review for AI agents.
6. Commit with a [Conventional Commits](https://www.conventionalcommits.org/) message, in English.

## 7. Recipes

Step-by-step recipes for recurring tasks will live in `docs/recipes/`. Each one is written together with the first implementation of its pattern in the target structure.

| Recipe | Written with |
|---|---|
| Add an API endpoint | The first domain module |
| Add a frontend feature or page | The first feature folder |
| Implement a business rule | The P0 security work |
| Write unit and integration tests | The test foundation |
| Add a SPARQL query | The `.rq` loader |

## 8. Who to ask

The project owner, who maintains the GitHub repository, decides on business rules and priorities.
