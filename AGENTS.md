# AGENTS.md

Operational guide for AI coding agents (Claude Code, Codex, Cursor…) and human developers working on this repository. Keep it short and true: update it in the same change as anything it describes.

## Project in brief

Zoomathia is a research project whose mission is to support the study of the cultural transmission of zoological knowledge from Antiquity to the Middle Ages. This repository is the **Zoomathia application**: an open research service (production host to be decided; `zoomathia.i3s.unice.fr` still serves the previous version of the application) to read, search and collaboratively annotate Greek and Latin zoological texts with the TheZoo thesaurus, publishing open RDF data. AI agents and automated annotation pipelines are first-class clients of the API.

New to the project? Start with `docs/onboarding.md`.

Read before any functional change (business documents, in French):

- `docs/vision.md`: mission, audiences, scope and out-of-scope, licences, roadmap.
- `docs/regles-metier.md`: business rules with stable IDs (`RM-XXX-nn`) and a status. **Décidé** = decided, implement. **Proposé** = proposed default, implement only if the task needs it and flag it in the change description. **À trancher** = open, do not implement, ask.
- `docs/glossaire.md`: French domain terms and their English names in code.

Technical documents (English): `docs/architecture.md` (components, sources of truth, data flows, Corese constraints), `docs/security.md` (requirements and known gaps), `docs/development-guidelines.md` (code organization, tooling, tests, CI, documentation, performance) and `docs/design-system.md` (visual identity, tokens, reading experience, accessibility, component catalogue).

## Repository map

| Path | Content |
|---|---|
| `backend-fastapi/app/routers/` | HTTP endpoints: thin, validation and calls to services only |
| `backend-fastapi/app/services/` | Business logic, SPARQL and OpenTheso clients, SQLite store |
| `backend-fastapi/app/models/` | Pydantic models |
| `backend-fastapi/app/accounts/` | Accounts domain (target layout): users, roles, sessions, CSRF, administration, `cli.py` for the first admin |
| `backend-fastapi/app/core/database.py` | Async SQLAlchemy engine, `Base`, `get_db`; `clock.py` and `migrations.py` beside it |
| `backend-fastapi/migrations/` | Alembic revisions: the only owner of the database schema |
| `backend-fastapi/data/files/` | TEI-XML corpus (do not modify) |
| `backend-fastapi/data/queries/` | Competency question SPARQL files, to be migrated to the database (RM-QC-01) |
| `frontend/src/api/client.ts` | The only module that calls the backend |
| `frontend/src/pages/`, `frontend/src/components/` | React UI |
| `frontend/src/i18n/` | Typed FR/EN translations |
| `frontend/packages/wimmics-venus/` | Vendored VENUS build (do not edit) |

This map describes the current layout. The target layout (domain modules in the backend, features in the frontend) is defined in `docs/development-guidelines.md`; code moves there progressively, when it is modified.

## Commands

Backend, from `backend-fastapi/`:

```bash
uv sync
uv run alembic upgrade head      # apply the migrations: once, then after each pull that brings one
uv run python -m app.accounts.cli create-admin --email E --name N --affiliation A   # first admin, password typed at the prompt
uv run uvicorn app.main:app --reload --port 3001
uv run ruff check .        # lint (add --fix for safe fixes)
uv run ruff format .       # format
uv run mypy                # type check, strict on new modules
uv run pytest              # temporary database, simulated Corese, no network
uv run pytest --live -m live   # on demand only: bounded read-only queries to the production Corese
uv run --group docs mkdocs serve --config-file ../mkdocs.yml   # documentation site, http://127.0.0.1:8000
```

Frontend, from `frontend/`:

```bash
npm ci                       # Node 24 (frontend/.nvmrc)
npm run dev                  # http://localhost:5173, proxies /api to port 3001
npm run typecheck            # tsc on src and on e2e + config files (two TS projects); tsc stays the only type checker
npm run lint                 # Oxlint (react, jsx-a11y, type-aware); legacy findings are warnings
npm run format               # Oxfmt (format:check in CI)
npm run test                 # Vitest + Testing Library + MSW, no network
npm run build
npx playwright install chromium   # once
npm run test:e2e             # Playwright with axe, against the build: run npm run build first
npm run docs                 # TypeDoc reference into docs/reference/frontend (not committed)
```

The frontend tooling (Vite+ with Oxlint, Oxfmt and Vitest, Playwright with axe, TypeDoc) is installed (decision record: `docs/decisions/0001-frontend-tooling.md`). Run `npm run docs` in `frontend/` before the MkDocs command: the site includes the generated TypeScript reference.

## Non-negotiable rules

