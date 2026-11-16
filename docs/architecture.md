# Architecture and sources of truth

> Validated during the framing session of 2026-11-15. This document describes the target; gaps with the current code are listed at the end.
> Business rules referenced as `RM-XXX-nn` are defined in [regles-metier.md](regles-metier.md) (French).

## Components

| Component | Role | Technology |
|---|---|---|
| Frontend | Web UI: reading, annotation, search, SPARQL playground | React 19, React Router, TypeScript, Vite, Tailwind CSS; served by nginx |
| API | Single entry point for every client, human or machine | FastAPI (Python) |
| Application database | Accounts, contributions, reviews, competency questions, submissions | SQLite today |
| Reference graph | Corpus, text structure, legacy and validated annotations, copy of TheZoo | Corese (imposed; developed by the Wimmics team) |
| Thesaurus | Reference for concepts | TheZoo (`th310`) on OpenTheso, Huma-Num |
| TEI files | Source texts of the corpus | `backend-fastapi/data/files/` |

**Mandatory frontend stack (decided 2026-11-15):** React, React Router and Tailwind CSS. No other UI framework, router or styling system (CSS-in-JS, other CSS frameworks, component kits with their own styling engine) is introduced. Headless component libraries styled with Tailwind remain possible under the dependency policy.

**Technology rationale.** Python/FastAPI gives access to the NLP ecosystem for ancient Greek and Latin and to RDF tooling, with Pydantic validation and a native OpenAPI schema. React, TypeScript and Vite replace the former Create React App frontend. Corese is an institutional choice (see below).

## Sources of truth

Each piece of data has exactly one source of truth. Any copy is derived, read-only and can be regenerated.

| Data | Source of truth | Derived copies | Written by |
|---|---|---|---|
| Source texts | TEI-XML files | — | Admin (import) |
| Text structure and paragraph text | Corese graph, generated from TEI | — | Ingestion pipeline |
| TheZoo thesaurus | OpenTheso | SKOS copy in Corese (RM-THE-06) | Thesaurus admin, in OpenTheso |
| Legacy annotations | Corese graph | — | AutomaZoo and HisINum pipelines |
| Contributions in progress (pending, suggestions, rejected) | Application database | — | API |
| Validated annotations | Corese, contributions named graph (RM-PUB-01) | Tracking record in the database (author, reviewer, dates) | API, at validation time |
| Term proposals | Application database | SKOS export | API |
| Competency questions | Application database (RM-QC-01) | — | API |
| Accounts and roles | Application database | — | API |

## Main flows

1. **Read**: client → API → Corese (cached); thesaurus autocompletion → OpenTheso.
2. **Contribute**: authenticated client → API → database (pending) → peer review → validation → RDF written to Corese.
3. **Thesaurus**: proposal → review → SKOS export → manual entry in OpenTheso → reload of the Corese copy.
4. **Ingestion**: submission (account or form) → admin review → TEI to RDF conversion → load into Corese → automatic pre-annotation → suggestions → human review.

## API

- **Decided:** the legacy RPC-style routes inherited from the Express version (`/getWorks`, `/getQC`, `/getConcepts`…) are replaced in one go by a versioned REST API (`/v1/...`). Only the Zoomathia frontend consumes them.
- **The API is a product for machine clients too** (see `vision.md`): documented OpenAPI schema, Pydantic models on every route, stable error format, service-account tokens (RM-MOD-04).
- **Errors are never masked.** An unreachable or slow dependency returns an explicit status (502, 504), never an empty success.
- **Proposed:** legacy *frontend* URLs (`/ExploreAWork`, `/CompetencyQuestion`…) become real redirects, since they may be bookmarked or cited.

## Corese constraints

- **Corese is imposed** (decided 2026-11-15): no migration to another triplestore.
- **Unbounded queries** (global `SELECT *`, `DESCRIBE`) exhaust Corese memory. Every query goes through the guardrails of RM-ACC-02 (see [security.md](security.md)).
- **Corese has no query timeout** (confirmed 2026-11-15): none is configured on the shared instance, and Corese only offers one for federated `SERVICE` calls (`SERVICE_TIMEOUT`). A query runs until it completes or exhausts memory, even after the client has given up: the API's timeout protects the API, not Corese.
- **The API writes to Corese** (RM-PUB-01). Writes must use authenticated access, separate from the public read endpoint. Mechanism (SPARQL Update, Graph Store Protocol, protection) *to be confirmed with the Corese / I3S team.*
- **The endpoint `http://zoomathia.i3s.unice.fr/sparql` is public.** API guardrails do not protect it from direct access; protecting it is a matter of Corese configuration and I3S infrastructure.
- **Standard SPARQL 1.1 only**, unless a Corese extension is explicitly needed and documented.
- **External services never block the UI.** OpenTheso calls are cached and degrade visibly rather than silently returning empty results.

