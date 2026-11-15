# Development guidelines

> Decided during the development-guidelines session of 2026-11-15. Every rule is **Decided** unless marked **Proposed** (default to validate).
> These rules apply to all new code. Existing code is brought in line progressively, when it is modified.
> The tooling described here is **not installed yet**: see "Adoption" at the end.

## Principles

1. **Readable by humans first.** The code is maintained by researchers and engineers. Comments explain intent (why: TEI encoding quirks, SPARQL join choices, business rules), not mechanics.
2. **Business rules are explicit.** Implement the rules of [regles-metier.md](regles-metier.md), cite their IDs (`RM-XXX-nn`) and test them.
3. **One source of truth** per piece of data and per rule ([architecture.md](architecture.md)).
4. **Strict typing end to end**, from the database to the UI.
5. **Fail loudly.** Never hide an error behind an empty success; map failures to explicit statuses.
6. **Small units** (indicative size limits below).

## Design principles

### DRY: one place for each piece of knowledge

- A business rule, a dataset or a security-critical function (escaping, validation, authorization) exists in exactly one place. Counter-examples from the 2026-11-15 audit: concept classification duplicated between backend and frontend, the same SPARQL sanitizing pattern copied 18 times.
- Code that merely looks similar is not duplication. Extract on the third occurrence, and prefer a little duplication to the wrong abstraction.

### SOLID, where it applies

- **Single responsibility:** router = HTTP, service = rules, repository = storage; a component renders, a hook loads or computes.
- **Dependency inversion:** services receive their dependencies (SPARQL client, repository, clock, current user), so they can be tested without network.
- **Open/closed:** extend through data rather than chains of `if`, for example a collection → category table instead of label heuristics.
- **Liskov and interface segregation:** this stack uses little inheritance. Prefer composition and small protocols; no class hierarchies "just in case".

### KISS and YAGNI: no over-engineering

- Implement the decided rules, not imagined ones. No abstraction, configuration option, plugin mechanism, base class, factory, registry or generic "manager" without a current, concrete need.
- Choose the simplest solution a newcomer can read without documentation. Prefer deleting code to adding code.
- A generic utility needs at least two real callers.

### Everyday rules

- **Names:** English domain terms from [glossaire.md](glossaire.md) (`work`, `witness`, `paragraph`); `snake_case` in Python, `camelCase` in TypeScript, `PascalCase` for components and classes; no abbreviations.
- **No magic values:** statuses and roles as enumerations, limits in settings, no hard-coded URIs.
- **Side effects at the edges:** pure functions where possible, I/O in repositories and clients. Never mutate a shared or cached object; return copies.
- **Dead code** is deleted, not commented out: version control keeps the history.

## Scope discipline: no gratuitous changes

- Change only what the task requires; keep the diff small and focused.
- Do not rename variables, functions or files, move code or reformat outside the task. Rename only a name that is wrong or misleading, in code you are already changing.
- Refactoring is a separate change, explicitly requested, in its own commit; never mixed with a feature or a fix.
- Formatting is the formatter's job. Applying the formatter to existing files is a dedicated commit.
- An unrelated problem noticed along the way is reported or proposed as a follow-up, not fixed in passing.

## Backend (FastAPI)

### Structure: modules by domain

```text
backend-fastapi/app/
  core/          settings, logging, database session, error handlers, security primitives
  shared/        cross-domain code: SPARQL client and escaping helpers, domain errors, pagination
  corpus/        works, parts, paragraphs, witnesses, translations
  annotations/   contributions, reviews, publication to Corese
  thesaurus/     concepts, categories, term proposals, OpenTheso client
  queries/       competency questions, personal queries, SPARQL playground
  accounts/      users, roles, service accounts, authentication
  ingestion/     TEI submissions, conversion, pre-annotation (later)
  main.py        application factory and router registration
```

Each domain package follows the same layout:

```text
annotations/
  router.py      HTTP only: parse the request, call the service, return response schemas
  service.py     business rules; no FastAPI import; raises domain errors
  repository.py  database access (SQLAlchemy)
  models.py      SQLAlchemy models
  schemas.py     Pydantic request and response models
  sparql/        .rq files used by this domain
```

Tests mirror this layout in `backend-fastapi/tests/<domain>/`.

### Rules

