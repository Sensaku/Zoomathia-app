# Security

> Security requirements for the Zoomathia application, derived from its target status (open research service) and from the business rules in [regles-metier.md](regles-metier.md) (French).
> Status: **Decided** (framing session of 2026-11-15), **Proposed** (default to validate), **Open** (needs a decision).

## Threat model

- **Anonymous users can read everything** (RM-ACC-01): every read endpoint is public and must withstand abuse.
- **Contributors are authenticated** but never moderate their own work (RM-MOD-01).
- **Service accounts** (AI agents, pipelines) are automated clients holding API tokens (RM-MOD-04).
- **Assets to protect**: availability of the shared Corese triplestore, integrity of the reference graph and of RDF exports, the application database (accounts, contributions), contributors' personal data.

## Authentication and accounts

| Requirement | Status |
|---|---|
| Local accounts (email and password) managed by the application | Decided (RM-CPT-01) |
| Account inactive until an admin activates it, after checking the email address and the declared identity (by hand until an SMTP server is available) | Decided (RM-CPT-02) |
| Passwords hashed with Argon2id through pwdlib, never logged | Decided |
| Password reset by an administrator until an SMTP server is available; then single-use, expiring tokens sent by email | Decided |
| Login throttling and temporary lockout after repeated failures | Proposed |
| Server-side sessions stored in the database and revocable, identified by an `HttpOnly`, `Secure`, `SameSite` cookie, with CSRF protection | Decided |
| Service-account tokens: random, stored hashed, limited to creating suggestions, revocable by an admin | Proposed |

## Authorization

- Enforced **server-side** on every write endpoint, from the role matrix in `regles-metier.md`. The frontend only hides controls.
- Author, status, reviewer and timestamps are always set by the server (RM-CTB-03, RM-CTB-04).
- Self-review is forbidden for everyone, admins included (RM-MOD-01).

## Abuse and denial-of-service guardrails (RM-ACC-02)

No usage quotas. Guardrails are sized so that normal use never reaches them.

| Guardrail | Value | Status |
|---|---|---|
| SPARQL timeout (API → Corese, client side only: the API answers 504, but Corese keeps computing, since it has no query timeout of its own) | 30 s | Implemented |
| Maximum rows returned (enforced `LIMIT`, `MAX_ROWS`) | 10,000 | Implemented (P0-2a) |
| Maximum response size, read as a stream, 422 beyond: every query by default (`MAX_RESPONSE_BYTES`) | 10 MB | Implemented (P0-2a) |
| Maximum response size, read as a stream, 422 beyond: searches that hold a heavy-query slot (`MAX_SEARCH_RESPONSE_BYTES`: custom search, paragraph searches by concept); largest normal result measured: author-only custom search, Diodorus Siculus about 48 MB, Pliny the Elder about 18 MB | 64 MB | Implemented (P0-2a) |
| Cache of SPARQL results (`MAX_CACHE_BYTES`, LRU eviction by size, besides 500 entries) | 32 MB | Implemented (P0-2a) |
| Concurrent heavy queries per client IP (`MAX_HEAVY_PER_CLIENT`) and per worker (`MAX_HEAVY_TOTAL`); beyond that, 429 at once, never queued | 2 per client, 4 per worker | Implemented (P0-2a) |
| Anti-flood throttling per IP (blocks floods only) | 300 requests/min | Proposed |
| Request body size | 1 MB (TEI uploads: separate limit, 20 MB) | Proposed |
| Criteria in a custom search, and concepts in a paragraph search (`MAX_CRITERIA`, 400 beyond) | 30 | Implemented (P0-2a) |
| Length of a user-supplied SPARQL query (parsing cost: about 0.04 ms per character for real queries, up to about 0.56 ms for pathological ones, so at most about 3 s per parse; the longest stored query is under 3,000 characters) | 5,000 characters | Implemented (P0-2a) |

- User-supplied SPARQL is **parsed**, not filtered by keywords: only `SELECT` or `ASK`, no `SERVICE`, no dataset clauses (`FROM`, `FROM NAMED`), `LIMIT` enforced. Syntax rdflib cannot parse (Corese extensions included) is refused. The only functions a query can call by IRI are XSD casts (`http://www.w3.org/2001/XMLSchema#`, for example `xsd:integer(?x)`): every other IRI call is refused with 403, because Corese extension functions can read files or fetch URLs. The IRI is resolved from the prefixes declared in the query itself (an undeclared prefix is refused, a prefix declared twice gives 400), because rdflib and Corese do not share default prefixes. Standard built-in functions and aggregates are not affected.
- One validation function, `prepare_query` in `app/shared/sparql_guard.py` (application code calls its async twin `prepare_query_async`), serves every endpoint that runs or stores a full query: an update or a `SERVICE` or dataset clause gives 403, a syntax error, an unsupported form (`CONSTRUCT`, `DESCRIBE`), a text too deeply nested for the parser or a `LIMIT` above 10,000 gives 400. A `SELECT` without a top-level `LIMIT` gets `LIMIT 10000` appended on a new line; one that cannot take it (a trailing `VALUES` clause) must carry an explicit `LIMIT`.
- rdflib and Corese must read the same text, or a payload can hide `SERVICE` or a `LIMIT` from the validator: line endings are normalized to LF (rdflib ends a `#` comment at LF only, Corese also at CR), and `\u` / `\U` escape sequences and control characters (except tab and line feed) are refused with 400.
- Parsing is pure Python and cannot be interrupted, so it runs in one dedicated thread (`sparql-guard`): the event loop keeps serving other requests, and rdflib's parser, which is not documented as thread-safe, is confined to that thread. Accepted queries are kept in a 256-entry cache. Saved-query creation and update count as heavy requests, so every caller of the parser holds a heavy-query slot and the parser queue never holds more than `MAX_HEAVY_TOTAL` queries per worker.
- A large search result still costs memory and CPU on the API: a search near the 64 MB cap holds a few hundred MB while it is parsed and turned into a tree (four heavy requests per worker at most). A lighter search result is a follow-up.
- Until P0-2b builds the custom-search export on the server, that export runs the query sent by the client under the 10 MB cap and the 10,000-row limit: a large export fails with 422, a search with many criteria builds a query longer than 5,000 characters that the export refuses with 400, and rows beyond 10,000 are cut without notice.
- The concurrency limit counts requests in the memory of one worker, per `request.client.host`: behind the reverse proxy the real client address is only seen if uvicorn trusts the proxy's forwarded headers.
- User input never becomes a regular expression in SPARQL (use `CONTAINS`).
- Caches are bounded by size, not only by entry count.

