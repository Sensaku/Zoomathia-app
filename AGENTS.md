# AGENTS.md

Guide for the AI coding agents (Claude Code, Codex, Cursor…) and the developers of this repository. Keep it short and true: update it in the same change as what it describes.

## Project in brief

Zoomathia is a research project that supports the study of the cultural transmission of zoological knowledge from Antiquity to the Middle Ages. This repository is the **Zoomathia application**: an open research service to read, search and collaboratively annotate Greek and Latin zoological texts with the TheZoo thesaurus, and to publish open RDF data. AI agents and automated annotation pipelines are first-class API clients.

The production host is to be decided; `zoomathia.i3s.unice.fr` still serves the previous version.

New to the project? Start with `docs/onboarding.md`.

Read before any functional change (business documents, in French):

- `docs/vision.md`: mission, audiences, scope and out-of-scope, licences, roadmap.
- `docs/regles-metier.md`: business rules with stable IDs (`RM-XXX-nn`) and a status. **Décidé**: implement. **Proposé**: default; implement only if the task needs it, and flag it in the change description. **À trancher**: open; do not implement, ask.
- `docs/glossaire.md`: French domain terms and their English names in code.

Technical documents (English): `docs/architecture.md` (components, sources of truth, data flows, Corese), `docs/security.md` (requirements, known gaps), `docs/development-guidelines.md` (code organization, tooling, tests, CI, documentation, performance) and `docs/design-system.md` (visual identity, tokens, reading experience, accessibility, components).

## Repository map

| Path | Content |
|---|---|
| `backend-fastapi/app/routers/` | HTTP endpoints: thin, validation and calls to services only |
| `backend-fastapi/app/services/` | Business logic, SPARQL and OpenTheso clients, RDF exports |
| `backend-fastapi/app/models/` | Pydantic models (only the SPARQL playground request is left) |
| `backend-fastapi/app/accounts/` | Accounts domain (target layout): users, roles, sessions, CSRF, administration, `cli.py` for the first admin. Shared with the other domains: `viewer.py` (the acting account, router helpers) and `PublicIdentity` in `schemas.py` |
| `backend-fastapi/app/contributions/` | Contributions domain (target layout): annotations and term proposals; `policy.py` (permissions, single source of `allowed_actions`), repository with guarded writes, service, router |
| `backend-fastapi/app/queries/` | Saved SPARQL queries domain (target layout): same layers, plus the seeding of the native competency questions at startup |
| `backend-fastapi/app/core/database.py` | Async SQLAlchemy engine, `Base`, `get_db`; `clock.py` and `migrations.py` beside it |
| `backend-fastapi/migrations/` | Alembic revisions: the only owner of the database schema |
| `backend-fastapi/data/files/` | TEI-XML corpus (do not modify) |
| `backend-fastapi/data/queries/` | Competency question SPARQL files, to be migrated to the database (RM-QC-01) |
| `frontend/src/api/` | The only code that calls the backend: `client.ts` (public functions), `http.ts` (request core: session cookie, CSRF, errors) |
| `frontend/src/features/`, `frontend/src/shared/` | Target layout (since P0-5a): `features/accounts/` (session, sign-in, account), `features/contributions/` (statuses, creation and edit dialogs, reviews), `features/reading/` (paragraph card, annotated text, pinned-concept banner, reference annotation card, load errors, text size), `shared/ui/` (design-system components, shown in `frontend/catalogue.html`) |
| `frontend/src/pages/`, `frontend/src/components/` | React UI, legacy layout |
| `frontend/e2e/`, `backend-fastapi/tests/e2e/` | Playwright journeys and their local stack: the backend on a temporary database, a fake Corese, fixtures in `frontend/e2e/fixtures/` |
| `frontend/src/i18n/` | Typed FR/EN translations |
| `frontend/packages/wimmics-venus/` | Vendored VENUS build (do not edit) |