## Environments and infrastructure

| Environment | Where | Role |
|---|---|---|
| Legacy application | `http://zoomathia.i3s.unice.fr/` | Previous version, English only. Reference for feature parity and for legacy URLs, which must keep working if the redesign replaces it. |
| SPARQL endpoint | `http://zoomathia.i3s.unice.fr/sparql` | Shared production Corese at I3S, read by every environment. |
| Preproduction of the redesign | The maintainer's hosting; the address is shared directly by the maintainer, not in this public repository | Shows the redesign as hosted. Plain HTTP today. |
| Production | **Open:** I3S (`zoomathia.i3s.unice.fr`, replacing the legacy application) or the maintainer's hosting with a domain name | — |

Whatever the production host, these constraints apply:

| Topic | Constraint |
|---|---|
| Hosting | Linux servers; Docker containers (multi-stage images, non-root users) |
| Public access | A domain name behind a reverse proxy with HTTPS; only the proxy is exposed |
| Configuration | No hard-coded IPs or personal paths; everything through environment variables |
| Persistence | Named volumes for the application database and uploaded files, with tested backups |

## Data formats

TEI-XML (texts), W3C Web Annotation (annotations), SKOS (thesaurus and proposals), SPARQL results in JSON and CSV, RDF Turtle exports. Exports carry their licence (RM-LIC-02).

## Performance and concurrency

**Decided (2026-11-15):** responses must be fast, including queries that rely on reasoning, and no user or request may block the others. Target load: 50 concurrent users, a whole class included, without degradation.

| Interaction | Target (95th percentile, server side) | Status |
|---|---|---|
| Navigation and reading, cached | < 300 ms | Proposed |
| Reading, not cached (Corese) | < 1.5 s | Proposed |
| Concept autocompletion | < 200 ms | Proposed |
| Custom search, competency question | < 3 s; beyond that, progressive or paginated results | Proposed |
| Writes (annotation, review) | < 300 ms; publication to Corese is asynchronous | Proposed |
| First page load (frontend) | Largest Contentful Paint < 2.5 s on a standard connection | Proposed |

- **Bulkheads:** interactive requests (navigation, reading, autocompletion) and heavy requests (free SPARQL, custom search, exports) have separate concurrency limits towards Corese, so heavy queries never starve the reading interface.
- **Background jobs** handle long tasks; the mechanism is chosen with the first long task.
- **Several API workers** run behind nginx. The API is stateless: shared state lives in the database.
- **Application database: SQLite in WAL mode first, PostgreSQL later** (decided). SQLite accepts one write at a time, so transactions stay short, `busy_timeout` is set and no long task holds a write transaction. *Proposed triggers* to move to PostgreSQL: lock errors or write latency above target in load tests; several API hosts; a job system that needs a server database.
- **Reasoning:** Corese inference and property paths are the most expensive operations. Materializing transitive closures when the graph is loaded is preferred to recomputing them at query time; path queries are bounded otherwise.
- **Caching:** bounded server cache with request coalescing; HTTP cache headers on stable resources; React Query cache on the client.

## Technical decisions

| Topic | Decision | Status |
|---|---|---|
| Concept categories | Computed once in the backend from TheZoo collections (RM-CON-01, RM-CON-02). | Decided |
| Frontend stack | React, React Router and Tailwind CSS, mandatory. | Decided |
| Named graphs | One graph per origin: corpus, thesaurus, legacy annotations, validated contributions. | Proposed |
| Application database | SQLite in WAL mode first, PostgreSQL later (see "Performance and concurrency"); SQLAlchemy 2 with Alembic migrations. | Decided |
| Documentation site | MkDocs Material with mkdocstrings, TypeDoc and the OpenAPI schema, built by the CI. | Decided |
| Corese access | A single access layer (SPARQL client); queries sent with POST; no query built by concatenating external values. | Proposed |
| API contract | Pydantic response models on every route; TypeScript types generated from the OpenAPI schema. | Proposed |

## Gaps with the current code

- Validated annotations stay in SQLite and never reach Corese.
- Competency questions exist in three copies (`app/core/qcs_data.py`, `data/queries/*.rq`, SQLite table).
- No authentication; author and status are sent by the client.
- SPARQL queries are built with f-strings and sent with GET.
- Concept categories are computed twice (backend and frontend) with diverging rules.
- Legacy RPC routes are still the only API.
- The footer says "licence ouverte" instead of CC BY 4.0.
- The preproduction of the redesign runs over plain HTTP: HTTPS is required before local accounts are enabled.