- **Routers are thin**: no business logic, no SPARQL, no SQL.
- **Services do not import FastAPI** and never raise `HTTPException`. They raise domain errors (`NotFound`, `Forbidden`, `Conflict`, `UpstreamUnavailable`…), mapped to HTTP statuses by handlers in `core/`.
- **Dependencies are injected** with `Depends` (database session, SPARQL client, current user), so tests can override them.
- **Pydantic v2 schemas for every request and response.** Statuses, roles, polarities and modes are enumerations, never free strings.
- **No blocking I/O in `async` handlers.** *Proposed:* SQLAlchemy's async engine (`aiosqlite`), consistent with the async SPARQL client.
- **Errors** use one format for all clients. *Proposed:* Problem Details (RFC 9457, `application/problem+json`).
- **List endpoints are paginated**, within the bounds of RM-ACC-02.
- **Logging** through the `logging` module, without secrets or personal data; never `print`.
- **Configuration** only through `core/settings.py` (pydantic-settings): no URL, path or credential in code.

### Database: SQLAlchemy 2 and Alembic

- Typed SQLAlchemy 2.0 models (`Mapped[...]`).
- One Alembic migration per schema change, committed with the code that needs it, never edited once pushed.
- Statuses stored as codes (`pending`, `suggested`, `validated`, `rejected`, `retracted`) and translated in the UI.
- Tests build a temporary database from the migrations.

### SPARQL: `.rq` files and a builder

- Fixed queries live in `.rq` files next to the domain that uses them (`<domain>/sparql/*.rq`).
- Parameters are named placeholders, *Proposed syntax:* `{{ name }}`. It is invalid SPARQL, so an unfilled placeholder fails loudly.
- Placeholders are filled only by the shared helpers (`sparql_iri()`, `sparql_literal()`, `sparql_lang()`, `sparql_int()`). A single loader renders a query and rejects missing or unknown parameters.
- Only the custom search, which is dynamic, uses a small typed builder that emits the same escaped fragments.
- Each `.rq` file starts with a comment giving its purpose, its parameters and its expected cost.
- Queries are sent with POST and are bounded (`LIMIT`, or an aggregate with bounded output).

### Python tooling

- **Ruff** for linting and formatting (`ruff check`, `ruff format`). *Proposed rule set:* `E, F, W, I, B, UP, SIM, N, S, C90`.
- **mypy in strict mode** on new modules, extended to existing modules as they are refactored (per-module overrides in `pyproject.toml`).
- **uv** for dependencies (`uv add`); `uv.lock` is committed.

## Frontend (React, React Router, Tailwind CSS)

**Mandatory stack** (decided 2026-11-15): React, React Router and Tailwind CSS. No other UI framework, router or styling system; headless component libraries styled with Tailwind remain possible under the dependency policy.

### Structure: by feature

```text
frontend/src/
  app/            providers, router, layout, error boundaries
  features/
    reading/      work reader, paragraphs, display of annotations
    annotation/   text selection, annotation form, review queue
    search/       custom search, subcorpus
    sparql/       playground, saved queries, competency questions
    thesaurus/    concept search, term proposals
    accounts/     sign-up, sign-in, profile, administration
  shared/
    api/          HTTP client and API types generated from OpenAPI
    ui/           design-system components (buttons, dialogs, badges)
    i18n/         translations
    lib/          pure helpers
```

Each feature contains `components/`, `hooks/` (React Query hooks such as `useWorkQuery`, `useCreateAnnotationMutation`), `api.ts`, `types.ts` and an `index.ts` that defines its public exports. A feature imports from `shared/`, and from another feature only through that feature's `index.ts`.

### Rules

- **Data fetching only through React Query hooks.** Components never call `fetch` or the HTTP client directly.
- **State placement:** server state in React Query; navigation state (work, section, filters) in the URL; UI state local to components. No global store unless a real need is recorded.
- **Components** separate presentation from logic: logic goes into hooks. Loading, error and empty states are explicit.
- **Styling:** Tailwind with design tokens declared once with `@theme` (colors, fonts, spacing), as defined in [design-system.md](design-system.md). No new hex literals in class names.
- **i18n:** every visible string in French and English; statuses are translated from their codes.
- **Types:** strict TypeScript, no `any`. API types are generated from the backend OpenAPI schema (*Proposed tool:* `openapi-typescript`).
- **Routing with React Router:** routes lazy-loaded per feature, an error boundary per route, a 404 route; navigation state lives in the URL.

### Frontend tooling: Vite+