## Input validation and output encoding

- Every string field has a maximum length. IRIs are validated (`http`/`https`). Language tags come from the allowed list (RM-THE-05).
- SPARQL is built with escaping helpers or `VALUES`, never by interpolating request data.
- RDF exports use `rdflib`. CSV exports use the `csv` module and neutralize formulas (cells starting with `=`, `+`, `-`, `@`).
- External URLs (OpenTheso) are built with proper URL encoding.
- Links rendered from user data are restricted to `http`/`https`.

## Corese write access (RM-PUB-01)

- Writes go through an authenticated endpoint distinct from the public read endpoint. Credentials live only in server-side environment variables. **Open:** mechanism to agree with I3S.

## HTTP hardening (Proposed)

- **HTTPS on every public deployment before local accounts are enabled:** passwords and session cookies never travel over plain HTTP. The preproduction of the redesign is still HTTP only.
- nginx sends `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors`; TLS terminates at the reverse proxy.
- The backend port is not published publicly; `--forwarded-allow-ips` is restricted to the proxy.
- CORS lists explicit origins; credentials are allowed only if cookie sessions are used.
- Error responses carry no internal details (`str(e)`), and public endpoints expose no internal URLs.
- Fonts are self-hosted instead of loaded from Google Fonts.

## Personal data (GDPR)

- Minimization: name, email and affiliation only (RM-CPT-02, RM-CTB-02).
- Privacy notice and processing register before opening registrations.
- **Open:** contributions are licensed CC BY 4.0 and require attribution (RM-LIC-01). What happens to attribution when a contributor deletes their account (pseudonymization?) must be validated with the data protection officer.

## Repository and supply chain

- Never commit `.env` files, databases or `__pycache__`.
- Run dependency audits (`pip-audit`, `npm audit`) in CI (Proposed).
- The vendored VENUS bundle ships without sources: treat it as a third-party dependency and document its origin and version.

## Known gaps (audit of 2026-11-15)

Fixed so far:

- Injection through request data in the read endpoints, including the user regex of `/searchConcepts` and the incomplete escaping of `/getWorksFromAuthors` and `/customSearch` (P0-1, helpers in `app/shared/sparql.py`), and the regular expression built from Corese data in `/getTranslation` (P0-2a).
- `SERVICE`, dataset clauses and unbounded `SELECT` in the read and query endpoints (playground, saved queries, native competency questions, `/download-custom-search-*`), the keyword denylists, the limit on search criteria, and the heavy-query concurrency limit, and the Corese extension functions called by IRI, now limited to XSD casts (P0-2a, `app/shared/sparql_guard.py` and `app/shared/limits.py`). The `/download-custom-search-*` endpoints still take raw SPARQL: P0-2b replaces them.

| Priority | Gap | Rules |
|---|---|---|
| P0 | No authentication or authorization on write endpoints | RM-CTB-01, RM-MOD-01 |
| P0 | Client can set `status` at creation; native QCs can be overwritten with `PUT /queries/{id}` | RM-CTB-04, RM-QC-02 |
| P0 | Turtle injection in `/annotations/export-ttl` and `/thesaurus/proposals/export-ttl` | RM-PUB-01 |
| P0 | The export endpoints `/download-custom-search-*` still execute raw client SPARQL (now guarded by `prepare_query`); replaced by a server-built query in P0-2b | RM-ACC-02 |
| P0 | Corese has no query timeout (confirmed 2026-11-15: none is configured, and Corese only offers one for federated `SERVICE` calls). `LIMIT` bounds rows, not work: an accepted query (a cartesian product, a costly regular expression) keeps Corese computing after the API's 30 s timeout. The heavy-query slot is released at that point, so a client can start a new costly query every 30 s per slot while the previous ones still run, and they pile up on the shared Corese. P0-2b keeps the slot until Corese answers, with a safety cap (*proposed:* 10 minutes); the public endpoint stays exposed to direct queries | RM-ACC-02 |
| P1 | Unbounded caches (SPARQL results, OpenTheso); no maximum length on fields | RM-ACC-02 |
| P1 | CSV export not escaped (Greek `;`, formula injection) | — |
| P1 | OpenTheso URLs built without encoding | — |
| P2 | Error details leaked; health endpoint exposes the SPARQL URL; no nginx security headers; CORS credentials; `--forwarded-allow-ips "*"`; Google Fonts; `staging.db` and `__pycache__` tracked | — |
