# AGENTS.md

Operational guide for AI coding agents (Claude Code, Codex, Cursor…) and human developers working on this repository. Keep it short and true: update it in the same change as anything it describes.

## Project in brief

Zoomathia is a research project whose mission is to support the study of the cultural transmission of zoological knowledge from Antiquity to the Middle Ages. This repository is the **Zoomathia application**: an open research service (target: `zoomathia.i3s.unice.fr`) to read, search and collaboratively annotate Greek and Latin zoological texts with the TheZoo thesaurus, publishing open RDF data. AI agents and automated annotation pipelines are first-class clients of the API.

Read before any functional change (business documents, in French):

- `docs/vision.md`: mission, audiences, scope and out-of-scope, licences, roadmap.
- `docs/regles-metier.md`: business rules with stable IDs (`RM-XXX-nn`) and a status. **Décidé** = decided, implement. **Proposé** = proposed default, implement only if the task needs it and flag it in the change description. **À trancher** = open, do not implement, ask.
- `docs/glossaire.md`: French domain terms and their English names in code.

Technical documents (English): `docs/architecture.md` (components, sources of truth, data flows, Corese constraints) and `docs/security.md` (requirements and known gaps).

## Repository map

| Path | Content |
|---|---|
| `backend-fastapi/app/routers/` | HTTP endpoints: thin, validation and calls to services only |
| `backend-fastapi/app/services/` | Business logic, SPARQL and OpenTheso clients, SQLite store |
| `backend-fastapi/app/models/` | Pydantic models |
| `backend-fastapi/data/files/` | TEI-XML corpus (do not modify) |
| `backend-fastapi/data/queries/` | Competency question SPARQL files, to be migrated to the database (RM-QC-01) |
| `frontend/src/api/client.ts` | The only module that calls the backend |
| `frontend/src/pages/`, `frontend/src/components/` | React UI |
| `frontend/src/i18n/` | Typed FR/EN translations |
| `frontend/packages/wimmics-venus/` | Vendored VENUS build (do not edit) |

## Commands

Backend, from `backend-fastapi/`:

```bash
uv sync
uv run uvicorn app.main:app --reload --port 3001
STAGING_DB_PATH=/tmp/zoomathia-test.db uv run pytest -q    # always use a temporary database
```

PowerShell equivalent for the tests: `$env:STAGING_DB_PATH = "$env:TEMP\zoomathia-test.db"; uv run pytest -q`

Frontend, from `frontend/`:

```bash
npm ci
npm run dev          # http://localhost:5173, proxies /api to port 3001
npx tsc --noEmit     # type check
npm run build
```

## Non-negotiable rules

1. **No request data is interpolated into SPARQL.** Use the shared escaping helpers for IRIs and literals (to be created in the P0 work), or `VALUES`. Never write `f"... <{uri}> ..."` with external input.
2. **User-supplied SPARQL goes through one validation function**: parsed, `SELECT`/`ASK` only, no `SERVICE`, enforced `LIMIT` and timeout (RM-ACC-02).
3. **The server decides** the author (logged-in account), the initial status and the reviewer of any contribution (RM-CTB-03, RM-CTB-04). Never trust a client-sent `status`, author name, role or ID.
4. **RDF and CSV are produced by serializers** (`rdflib`, the `csv` module), never by string concatenation.
5. **One source of truth per piece of data** (`docs/architecture.md`). Never duplicate a business rule or a dataset. For example, concept categories are computed in the backend only (RM-CON-02).
6. **Business logic lives in backend services**, not in routers or React pages. Frontend data access goes through `src/api/client.ts` and React Query.
7. **Every user-visible string goes through i18n**, in both French and English.
8. **Tests never touch `data/staging.db`** and never send unbounded queries to the production Corese endpoint.
9. **Failures are never masked**: map them to explicit HTTP statuses (400, 403, 404, 502, 504), never to an empty success.

## Conventions

- **Language:** code identifiers, comments, docstrings, technical documents and commit messages in English. Business documents (`docs/vision.md`, `docs/regles-metier.md`, `docs/glossaire.md`) stay in French. The UI is bilingual (FR/EN). Translate existing French comments when you modify the surrounding code, not in bulk.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Comments** explain intent (why: TEI encoding quirks, SPARQL join choices, business rules), not what the code does.
- **Python:** typed functions; Pydantic models for every request and response; `logging`, never `print`; no new `Any` without a comment explaining why.
- **TypeScript:** strict mode; no new `any`; components under ~200 lines (extract hooks and sub-components); explicit loading, error and empty states; colors from design tokens, not new hex literals.
- **API:** the legacy camelCase routes (`/getWorks`, `/getQC`…) are being replaced in one go by a versioned REST API (`/v1/...`). Do not add new legacy-style routes.
- **Traceability:** cite the rule ID (`RM-XXX-nn`) in code comments, tests and change descriptions when implementing a business rule.

## Definition of done

- Backend tests pass with a temporary `STAGING_DB_PATH`; new logic has unit tests that need no network access.
- `npx tsc --noEmit` and `npm run build` pass.
- New i18n keys exist in both `fr.ts` and `en.ts`.
- If a business rule changed, `docs/regles-metier.md` is updated in the same change.
- No secrets, `.env` files, databases or `__pycache__` added to git.

## Agent autonomy

- **Without asking:** read code, edit code, run tests, type checks and builds locally.
- **Only on explicit request:** `git commit`, `git push`, opening pull requests, any action on external services (Corese writes, OpenTheso, deployments), deleting data.
- **Never:** add a licence file or licence headers (the code licence is pending, see `docs/vision.md`); modify the corpus in `data/files/`; edit the vendored VENUS bundle; implement a rule marked **À trancher**; change a **Décidé** rule without the project owner.
- **When a business rule is missing or ambiguous:** stop and ask. Record the agreed default in `docs/regles-metier.md` with the status **Proposé**.

## Known pitfalls

- `uv run pytest` without `STAGING_DB_PATH` writes into `backend-fastapi/data/staging.db`, which is tracked by git. All current tests also hit the live I3S Corese and OpenTheso.
- The default SPARQL endpoint (`http://zoomathia.i3s.unice.fr/sparql`) is the **shared production** Corese. Unbounded queries (`SELECT *` without `LIMIT`, global `DESCRIBE`) can crash it (out of memory).
- Competency questions exist in three copies (`app/core/qcs_data.py`, `data/queries/*.rq`, SQLite) until RM-QC-01 is implemented. Keep them consistent if you must touch them.
- Concept categories are computed twice (backend `classify_concept`, frontend `getConceptCategoryInfo`) with diverging rules, until RM-CON-01 and RM-CON-02 are implemented.
- Statuses are stored as French labels ("En attente de validation", "Validé"…) and compared as strings in the frontend; migration to codes is planned.
- Annotation offsets in the free-text selection handlers are computed with `indexOf` (first occurrence): known bug, see RM-ANN-01.

## Current priorities

1. Framing documents (this file and `docs/`): done on 2026-11-15.
2. P0 security work (`docs/security.md`, "Known gaps"): authentication and roles, server-side status, RDF serialization, unified SPARQL validation and guardrails, escaping helpers.
3. Then: competency questions in the database, publication of validated annotations to Corese, categories from TheZoo collections, versioned REST API, TEI ingestion and pre-annotation.