- **Vite+** provides linting (oxlint, with the `react`, `react-hooks` and `jsx-a11y` plugins enabled), formatting (oxfmt) and tests (Vitest).
- **Versions are pinned** (exact versions, lockfile committed); every upgrade is a deliberate commit.
- **To check at installation, then record in a decision note:** whether oxfmt is stable or still in beta, Tailwind class sorting support, and oxlint's `jsx-a11y` coverage compared with `eslint-plugin-jsx-a11y`.
- **npm scripts are the stable contract** used by humans, agents and CI: `dev`, `build`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:e2e`.

## Performance and concurrency

Targets and architecture constraints are in [architecture.md](architecture.md), section "Performance and concurrency". Rules for every change:

- **Nothing blocks other users.** No blocking I/O in `async` code; short database transactions; no global lock; no in-process state that breaks with several workers.
- **Heavy work is isolated.** Free SPARQL queries, custom searches and exports run under their own concurrency limits, so they never starve reading and navigation.
- **Long tasks run in the background** (ingestion, pre-annotation, batch publication to Corese, large exports): the request returns at once and the client follows progress. The job mechanism is chosen when the first long task is implemented, following the dependency policy.
- **Every external call has a timeout**, and requests abandoned by the client are cancelled (React Query passes its abort signal down to `fetch`).
- **Every list is bounded and paginated**; nothing loads a whole corpus or thesaurus at once.
- **Identical concurrent queries are computed once** (cache with request coalescing), for example when a whole class runs the same competency question.
- **Costly reasoning is precomputed** when measurements show it matters: transitive closures (`skos:broader+`, `zoo:hasPart+`) materialized when the graph is loaded, instead of recomputed by every query.
- **Frontend:** routes and heavy libraries (VENUS) load on demand; long texts and lists are virtualized; inputs that trigger requests are debounced.
- **Measure before optimizing:** every endpoint logs its duration, and a load test at the target load (50 concurrent users) runs before each release.

## Dependencies: do not reinvent the wheel

- Before writing generic code (parsing, serialization, authentication, rate limiting, validation, retries, editors, charts…), check whether an existing dependency or a well-maintained library already does it.
- **Every new module is proposed to the project owner before it is added**, with:

| Item | Content |
|---|---|
| Need | The problem it solves in Zoomathia |
| Utility | What it brings compared with writing the code ourselves |
| Limits | Size, maintenance activity, licence, security history, lock-in, what it does not cover |
| Alternatives | Other modules, an existing dependency, or a small in-house implementation |

- **Selection criteria:** licence compatible with an open-source publication of the code; active maintenance; real adoption; no unresolved security advisory; reasonable bundle size on the frontend.
- **The reverse also holds:** do not replace small, working in-house code (for example the typed i18n module) just because a library exists.

### Starter catalogue

Modules identified for the coming work. Check each one's version and maintenance status when adding it.

| Need | Module | Utility | Limits |
|---|---|---|---|
| RDF exports, SPARQL validation | `rdflib` | Correct Turtle serialization; SPARQL 1.1 parser to check the query form and reject `SERVICE` | Does not parse Corese-specific extensions (such queries are rejected) |
| Password hashing | `pwdlib` (Argon2) | Argon2id, the option used in the FastAPI documentation | Hashing only, no account management; avoid `passlib`, unmaintained |
| Local accounts (registration, verification, reset) | `fastapi-users`, or a minimal in-house flow on `pwdlib` and signed tokens | `fastapi-users` covers the whole flow | **To evaluate during the P0 work:** maintenance status of `fastapi-users`; an in-house flow means more security-sensitive code to own |
| Anti-flood throttling | nginx `limit_req` | Already in the stack, no code to write | Per IP only; per-route business limits would need `slowapi` |
| Corese and OpenTheso doubles in tests | `respx` | Intercepts `httpx` at transport level: realistic tests without network | `httpx` only; fixtures must stay in line with real responses (`live` tests) |
| TEI-XML parsing (ingestion) | `lxml` | Fast, XPath, the usual choice for TEI | Must be configured against XXE (`resolve_entities=False`, `no_network=True`) |
| API types on the frontend | `openapi-typescript` | Types generated from OpenAPI, no hand-written copies | Types only, no runtime validation; relies on backend response models |
| Network mocking in frontend tests | `msw` | Mocks the API at network level: hooks and components tested as in production | Handlers to keep in line with the API |
| User-facing tests | Testing Library, `user-event` | Tests by role and label, the way users interact | — |
| Accessibility checks | `axe-core` (`@axe-core/playwright`, `vitest-axe`) | Automated WCAG checks in tests | Finds only part of the issues; manual checks remain necessary |
| SPARQL editor | CodeMirror 6 with the SPARQL mode of `@codemirror/legacy-modes`, or YASGUI | Replaces the in-house editor, highlighter and tokenizer (~580 lines) with maintained code | **To evaluate:** bundle size (YASGUI is heavy), styling, maintenance status |
| Changelog | `git-cliff` | `CHANGELOG.md` generated from Conventional Commits | Requires disciplined commit messages |
| Dependency audit | `pip-audit`, `npm audit` | Known vulnerabilities in dependencies | Known advisories only |
| Documentation site | `mkdocs-material`, `mkdocstrings[python]` | One site for hand-written and generated documentation; Python reference from docstrings | Docstrings must be maintained; Material for MkDocs reaches end of life on 2027-05-05: migrate to Zensical, its successor reading the same `mkdocs.yml`, before that date |
| TypeScript reference | `typedoc`, with `typedoc-plugin-markdown` to include it in MkDocs | Reference generated from TSDoc | Documents exported symbols only |
| Accessible UI primitives (dialogs, menus, comboboxes) | Radix UI or React Aria, headless and styled with Tailwind | Keyboard and screen-reader behaviour already solved; could replace the in-house `MultiSelectCombobox` (314 lines) | **To evaluate:** one more dependency; check bundle size and fit with the design tokens |
| Component catalogue | Storybook, or Ladle | Visual reference replacing mockups ([design-system.md](design-system.md)); Storybook adds axe checks and Vitest integration | **To choose at adoption:** Storybook is heavier; Ladle is lighter but has fewer add-ons |
| Load testing | `locust`, or k6 | Scenarios simulating the target load (50 concurrent users); Locust is written in Python, like the backend | **To choose at adoption:** k6 is more efficient at high load but uses JavaScript and another runtime |

## Tests

| Level | Scope | Tools | Network |
|---|---|---|---|
| Unit | Every decided business rule and all pure logic | pytest, Vitest | None |
| API integration | Routes with a temporary database, Corese and OpenTheso simulated | pytest, httpx, respx | None |
| Components and hooks | Key components and hooks, with accessibility checks | Vitest, Testing Library, axe | None |
| End to end | Critical journeys: reading, annotation, review, sign-in | Playwright with axe | Local stack, Corese simulated |
| Live contract (on demand) | A few bounded read-only queries against the real Corese | pytest, `live` marker | Yes |

- Test names cite the rule they verify, for example `test_rm_mod_01_author_cannot_review_own_contribution`.
- Every bug fix comes with a regression test.
- Tests never touch `data/staging.db`. Only `live` tests reach the production Corese, and never automatically in CI.
- *Proposed:* no hard coverage percentage. Every decided rule must be covered; the coverage report is informative.

### Writing relevant tests

- **Test behaviour, not implementation.** Go through public interfaces: service functions, HTTP routes, what the user sees (roles, labels, text). Do not assert on private functions, internal state or call counts of internal collaborators.
- **Every test must be able to catch a real bug.** Before writing it, name the bug it would catch. No test that re-checks the framework (Pydantic types, FastAPI routing), asserts on a mock it just configured, or only executes code for coverage.
- **Mock only at the boundaries:** Corese and OpenTheso (`respx`), email, the clock (injected), randomness. Never mock the unit under test or our own internal modules; prefer real collaborators and a real temporary database.
- **One behaviour per test**, structured as arrange, act, assert, with a name that cites the rule (`test_rm_ctb_04_status_is_set_by_server`).
- **Deterministic and isolated:** no network, no `sleep`, no dependence on execution order or wall-clock time; each test gets a fresh database.
- **Realistic fixtures:** SPARQL responses recorded from the real Corese and trimmed, checked periodically by the `live` tests so they do not drift.
- **Domain edge cases first:** polytonic Greek and Latin Unicode, a word repeated in a paragraph (the `indexOf` bug), selections across paragraphs, empty results, Corese unreachable (502) or slow (504), self-review attempts, injection payloads (SPARQL, Turtle, CSV).
- **A regression test fails first:** reproduce the bug, watch the test fail, then fix.
- **Frontend:** query by role and label (this also checks accessibility), interact with `user-event`, mock the network with MSW rather than mocking hooks; no large snapshots.
- **End to end:** few journeys, critical ones only, stable selectors (roles), no fixed waits.
- **A fast suite:** unit and integration tests run in seconds, on every change. A slow or flaky test is fixed or removed, never ignored.

## AI workflow and models

Decided 2026-11-15. Every task goes through three phases, and its criticality sets the effort.

1. **Analysis and architecture:** Claude Opus 5.5 frames the task: business rules involved, impact (code-review-graph), approach, tests to write, risks and criticality. The phase ends with an implementation brief. When the main session is not Opus, it delegates this phase to the `architect` subagent.
2. **Implementation:** Claude Sonnet subagents (`implementer`) write the code from the brief.
3. **Review:** every review done by Claude uses Claude Opus at high effort (see "Cross-model review").

| Criticality | Typical tasks | Analysis (Opus) | Implementation (Sonnet) |
|---|---|---|---|
| Critical | Security, authentication and permissions, decided business rules, data integrity (annotation positions, publication to Corese), migrations | max | high |
| Standard | Features, refactoring, tests, tooling | high | medium |
| Design | UI and visual implementation | high | medium, always |

- The analysis phase classifies the task and states it in the brief. When in doubt, the task is critical.
- **Design implementations are cross-checked by two other providers, Codex and Gemini 4 Hydrogen**, which receive the diff. The Gemini CLI is not installed on the maintainer's machine yet.
- Documentation-only tasks skip the implementation phase.

## Code review and impact analysis

### Working with code-review-graph

code-review-graph keeps a Tree-sitter graph of the code (functions, calls, flows, test coverage) for impact analysis and focused reviews.

- **Setup:** `pip install code-review-graph` (or `uv tool install code-review-graph`), then `code-review-graph build` at the repository root. MCP server: `code-review-graph serve`. Tools without MCP support use the CLI (`code-review-graph detect-changes`). The graph lives in `.code-review-graph/`, ignored by git.
- **At the start of a task:** `get_minimal_context_tool(task=...)` returns risk, communities, flows and suggested tools in about 100 tokens. If it reports `not_ready`, run `build_or_update_graph_tool` (incremental).
- **Before editing:** `get_impact_radius_tool` on the files you plan to touch; `query_graph_tool` to find callers and callees instead of guessing; `find_large_functions_tool` to spot units beyond the size limits.
- **After editing:** update the graph, then run `detect_changes_tool`: risk score, affected flows, test gaps. This prepares the review.
- Use `detail_level="minimal"` unless you need more.

### Cross-model review

- **Models:** every review done by Claude uses Claude Opus at high effort, never a smaller model (see "AI workflow and models").
- **Every code change is reviewed before commit by a model other than its author:** a model from another provider when available and approved by the project owner (for example Codex, which then receives the diff); otherwise Claude Opus at high effort.
- **Depth follows the risk computed by code-review-graph:** low risk → light review (`detect_changes_tool` in minimal mode); medium or high risk → deep review with source code (`detect_changes_tool` in standard mode, then `get_review_context_tool`).
- **The author fixes or answers every finding.** Unresolved disagreements go to the project owner, who decides.
- Documentation-only changes, typo fixes and trivial configuration changes are exempt.

### Review checklist

1. **Correctness:** does the change do what the task asks, including edge cases?
2. **Business rules:** consistent with `regles-metier.md` (IDs cited, statuses respected)? No rule invented or silently changed?
3. **Security:** the non-negotiable rules of `AGENTS.md` (SPARQL escaping, server-set author and status, serializers, authorization).
4. **Tests:** relevant according to "Writing relevant tests"; test gaps reported by code-review-graph covered or justified.
5. **Design:** no duplicated knowledge, no speculative abstraction, size limits respected.
6. **Scope:** no unrelated renaming, reformatting or refactoring.
7. **Dependencies:** any new module justified (utility, limits, alternatives) and approved.
8. **UI:** accessibility and i18n in both languages.

Findings are ranked by severity, with file and line, the concrete failure scenario and a suggested fix. No remark on style already enforced by the formatter or the linter.

## Continuous integration (GitHub Actions)

- **On every push to `main`:**
  - backend: `ruff check`, `ruff format --check`, mypy, tests without network;
  - frontend: lint, format check, type check, tests, build;
  - Playwright journeys, once the suite exists.
- **Weekly:** `pip-audit` and `npm audit`, outside the push checks, so they never block a push. A finding makes the scheduled run fail visibly, and the run summary lists the findings.
- A failing pipeline on `main` is fixed before any other work.

## Versions and changelog

- Semantic versioning; each release is a git tag `vX.Y.Z`.
- `CHANGELOG.md` is generated from the Conventional Commits at each release (*Proposed tool:* git-cliff) and committed with the release.
- Breaking changes are marked `feat!:` or with a `BREAKING CHANGE:` footer.
- The API is versioned in its path (`/v1`).

## Size limits (indicative)

| Unit | Indicative limit |
|---|---|
| React component | ~200 lines |
| Function | ~50 lines |
| File | ~400 lines |

Beyond these limits, split the unit or justify the exception in the change description.

## Accessibility (RGAA)

Accessibility is built into every component, not added at the end.

- Semantic HTML first; every interaction works with the keyboard; focus is visible and managed in dialogs.
- Inputs and icon-only buttons have labels; contrast meets the target (design tokens are chosen accordingly); reduced-motion preferences are respected.
- **No information is conveyed by color alone**: annotation categories, currently distinguished by color, also need a second cue (pattern, underline style or text label).
- Ancient texts carry their language for screen readers: `lang="grc"` for ancient Greek, `lang="la"` for Latin.
- **Automated checks:** oxlint `jsx-a11y` rules, axe in component tests and Playwright journeys.
- **Manual checks:** a keyboard pass on every new screen, and a full RGAA audit before public opening.

## Git workflow

- **Single developer for now:** commits go directly on `main` (decided 2026-11-15). Switch to feature branches and pull requests when a second developer joins.
- Conventional Commits in English; small commits, one logical change each.
- **No AI attribution** in commits or pull requests: no `Co-Authored-By` trailer and no "Generated with" line naming an AI tool (decided 2026-11-15).
- Generated files are not committed, except lockfiles and the release changelog.
- Agents commit or push only on explicit request ([AGENTS.md](https://github.com/Sensaku/Zoomathia-app/blob/main/AGENTS.md)).

## Documentation

### Generated documentation site

- One site built with **MkDocs Material** gathers:
  - the hand-written documents of `docs/` (business documents in French, technical documents in English);
  - the **Python reference**, generated from docstrings with **mkdocstrings**;
  - the **TypeScript reference**, generated from TSDoc comments with **TypeDoc**;
  - the **HTTP API reference**, generated from the OpenAPI schema exported by FastAPI.
- The CI builds it on every push in strict mode: broken links and warnings fail the build. Generated output is never committed. *Proposed:* publication on GitHub Pages, or on I3S hosting if the repository stays private.
- The code-review-graph wiki (`generate_wiki_tool`, written to `.code-review-graph/wiki/`) is a local navigation aid, not part of the published site.

### Documentation as you go

- A change updates, in the same commit: the docstrings and TSDoc of the public functions it touches, the business rules it implements or changes, and any document it makes inaccurate.
- Docstrings follow the Google style for public Python functions; TSDoc covers exported TypeScript functions, hooks and components. Both include a short example when usage is not obvious.
- *Proposed:* one short decision record per significant technical choice in `docs/decisions/NNNN-title.md` (context, decision, consequences).
- READMEs cover setup and commands only, with relative links.

### Accessible to junior developers

- **Target:** a junior developer makes a first contribution within their first week, with the documentation alone.
- [onboarding.md](onboarding.md) is the entry point: understanding the project, semantic web basics through MOOCs and official specifications (we link to them rather than rewrite tutorials), setup, a tour of the code, a first contribution.
- **Step-by-step recipes** (`docs/recipes/`) are written together with the first implementation of each pattern: adding an endpoint, a frontend feature, a business rule, tests, a SPARQL query.
- **Code is written for a newcomer to read:** intent comments, explicit names, no clever tricks (see "Design principles").

## Adoption

*Proposed order* to bring the repository in line with these guidelines:

1. **Tooling:** Ruff, mypy, Vite+ (oxlint, oxfmt, Vitest), Playwright, MkDocs Material with mkdocstrings and TypeDoc, their configuration files, the npm and uv scripts, the CI workflow. *Status (2026-11-15):* backend tooling, documentation site (Python reference) and CI done; Vite+, Playwright and TypeDoc wait for Node 24 on the maintainer's machine.
2. **Test foundation:** `conftest.py` with a temporary database and simulated Corese; first unit tests of the decided rules. *Status (2026-11-15):* done for the backend, including the known gaps of the audit written as strict `xfail` tests (`tests/test_known_gaps.py`).
3. **Progressive restructuring:** new code goes straight into the target structure; existing modules move when they are modified, starting with the domains touched by the P0 security work (accounts, annotations).

code-review-graph is already operational: the graph was first built on 2026-11-15 (70 files) and is updated incrementally.