1. **No request data is interpolated into SPARQL.** Use the shared escaping helpers for IRIs, literals and language tags (`app/shared/sparql.py`), or `VALUES`. Never write `f"... <{uri}> ..."` with external input.
2. **User-supplied SPARQL goes through one validation function**: parsed, `SELECT`/`ASK` only, no `SERVICE`, enforced `LIMIT` and timeout (RM-ACC-02).
3. **The server decides** the author (logged-in account), the initial status and the reviewer of any contribution (RM-CTB-03, RM-CTB-04). Never trust a client-sent `status`, author name, role or ID.
4. **RDF and CSV are produced by serializers** (`rdflib`, the `csv` module), never by string concatenation.
5. **One source of truth per piece of data** (`docs/architecture.md`). Never duplicate a business rule or a dataset. For example, concept categories are computed in the backend only (RM-CON-02).
6. **Business logic lives in backend services**, not in routers or React pages. Frontend data access goes through `src/api/client.ts` and React Query.
7. **Every user-visible string goes through i18n**, in both French and English.
8. **Tests never touch `data/staging.db`** and never send unbounded queries to the production Corese endpoint.
9. **Failures are never masked**: map them to explicit HTTP statuses (400, 403, 404, 502, 504), never to an empty success.
10. **No request blocks the others**: no blocking I/O in async code, short database transactions, long tasks in background jobs, a timeout on every external call, every list bounded.

## Working method

1. **Frame the task before coding** (analysis and architecture phase): business rules involved, approach, tests, risks and criticality, in a short implementation brief. Start with code-review-graph (MCP server `code-review-graph`): `get_minimal_context_tool(task=...)`, then `build_or_update_graph_tool` if the graph is stale; check the impact radius of the files you plan to touch, and find callers with `query_graph_tool` rather than guessing.
2. **Stay in scope.** Change only what the task requires: no renaming, reformatting or refactoring outside it, no speculative abstraction. Report unrelated problems instead of fixing them in passing.
3. **Do not reinvent the wheel.** Before writing generic code, look for an existing dependency or a maintained library. Propose any new module to the project owner with its utility, limits and alternatives; add it only once approved.
4. **Test what matters**, following "Writing relevant tests" in the guidelines, and **document as you go**: docstrings and TSDoc of the public functions you touch, and any document your change makes inaccurate.
5. **Prepare the review:** update the graph and run `detect_changes_tool` (risk, affected flows, test gaps).
6. **Get a cross-model review before committing:** a model from another provider when available and approved by the project owner (for example Codex); otherwise Claude Opus at high effort, through the `cross-model-reviewer` subagent. Light review if the risk is low, deep review if it is medium or high. Fix or answer every finding; unresolved disagreements go to the project owner.

Details, module catalogue and review checklist: `docs/development-guidelines.md`.

## Conventions

Full rules in `docs/development-guidelines.md`. The essentials:

- **Language:** code identifiers, comments, docstrings, technical documents and commit messages in English. Business documents (`docs/vision.md`, `docs/regles-metier.md`, `docs/glossaire.md`) stay in French. The UI is bilingual (FR/EN). Translate existing French comments when you modify the surrounding code, not in bulk.
- **Structure:** backend modules by domain (thin router, FastAPI-free service, repository); frontend by feature (`src/features/<domain>/`, shared code in `src/shared/`).
- **Frontend stack (mandatory):** React, React Router and Tailwind CSS. Never introduce another UI framework, router or styling system.
- **Data access:** SQLAlchemy 2 with Alembic migrations; SPARQL in `.rq` files with named placeholders filled by the escaping helpers, and a typed builder only for the custom search.
- **Quality tools:** Ruff and mypy (strict) for Python; Vite+ (oxlint, oxfmt, Vitest) for the frontend.
- **Tests:** unit tests for every decided business rule, API integration tests with simulated Corese, component and hook tests, Playwright journeys with axe. Every bug fix gets a regression test.
- **Size:** indicative limits of ~200 lines per component, ~50 per function, ~400 per file; beyond that, split or justify.
- **Accessibility (RGAA):** built into every component: semantic HTML, keyboard navigation, labels, contrast, no information conveyed by color alone.
- **Visual design:** follow `docs/design-system.md`. There are no separate mockups: screens are built from design tokens and catalogue components, and every visual change goes through its checklist.
- **Commits:** Conventional Commits, directly on `main` while there is a single developer. **No AI attribution:** never add a `Co-Authored-By` trailer or a "Generated with" line naming an AI tool (Claude, GPT, Codex, Gemini…) to a commit or a pull request.
- **API:** the legacy camelCase routes (`/getWorks`, `/getQC`…) are replaced in one go by a versioned REST API (`/v1/...`). Do not add legacy-style routes.
- **Comments** explain intent (why), not mechanics. **Traceability:** cite the rule ID (`RM-XXX-nn`) in code, tests and change descriptions.
- **Design:** DRY applies to knowledge (rules, data, security code), not to code that merely looks alike; SOLID through single responsibility and injected dependencies; KISS and YAGNI against over-engineering.
- **AI workflow:** analysis and architecture by Claude Opus 5.5 (high effort, max for critical tasks), then implementation by Claude Sonnet subagents (medium effort, high for critical tasks), then review by Claude Opus at high effort. Design implementation always uses medium effort and is cross-checked by Codex and Gemini 4 Hydrogen. Details in `docs/development-guidelines.md` ("AI workflow and models") and `CLAUDE.md`.