This is the current layout. The target layout (domain modules in the backend, features in the frontend) is in `docs/development-guidelines.md`; code moves there when it is modified.

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
npm run test:e2e             # Playwright with axe, against the build (npm run build first); starts its own backend (needs uv)
npm run docs                 # TypeDoc reference into docs/reference/frontend (not committed)
```

Frontend tooling: `docs/decisions/0001-frontend-tooling.md`. Run `npm run docs` before the MkDocs command: the site includes the generated TypeScript reference.

## Non-negotiable rules

1. **No request data is interpolated into SPARQL.** Use the shared escaping helpers for IRIs, literals and language tags (`app/shared/sparql.py`), or `VALUES`. Never write `f"... <{uri}> ..."` with external input.
2. **User-supplied SPARQL goes through one validation function**: parsed, `SELECT`/`ASK` only, no `SERVICE`, enforced `LIMIT` and timeout (RM-ACC-02).
3. **The server decides** the author (logged-in account), the initial status and the reviewer of any contribution (RM-CTB-03, RM-CTB-04). Never trust a client-sent `status`, author name, role or ID.
4. **RDF and CSV are produced by serializers** (`rdflib`, the `csv` module), never by string concatenation.
5. **One source of truth per piece of data** (`docs/architecture.md`). Never duplicate a business rule or a dataset: for example, concept categories are computed in the backend only (RM-CON-02).
6. **Business logic lives in backend services**, not in routers or React pages. Frontend data access goes through `src/api/client.ts` and React Query.
7. **Every user-visible string goes through i18n**, in French and English.
8. **Tests never touch `data/staging.db`** and never send unbounded queries to the production Corese endpoint.
9. **Failures are never masked**: map them to explicit HTTP statuses (400, 403, 404, 502, 504), never to an empty success.
10. **No request blocks the others**: no blocking I/O in async code, short database transactions, long tasks in background jobs, a timeout on every external call, every list bounded.

## Working method

1. **Frame the task before coding:** business rules, approach, tests, risks and criticality, in a short implementation brief. Start with code-review-graph (MCP server `code-review-graph`): `get_minimal_context_tool(task=...)` (`build_or_update_graph_tool` first if the graph is stale), the impact radius of the files you will touch, and `query_graph_tool` to find callers instead of guessing.
2. **Stay in scope:** no renaming, reformatting or refactoring outside the task, no speculative abstraction. Report unrelated problems instead of fixing them in passing.
3. **Do not reinvent the wheel:** look for an existing dependency or a maintained library before writing generic code. Propose any new module to the project owner (utility, limits, alternatives); add it only once approved.
4. **Test what matters** ("Writing relevant tests" in the guidelines) and **document as you go**: docstrings and TSDoc of the public functions you touch, and every document your change makes inaccurate.
5. **Prepare the review:** update the graph and run `detect_changes_tool` (risk, affected flows, test gaps).
6. **Get a cross-model review before committing:** a model from another provider when one is available and approved by the project owner (for example Codex), otherwise Claude Opus at high effort (`cross-model-reviewer` subagent). Light review for a low risk, deep review for a medium or high one. Fix or answer every finding; unresolved disagreements go to the project owner.

Details, module catalogue and review checklist: `docs/development-guidelines.md`.

## Conventions

The essentials (full rules in `docs/development-guidelines.md`):

- **Language:** code identifiers, comments, docstrings, technical documents and commit messages in English; the business documents (`docs/vision.md`, `docs/regles-metier.md`, `docs/glossaire.md`) in French. The UI is bilingual (FR/EN). Translate existing French comments only when you modify the code around them.
- **Structure:** backend modules by domain (thin router, FastAPI-free service, repository); frontend by feature (`src/features/<domain>/`, shared code in `src/shared/`).
- **Frontend stack (mandatory):** React, React Router and Tailwind CSS. Never another UI framework, router or styling system.
- **Data access:** SQLAlchemy 2 with Alembic migrations; SPARQL in `.rq` files with named placeholders filled by the escaping helpers, and a typed builder only for the custom search.
- **Quality tools:** Ruff and mypy (strict) for Python; Vite+ (Oxlint, Oxfmt, Vitest) for the frontend.
- **Tests:** unit tests for every decided business rule, API integration tests with simulated Corese, component and hook tests, Playwright journeys with axe. Every bug fix gets a regression test.
- **Size:** about 200 lines per component, 50 per function, 400 per file; beyond that, split or justify.
- **Accessibility (RGAA):** semantic HTML, keyboard navigation, labels, contrast, and never color alone to convey information.
- **Visual design:** no separate mockups. Screens use the design tokens and catalogue components of `docs/design-system.md`, and every visual change goes through its checklist.
- **Commits:** Conventional Commits, directly on `main` while there is a single developer. **No AI attribution:** never a `Co-Authored-By` trailer or a "Generated with" line naming an AI tool (Claude, GPT, Codex, Gemini…), in a commit or a pull request.
- **API:** a versioned REST API (`/v1/...`) replaces the legacy camelCase routes (`/getWorks`, `/getQC`…) in one go. Do not add legacy-style routes.
- **Writing:** documentation and comments are short and plain: key information first, everyday words, no unnecessarily long text. Comments explain intent (why), not mechanics.
- **Traceability:** cite the rule ID (`RM-XXX-nn`) in code, tests and change descriptions.
- **Design:** DRY applies to knowledge (rules, data, security code), not to code that merely looks alike; single responsibility and injected dependencies; KISS and YAGNI against over-engineering.
- **AI workflow:** Claude Opus 5.5 frames each task (high effort, max if critical), Claude Sonnet subagents implement it (medium effort, high if critical), Claude Opus reviews it (high effort). Design implementation always uses medium effort and is cross-checked by Codex and Gemini 4 Hydrogen. Details: `docs/development-guidelines.md` ("AI workflow and models") and `CLAUDE.md`.

## Definition of done

- `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy` and `uv run pytest` pass; new logic has tests at the right level (see the guidelines), and no test needs network access.
- In `frontend/`: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test` and `npm run build` pass, plus `npm run test:e2e` when a journey or a page changed. New files get the full lint rules (no new legacy override).
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