## Definition of done

- `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy` and `uv run pytest` pass; new logic has tests at the right level (see the guidelines), none of which needs network access.
- In `frontend/`: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test` and `npm run build` pass, and `npm run test:e2e` passes when a journey or a page changed; new files get the full lint rules (no new legacy override).
- New UI works with the keyboard, has labels and passes the automated accessibility checks.
- The diff contains only what the task requires: no unrelated renaming, reformatting or refactoring.
- A cross-model review was done (see "Working method") and every finding is fixed or answered.
- Docstrings, TSDoc and documents touched by the change are up to date; the documentation site builds in strict mode.
- New i18n keys exist in both `fr.ts` and `en.ts`.
- If a business rule changed, `docs/regles-metier.md` is updated in the same change.
- No secrets, `.env` files, databases or `__pycache__` added to git.

## Agent autonomy

- **Without asking:** read code, edit code, run tests, type checks and builds locally.
- **Only on explicit request:** `git commit`, `git push`, opening pull requests, any action on external services (Corese writes, OpenTheso, deployments), deleting data.
- **Never:** add a dependency without the project owner's approval; replace React, React Router or Tailwind CSS; add a licence file or licence headers (the code licence is pending, see `docs/vision.md`); modify the corpus in `data/files/`; edit the vendored VENUS bundle; implement a rule marked **À trancher**; change a **Décidé** rule without the project owner.
- **When a business rule is missing or ambiguous:** stop and ask. Record the agreed default in `docs/regles-metier.md` with the status **Proposé**.

## Known pitfalls

- Tests force a temporary database, built from the migrations, and block network access (`tests/conftest.py`). Only the tests marked `live` reach the production Corese or OpenTheso, and they are excluded by default. `backend-fastapi/data/*.db` is git-ignored because the database now holds accounts (emails, password hashes); `data/staging.db` was tracked before and is untracked at commit time: never commit it.
- The application refuses to start on a database that is not at the latest Alembic revision: run `uv run alembic upgrade head` from `backend-fastapi/` (the Docker image does it at start). Never run it against `data/staging.db` from an agent session.
- Accounts need HTTPS: the session cookie is `Secure`. For local development over plain HTTP only, set `SESSION_COOKIE_SECURE=false`; registrations are closed unless `REGISTRATION_ENABLED=true`.
- Known gaps of the 2026-11-15 audit are written as tests in `tests/test_known_gaps.py`; one that is still open carries a strict `xfail` marker (none does since P0-3). When a fix makes one pass, remove its marker: the test then guards against regressions.
- The default SPARQL endpoint (`http://zoomathia.i3s.unice.fr/sparql`) is the **shared production** Corese. Unbounded queries (`SELECT *` without `LIMIT`, global `DESCRIBE`) can crash it (out of memory).
- Competency questions exist in three copies (`app/core/qcs_data.py`, `data/queries/*.rq`, SQLite) until RM-QC-01 is implemented. Keep them consistent if you must touch them.
- Concept categories are computed twice (backend `classify_concept`, frontend `getConceptCategoryInfo`) with diverging rules, until RM-CON-01 and RM-CON-02 are implemented.
- Statuses are stored as French labels ("En attente de validation", "Validé"…) and compared as strings in the frontend; migration to codes is planned.
- Annotation offsets in the free-text selection handlers are computed with `indexOf` (first occurrence): known bug, see RM-ANN-01.
- Keep `vite-plus`, the `vite` alias (`npm:@voidzero-dev/vite-plus-core`) and the `vitest` pin aligned: each appears in `devDependencies` and in `overrides` of `frontend/package.json`, with the same version. Upgrade them together (procedure in the decision record); a dependency bot must never bump one alone.

## Current priorities

1. Framing documents and development guidelines (this file and `docs/`): done on 2026-11-15.
2. Next:
   - tooling and test foundation (`docs/development-guidelines.md`, "Adoption"): backend, tests, documentation site and CI done on 2026-11-15; frontend tooling (Vite+, Vitest, Playwright with axe, TypeDoc, Node 24) done on 2026-11-16; the component catalogue tool is postponed to the start of P0-5a;
   - P0 security work (`docs/security.md`, "Known gaps"): the escaping helpers (P0-1), the unified SPARQL validation and guardrails (P0-2a, P0-2b) and the integrity of contributions (P0-3: server-side status, RDF serialization, protected native competency questions, input validation) are done; the account foundation (P0-4a: application database under SQLAlchemy 2 and Alembic, local accounts with admin activation, sessions with CSRF, admin endpoints, first-admin command) is done on 2026-11-16; P0-4b (the contribution endpoints require an active account, author from the session, peer review) ships together with the screens of P0-5.
3. Then: competency questions in the database, publication of validated annotations to Corese, categories from TheZoo collections, versioned REST API, TEI ingestion and pre-annotation.