- Tests use a temporary database built from the migrations and block the network (`tests/conftest.py`). Only the tests marked `live` reach the production Corese or OpenTheso; they are excluded by default.
- `backend-fastapi/data/*.db` is git-ignored: the database holds accounts (emails, password hashes). Never commit `data/staging.db`, which used to be tracked.
- The application refuses to start on a database that is not at the latest Alembic revision: run `uv run alembic upgrade head` from `backend-fastapi/` (the Docker image does it at start). Never run it against `data/staging.db` from an agent session.
- Accounts need HTTPS: the session cookie is `Secure`. For local development over plain HTTP only, set `SESSION_COOKIE_SECURE=false`. Registrations are closed unless `REGISTRATION_ENABLED=true`.
- The gaps found by the 2026-11-15 audit are tests in `tests/test_known_gaps.py`. An open gap has a strict `xfail` marker (none since P0-3); when a fix makes it pass, remove the marker, so the test guards against regressions.
- The default SPARQL endpoint (`http://zoomathia.i3s.unice.fr/sparql`) is the **shared production** Corese. Unbounded queries (`SELECT *` without `LIMIT`, global `DESCRIBE`) can crash it (out of memory).
- Competency questions exist in three copies (`app/core/qcs_data.py`, `data/queries/*.rq`, SQLite) until RM-QC-01. Keep them consistent if you must touch them.
- Concept categories are computed twice, with diverging rules (backend `classify_concept`, frontend `getConceptCategoryInfo`), until RM-CON-01 and RM-CON-02.
- The CSRF token lives only in the React Query session cache (`features/accounts/session.ts`): never copy it to `localStorage` or a variable. Queries whose data carry `allowed_actions` use a root of `VIEWER_QUERY_ROOTS`, so they reload when the viewer changes.
- The e2e stack answers SPARQL from recorded fixtures: a journey that opens a new page may need a rule in `frontend/e2e/fixtures/corese.json` (the fake Corese logs the queries it cannot answer). OpenTheso is not simulated.
- Permissions live in `app/contributions/policy.py` and `app/queries/policy.py`, and the guarded SQL statements of the repositories repeat them. Change a rule in both: `test_the_sql_guards_agree_with_the_policy` catches a mismatch.
- Annotation offsets in the free-text selection handlers use `indexOf` (first occurrence): known bug, see RM-ANN-01.
- `vite-plus`, the `vite` alias (`npm:@voidzero-dev/vite-plus-core`) and the `vitest` pin appear in both `devDependencies` and `overrides` of `frontend/package.json`, with the same version. Upgrade them together (procedure in decision record 0001); a dependency bot must never bump one alone.

## Current priorities

1. **Done:** the framing documents and guidelines (2026-11-15); the tooling and test foundation (`docs/development-guidelines.md`, "Adoption"): backend on 2026-11-15, frontend on 2026-11-16, catalogue and e2e stack on 2026-11-18; the P0 security work from P0-1 to P0-4a (`docs/security.md`, "Known gaps").
2. **Now:** P0-4b (backend: accounts required, peer review, statuses as codes; 2026-11-16) and P0-5a (first screens: session, sign-in, account, password reset, reviews driven by `allowed_actions`; 2026-11-18) ship together. Next slices: P0-5b (account administration), P0-5c ("Mes contributions"), P0-5d (registration and privacy notice).
3. **Then:** competency questions in the database, publication of validated annotations to Corese, categories from TheZoo collections, versioned REST API, TEI ingestion and pre-annotation.
