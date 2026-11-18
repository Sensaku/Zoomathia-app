# Security

> Security requirements of the Zoomathia application, derived from its target status (open research service) and from the business rules of [regles-metier.md](regles-metier.md) (French).
> Status: **Decided** (framing session of 2026-11-15), **Proposed** (default to validate), **Open** (needs a decision).

## Threat model

- **Anonymous users can read everything** (RM-ACC-01): every read endpoint is public and must withstand abuse.
- **Contributors are authenticated** but never moderate their own work (RM-MOD-01).
- **Service accounts** (AI agents, pipelines) are automated clients holding API tokens (RM-MOD-04).
- **Assets to protect:** availability of the shared Corese triplestore, integrity of the reference graph and of the RDF exports, the application database (accounts, contributions), contributors' personal data.

## Authentication and accounts

| Requirement | Status |
|---|---|
| Local accounts (email and password) managed by the application | Decided, implemented (P0-4a, RM-CPT-01) |
| Account inactive until an admin activates it, after checking the email address and the declared identity (by hand until an SMTP server is available) | Decided, implemented (P0-4a, RM-CPT-02) |
| Passwords hashed with Argon2id through pwdlib, never logged | Decided, implemented (P0-4a) |
| Password reset by an administrator until an SMTP server is available; then single-use, expiring tokens sent by email | Decided, implemented by an administrator (P0-4a); by email once SMTP exists |
| Login throttling and temporary lockout after repeated failures | Proposed, implemented (P0-4a) |
| Server-side sessions stored in the database and revocable, identified by an `HttpOnly`, `Secure`, `SameSite` cookie, with CSRF protection | Decided, implemented (P0-4a); lifetimes (7 days idle, 30 days at most) decided 2026-11-16 |
| Service-account tokens: random, stored hashed, limited to creating suggestions, revocable by an admin | Proposed. The account type is decided (RM-MOD-04); its implementation is deferred to the pre-annotation work (decided 2026-11-16) |

The code lives in `app/accounts/` (P0-4a), `app/contributions/` and `app/queries/` (P0-4b), on the application database (SQLAlchemy 2 with the async engine; schema owned by Alembic in `migrations/`). Since P0-4b, every write of the contribution routes (annotations, term proposals) and of the saved-query routes needs an active account and the CSRF token (RM-CTB-01, RM-QC-06). The frontend sends both since P0-5a, which ships together with P0-4b.

### Accounts

- Roles `contributor` and `admin`; statuses `pending`, `active` and `deactivated`, stored as codes.
- The email is trimmed, lowercased and unique (simple format check, at most 254 characters); the admin does the real check (RM-CPT-02).
- Registration creates a pending contributor and records the acceptance of the licence (RM-LIC-02, *proposed*). It always answers `202` with the same message and leaves an existing account unchanged; the password is hashed in both cases, so not even the timing reveals whether an email is registered.
- **Registrations are closed by default** (`REGISTRATION_ENABLED=false`, `403 registration_closed`) until the privacy notice exists (see "Personal data"). The public `GET /auth/config` answers `{"registration_enabled": bool}` for the sign-up screen, and nothing else.
- An admin activates an account, deactivates it (RM-CPT-03: its sessions and unused reset tokens are revoked at once), changes its role, issues a reset token, or deletes a pending account (RM-CPT-04, *proposed*).
- An admin cannot deactivate, demote or delete their own account (`409 own_account`).
- Deactivating or demoting an active admin succeeds only if **another active admin remains**, checked inside the `UPDATE` itself (`409 last_admin`): even two admins acting on each other at the same moment cannot remove the last one. A direct edit of the database is not covered.
- The first admin is created on the server with `python -m app.accounts.cli create-admin`; the password is typed at a prompt, never in the environment, the command line or the logs (decided 2026-11-16).

### Sessions

Decided 2026-11-16.

- The cookie `zoomathia_session` holds `secrets.token_urlsafe(32)`. The database stores only its SHA-256, so a copy of the database cannot open a session.
- Attributes: `HttpOnly`, `Secure` (`SESSION_COOKIE_SECURE`, true by default), `SameSite=Strict`, `Path=/`, `Max-Age` of 30 days.
- A session expires after **7 days without activity** or **30 days after login**, whichever comes first (`SESSION_IDLE_DAYS`, `SESSION_MAX_DAYS`), and only works while its account is active.
- The server revokes sessions at once on logout, deactivation, password change (the other sessions) and password reset (all sessions).
- Login always creates a new session and deletes the session named by the incoming cookie (no session fixation); it also purges the expired sessions.
- `last_seen_at` is refreshed at most every 10 minutes (*proposed*, to limit SQLite writes), so the idle expiry can come up to 10 minutes early.
- The responses that carry a secret have `Cache-Control: no-store`: `POST /auth/login` and `GET /auth/me` (CSRF token), `POST /admin/users/{id}/password-reset` (reset token).

### CSRF

- Each session has a random synchronizer token, returned by `POST /auth/login` and `GET /auth/me`.
- Every unsafe request (POST, PUT, PATCH, DELETE) authenticated by the cookie sends it in `X-CSRF-Token`, compared in constant time; otherwise `403 csrf_failed`. The check sits in the authentication dependency (`optional_auth`), so every route that requires a session has it.
- The public routes (login, registration, password reset) have no session: they require `Content-Type: application/json` (`415 unsupported_media_type`), on top of `SameSite=Strict`.
- In the frontend (P0-5a), the token lives only in the React Query cache of the session (`GET /auth/me`), never in `localStorage`. The request core (`src/api/http.ts`) sends it on unsafe requests; after a `403 csrf_failed`, it reloads the session and retries once, only if the same account is still signed in.
- A `401 not_authenticated` on a write ends the session in the interface, which offers to sign in again. The return address (`/login?next=…`) only accepts relative paths of the same site.

### Passwords

*Proposed* policy.

- 12 to 128 characters after NFKC normalization, no composition rule, different from the email (case-insensitive); otherwise `422 invalid_password`.
- At most **4** hashes or verifications at a time per worker, each in a thread: an Argon2id hash uses about 64 MiB. A request waits at most 10 s for a slot, then gets `429 server_busy` with `Retry-After: 10`; this never counts as a failed login.
- Never hash, or wait for a hashing slot, inside a database transaction: it would block the other writers and drain the connection pool. Read, end the transaction, hash, then write.
- A login for an unknown email is checked against a dummy hash, so the timing does not reveal whether the account exists. The hash is renewed at login when the hashing parameters change.

### Login throttle

*Proposed* values.

- The key is the normalized email, whether or not an account exists.
- 5 failures within 15 minutes lock the key for 15 minutes: `429 too_many_attempts` with `Retry-After`, checked before any hashing, the same for an unknown email.
- Each attempt is counted atomically before its password is checked, so parallel attempts cannot exceed the limit (tested: of 20 simultaneous attempts on one email, exactly 5 are evaluated).
- A correct password resets the counter, even for a pending or deactivated account. A wrong current password on `POST /auth/password` counts as a failure.
- Counters whose window and lock are over are deleted at each attempt, so the table only holds the attempts of the last 15 minutes.
- nginx adds a zone for `/api/auth/login`, `/api/auth/register` and `/api/auth/password-reset`: 10 requests per minute per address, burst of 30 (enough for a workshop of 30 people behind one address), `429` beyond. `/api/auth/me` stays in the general zone.

### Password reset

- An admin issues a token (`POST /admin/users/{id}/password-reset`), shown once and passed on by hand until an SMTP server exists.
- The token is stored hashed, single-use (claimed by one atomic update) and valid **72 hours** (*proposed*). A new token cancels the unused ones of the account.
- Using it revokes every session of the account and clears its throttle.
- An unknown, used or expired token gives the same `400 invalid_reset_token`.
- The admin passes on a link `/reset-password#token=…`: a fragment never reaches a server or a `Referer`. The page reads it once, then removes it from the address bar and from the router state; reloading the page loses it, so the user opens the link again.

### Errors and logs

- Errors carry `{"detail": <English message>, "code": <stable code>}`; the screens translate the code: `invalid_credentials`, `account_pending`, `account_deactivated`, `too_many_attempts`, `csrf_failed`, `not_authenticated`, `admin_required`, `registration_closed`, `invalid_reset_token`, `invalid_password`, `user_not_found`, `email_already_registered` (server command only), `server_busy`, `own_account`, `last_admin`, `invalid_transition`, `unsupported_media_type`, `database_busy`.
- `database_busy` is a 503 with `Retry-After`, when the connection pool is exhausted or SQLite's write lock outlasts the busy timeout: never an unmapped 500.
- No response contains a password hash or a token hash. Raw tokens appear only in the session cookie (set at login), the session's CSRF token (for its owner) and a reset token (once, for the admin who issued it).
- Account events (login, failure, lockout, activation, role change, reset issued and used) are logged with user ids only: never an email, a password or a token.

### Accounts need HTTPS

The `Secure` cookie is never sent over plain HTTP, so the plain-HTTP preproduction cannot use accounts. `SESSION_COOKIE_SECURE=false` is for local development over plain HTTP only, and the application logs a warning at startup when it is set.

## Authorization

- Enforced **server-side** on every write endpoint, from the role matrix of `regles-metier.md`. The frontend only shows the actions listed in `allowed_actions` and never re-implements a rule.
- The server always sets author, status, reviewer and timestamps (RM-CTB-03, RM-CTB-04, RM-MOD-03): a name, an identifier, a status or `is_builtin` sent by a client is ignored.
- Nobody reviews their own contribution, admins included (RM-MOD-01). A review is final (RM-MOD-06).

### Permissions of the contributions and saved queries

Decided 2026-11-16 (P0-4b). One pure policy per domain (`app/contributions/policy.py`, `app/queries/policy.py`) is the single source: the service refuses with it and computes `allowed_actions` with it. The guarded SQL statements of the repositories repeat its conditions, so two racing requests cannot both win; a test checks that policy and SQL agree for every combination of viewer, authorship and status.

- *Contributions:* reading and listing are public, for every status (RM-ACC-03, RM-ACC-04); creating needs an account. The author edits a pending contribution (annotation: concept and justification only; proposal: every field) and deletes it while pending, even when the author is an admin. Any other active account reviews a pending contribution; any account reviews a historical one (RM-CTB-06). An admin deletes another person's pending or rejected contribution, never a validated one (RM-MOD-05), and edits a pending historical one.
- *Saved queries:* reading, running and exporting are public; creating needs an account. The author or an admin edits or deletes; a query saved before accounts existed is admin-only. Native competency questions are refused to everyone, admins included, until RM-QC-01 (RM-QC-02).
- *Concurrency:* each edit, review and delete is one conditional `UPDATE` or `DELETE` (status, `version` and author in the `WHERE` clause). When no row matches, the service checks in this order and answers 404, 403, 409 `not_pending` or 409 `version_conflict`. A reviewer therefore cannot validate content that the author changed after the reviewer loaded it.
- *Duplicates:* a pending term proposal is unique per normalized label (NFKC, case-folded) and language (partial unique index): a duplicate gets 409 `duplicate_proposal`, even from two simultaneous requests.
- *Error codes:* 401 `not_authenticated`; 403 `csrf_failed`, `not_author`, `own_contribution`, `builtin_query`; 404 `annotation_not_found`, `proposal_not_found`, `query_not_found`; 409 `not_pending`, `version_conflict`, `validated_contribution`, `duplicate_proposal`; 422 `too_many_results`.
- *Caps* (`422 too_many_results` beyond, never a silent truncation): 2,000 staged annotations in a reader section, 5,000 queries in the JSON export of the library, 10,000 rows per Turtle export.
- *Public identity* (RM-CPT-05): an author or a reviewer appears as `{id, display_name, affiliation}`. **No response and no export contains an email address** (tested on every route).
- *Logs:* moderation deletions by an admin are logged at INFO, with identifiers only.
- *Transactions:* one short transaction per operation. Running a saved query ends the transaction before calling Corese, so a long evaluation never holds a database connection (AGENTS.md rule 10). The saved-query write routes check the account before taking a heavy-query slot, so an anonymous request never holds one.

## Abuse and denial-of-service guardrails (RM-ACC-02)

No usage quotas. The guardrails are sized so that normal use never reaches them.

| Guardrail | Value | Status |
|---|---|---|
| SPARQL timeout for the caller (API → Corese) | 30 s | Implemented |
| Maximum rows returned (enforced `LIMIT`, `MAX_ROWS`) | 10,000 | Implemented (P0-2a) |
| Maximum response size, by default (`MAX_RESPONSE_BYTES`) | 10 MB | Implemented (P0-2a, P0-2b) |
| Maximum response size of the custom search and its CSV and JSON exports (`MAX_SEARCH_RESPONSE_BYTES`) | 64 MB | Implemented (P0-2a, P0-2b) |
| Cache of SPARQL results (`MAX_CACHE_BYTES`, besides 500 entries at most) | 32 MB | Implemented (P0-2a, P0-2b) |
| Concurrent heavy queries per client IP (`MAX_HEAVY_PER_CLIENT`) and per worker (`MAX_HEAVY_TOTAL`) | 2 per client, 4 per worker | Implemented (P0-2b) |
| Wait for a heavy-query slot (`MAX_HEAVY_WAIT_SECONDS`), with at most `MAX_HEAVY_WAITERS` waiting requests per worker and `MAX_HEAVY_WAITERS_PER_CLIENT` per client address (*proposed* waiting limits) | 10 s; 64 per worker, 32 per client | Implemented (P0-2b) |
| Duration of a heavy query upstream (`HEAVY_UPSTREAM_TIMEOUT`, read timeout and total duration; *proposed* value) | 600 s | Implemented (P0-2b) |
| Anti-flood throttling per IP: nginx `limit_req` on `/api/` (*proposed* sizing, to tune) | 30 requests/s, burst of 300 | Implemented (P0-2b) |
| Request body size (nginx `client_max_body_size`, 413 beyond) | 1 MB | Implemented (P0-2b) |
| Criteria in a custom search or its export, and concepts in a paragraph search (`MAX_CRITERIA`, 400 beyond) | 30 | Implemented (P0-2a, P0-2b) |
| Length of a user-supplied SPARQL query | 5,000 characters | Implemented (P0-2a) |

- **Where:** `MAX_HEAVY_*` and `MAX_CRITERIA` live in `app/shared/limits.py`, `MAX_ROWS` in `app/shared/sparql_guard.py`, and the size caps and `HEAVY_UPSTREAM_TIMEOUT` in `app/services/sparql_client.py`.
- **Timeout:** on the API side only. The API answers 504, but Corese, which has no query timeout of its own, keeps computing.
- **Response sizes** are read as a stream; 422 beyond the cap. Largest normal results, measured on 2026-11-16: about 2.8 MB for a paragraph search by concept, about 48 MB for a custom search by author (Diodorus Siculus). The custom-search export has no limit of its own (RM-EXP-01).
- **Cache:** evicts the least recently used results by size; the late answer of an abandoned query is cached too.
- **Waiting:** beyond the waiting limits, 429 with `Retry-After: 10`, never an unbounded queue. They suit a class of about 30 behind one address, and one client can never take every waiting place.
- **Anti-flood:** one bucket per client address; it only blocks floods.
- **Body size:** TEI uploads will need their own limit (20 MB) when ingestion exists.
- **Query length:** at most about 3 s of parsing; the longest stored query is under 3,000 characters.

### SPARQL validation

- User-supplied SPARQL is **parsed**, not filtered by keywords: `SELECT` or `ASK` only, no `SERVICE`, no dataset clauses (`FROM`, `FROM NAMED`), `LIMIT` enforced. What rdflib cannot parse (Corese extensions included) is refused.
- Functions called by IRI are limited to XSD casts (`http://www.w3.org/2001/XMLSchema#`, for example `xsd:integer(?x)`); any other gives 403, because Corese extension functions can read files or fetch URLs. The IRI is resolved from the prefixes declared in the query, since rdflib and Corese do not share default prefixes: an undeclared prefix is refused, and a prefix declared twice gives 400. Standard functions and aggregates are not affected.
- One function validates every query that is run or stored: `prepare_query` in `app/shared/sparql_guard.py` (async twin: `prepare_query_async`). An update, a `SERVICE` or a dataset clause gives 403. A syntax error, an unsupported form (`CONSTRUCT`, `DESCRIBE`), a text nested too deeply for the parser, or a `LIMIT` above 10,000 gives 400.
- A `SELECT` without a top-level `LIMIT` gets `LIMIT 10000` appended on a new line. One that cannot take it (a trailing `VALUES` clause) must carry an explicit `LIMIT`.
- rdflib and Corese must read the same text, or a payload could hide `SERVICE` or a `LIMIT` from the validator: line endings are normalized to LF (rdflib ends a `#` comment at LF only, Corese also at CR), and `\u` / `\U` escape sequences and control characters (except tab and line feed) are refused with 400.
- Parsing runs in one dedicated thread (`sparql-guard`): the event loop keeps serving, and rdflib's parser, which is not documented as thread-safe, stays in that thread. Accepted queries are cached (256 entries).
- Saving or updating a query counts as a heavy request (after the account check), so the parser queue never holds more than `MAX_HEAVY_TOTAL` queries per worker.

### Heavy queries

- The caller waits at most 30 s. A heavy query keeps its slot until Corese answers, fails or reaches the 600 s cap, even if the caller timed out (504) or left: queries still running count against the limits.
- Identical heavy queries (same text, same size cap) share one evaluation. A retry made while the first one runs joins it, and gets the answer if it arrives within its own 30 s wait. Only the first caller keeps its slot until Corese answers; a caller that joined adds no load on Corese and frees its slot when its own request ends. A retry made after it ended is served from the cache if the result is at most 32 MB (`MAX_CACHE_BYTES`) and still cached; otherwise Corese evaluates the query again.
- The logs record the duration, the outcome and the length of a heavy query, never its text. An abandoned query is logged as a warning.
- A search result near the 64 MB cap holds a few hundred MB of memory on the API while it is processed (at most four heavy requests per worker). A lighter search result is a follow-up.
- **Accepted residual risk:** one uvicorn worker runs (see the Dockerfile), so the limits are global. Two client addresses with two costly queries each can hold all 4 heavy slots for up to 600 s (still *proposed*) and block the heavy features meanwhile; reading and navigation are not affected.

### Other guardrails

- The CSV and JSON exports of the custom search (`POST /download-custom-search-json`, `POST /download-custom-search-csv`, same body as `POST /customSearch`) are built on the server from the search criteria: the client sends no SPARQL, and the former `GET ?sparql=` routes are gone. They have the guardrails of the search: criteria count, heavy-query slot, 64 MB cap, 502 and 504 mapping.
- The concurrency limit counts per worker and per `request.client.host`: behind the reverse proxy, uvicorn must trust the proxy's forwarded headers to see the real client address.
- User input never becomes a regular expression in SPARQL (use `CONTAINS`).
- Caches are bounded by size, not only by entry count.

## Input validation and output encoding

- **Scope:** the request models of the contributions (annotations and term proposals, with their edits and reviews), the saved queries, the custom search and its CSV and JSON exports, and the OpenTheso parameters bound every string, close every enumeration and validate every IRI. A value that breaks a rule gets 422 before it reaches the store or Corese (RM-ACC-02, RM-ANN-04, RM-THE-05). The other request strings have no declared maximum yet (see "Known gaps").
- The rules exist once, in `app/shared/validation.py`, and the Pydantic request models use them through annotated types. The response models do not validate, so rows stored before these rules stay readable.
- **IRIs:** `http` or `https`, at most 2,048 characters, no whitespace or control character, none of `<>"{}|\^` or the backtick (the rule of `sparql_iri`).
- **Concept IRIs** (`concept_uri` of an annotation, `broader_concept_uri` of a proposal) are TheZoo IRIs: `https://opentheso.huma-num.fr/?idc=<id>&idt=th310`, with an alphanumeric `<id>` of at most 64 characters (RM-ANN-04, decided 2026-11-16). An annotation may also target the IRI that the server minted for a concept proposed on the fly (`http://zoomathia.i3s.unice.fr/concept/proposal/<number>`), until its integration in TheZoo (RM-ANN-04, owner decision of 2026-11-16).
- **Paragraph IRIs** (`paragraph_uri`, `end_paragraph_uri`, each `target_paragraphs` item) belong to the corpus namespace `http://ns.inria.fr/zoomathia/`. Whether a concept or a paragraph exists is not checked.
- **Enumerations:** `scope_type` (`word`, `word_sequence`, `sentence`, `paragraph`, `multi_paragraph`), `concept_type` (`skos:Concept`, `skos:Collection`), `language` (`fr`, `en`, `la`, `grc`, RM-THE-05), the `status` of the list filters (the codes `pending`, `validated`, `rejected`; an unknown status, a French label included, gives 422), the `decision` of a review (`validated`, `rejected`), and, in a custom search, the `polarity` of a criterion (`include`, `exclude`) and the `match_mode` (`AND`, `OR`).
- **Text:** no lone surrogate, no C0 control character other than tab, line feed and carriage return, no delete character. Quotes, backslashes, line breaks and Greek are legitimate.
- **Maximum lengths** (*proposed* values, from the corpus measured on 2026-11-16: 48,378 paragraphs; longest text 18,197 characters, longest paragraph IRI 160, longest concept IRI and label 89). A value at the limit passes; one more character gives 422.

| Field | Maximum |
|---|---|
| `target_text` of an annotation | 50,000 characters |
| `start_offset`, `end_offset` | between 0 and 50,000 |
| `target_paragraphs` | 50 IRIs |
| `concept_label`, `pref_label`, each alternative label, `broader_concept_label` | 200 characters |
| `alt_labels` | 20 labels |
| `reason` of a rejection (required to reject, refused to validate) | 2,000 characters |
| `justification`, `definition` | 5,000 characters |
| Saved query: `title` / `description` / `category` | 200 / 2,000 / 100 characters |
| Saved query: `query_text`, `query_spo_text` (the limit of the SPARQL guard) | 5,000 characters |
| Query parameters: proposal search `q`, saved-query `search` | 200 characters |
| Query parameters: saved-query `category`, OpenTheso autocomplete `q` | 100 characters (autocomplete: 2 to 100) |
| Pagination: `limit` (annotations and proposals 1 to 200, default 50; saved queries 1 to 500, default 200) / `offset` | up to 100,000 rows skipped |
| Query parameter: `paragraph_uri` filter | 2,048 characters |
| Turtle exports (`GET /annotations/export-ttl`, `GET /thesaurus/proposals/export-ttl`), `MAX_EXPORTED_CONTRIBUTIONS` | 10,000 rows each; `422 too_many_results` beyond; serialized by rdflib in a thread |
| Custom search: author name / work IRI (included or excluded) | 200 / 2,048 characters |
| Custom search criteria: IRI of a concept or collection criterion (generic IRI rule: collections use other OpenTheso forms) / `label` / concept criterion `type` | 2,048 / 200 / 2,048 characters |
| Legacy `concepts` item of a custom search: string, or `uri`, `value` and `type` / `label` | 2,048 / 200 characters |

- The legacy `concepts` list of a custom search is strictly typed (an IRI, or an object with a string `uri` or `value`, and an optional string `type` and `label`): a malformed item gets 422, not a server error.
- SPARQL is built with the escaping helpers of `app/shared/sparql.py` or `VALUES`, never by interpolating request data.
- Text that reaches a SQL `LIKE` (proposal and saved-query searches) is escaped, so `%` and `_` match themselves. Annotations are listed for a paragraph by exact membership in their JSON list of paragraphs, not by substring.
- RDF exports use `rdflib` (`app/services/rdf_export.py`): no name, label or text can add a triple. A row stored before validation existed, with an unsafe IRI, language tag or text, is left out, logged by identifier and counted in the `X-Skipped-Rows` response header (`0` when none).
- CSV exports use the `csv` module and neutralize formulas (cells starting with `=`, `+`, `-`, `@`).
- OpenTheso URLs are encoded: the autocomplete text is one percent-encoded path segment (a text made only of dots too, which an HTTP client would otherwise drop), and a concept identifier must be alphanumeric, at most 64 characters, or the route answers 422 without calling OpenTheso. The OpenTheso cache keeps at most 1,000 entries (*proposed*) for 10 minutes, least recently used out first.
- Links rendered from user data are restricted to `http`/`https`.

## Corese write access (RM-PUB-01)

- Writes go through an authenticated endpoint distinct from the public read endpoint. Credentials live only in server-side environment variables. **Open:** the mechanism, to agree with I3S.

## HTTP hardening (Proposed)

- **HTTPS on every public deployment before local accounts are enabled:** passwords and session cookies never travel over plain HTTP. The preproduction of the redesign is still HTTP only.
- nginx sends `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors`; TLS terminates at the reverse proxy.
- **Done (P0-2b):** `docker-compose.yml` no longer publishes the backend port (nginx reaches `backend:3001` inside the Compose network); uvicorn trusts forwarded headers only from private networks (`--forwarded-allow-ips "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"`, no longer `*`); nginx overwrites `X-Forwarded-For` with `$remote_addr`, so a client cannot choose the address that the per-IP limits count.
- **Deployment:** the frontend nginx of the Compose stack must be the **first hop**, as in preproduction. With another reverse proxy or load balancer in front, every client would share one per-IP bucket: then configure `set_real_ip_from <proxy address or network>` and `real_ip_header X-Forwarded-For` (or `X-Real-IP`) in the frontend nginx, trusting only that proxy.
- **IPv6:** if the host serves IPv6 while the Compose network is IPv4 only, Docker's userland proxy gives every IPv6 client the address of the bridge gateway, so they share one per-IP bucket and one set of heavy-query limits. Enable IPv6 on the Compose network, or disable the userland proxy (to check on each host).
- CORS lists explicit origins, with credentials **disabled** (`CORS_ALLOW_CREDENTIALS=false`): the deployment is same-origin (nginx serves the SPA and proxies `/api`; Vite proxies `/api` in development), so a foreign origin cannot send the session cookie.
- Error responses carry no internal details (`str(e)`), and public endpoints expose no internal URLs.
- Fonts are self-hosted instead of loaded from Google Fonts.

## Personal data (GDPR)

- Minimization: name, email and affiliation only (RM-CPT-02, RM-CTB-02).
- Privacy notice and processing register before opening registrations: `REGISTRATION_ENABLED` stays `false` until then.
- *Proposed* (RM-CPT-04): an admin deletes a pending registration that is refused or unwanted, instead of keeping its data.
- **Open:** contributions are licensed CC BY 4.0 and require attribution (RM-LIC-01). What happens to attribution when a contributor deletes their account (pseudonymization?) must be validated with the data protection officer.

## Repository and supply chain

- Never commit `.env` files, databases or `__pycache__`. `backend-fastapi/data/*.db` (with its `-wal` and `-shm` files) is git-ignored: the application database holds accounts (emails, password hashes). `data/staging.db` used to be tracked and was removed from the index (`git rm --cached`).
- Dependency audits (`pip-audit`, `npm audit`) run weekly in CI.
- The vendored VENUS bundle ships without sources: treat it as a third-party dependency, and document its origin and version.

## Known gaps (audit of 2026-11-15)

Fixed so far (the sections above describe the protections):

- injection through request data in the read endpoints (P0-1), and a regular expression built from Corese data (P0-2a);
- unchecked user SPARQL: `SERVICE`, dataset clauses, unbounded `SELECT`, keyword denylists, Corese extension functions; no limit on search criteria and no heavy-query concurrency limit (P0-2a);
- custom-search exports that ran raw client SPARQL (P0-2b, RM-EXP-01);
- heavy queries refused at once when no slot was free, and slots freed before Corese had answered (P0-2b);
- CSV exports without the `csv` module and without formula neutralization (P0-2b);
- a paragraph search by concept slowed down by a label pattern unrelated to the search (P0-2b);
- integrity of contributions: Turtle injection, client-set status, editable native competency questions, unbounded inputs, `LIKE` and URL encoding (P0-3);
- contribution endpoints without authentication (P0-4b, with the screens of P0-5a).

P0-4b (RM-CTB-01, RM-MOD-01, RM-QC-06) closes the P0 gap of the audit; it ships with the screens of P0-5a.

Still open:

- **P1 (RM-ACC-02): Corese has no query timeout of its own** (confirmed 2026-11-15; Corese only offers one for federated `SERVICE` calls), and its public endpoint can be queried directly, outside the guardrails of the API. The heavy-query slots of the API neither limit nor stop a costly query sent straight to the endpoint. To raise with the Corese team and I3S: a query timeout in Corese, or an endpoint that only the API can reach.
- **P1 (RM-ACC-02): request strings without a declared maximum:** the query parameters of the read routes (`uri`, `title`, `author`, `input`, `lang`, `section_uri`, `/getConcepts` and the like), the bodies of `POST /getParagraphWithConcept` (typed, but its strings are unbounded) and `POST /getParagraphsWithConcepts` (an untyped dictionary), and the `query` of the playground. Nothing unsafe gets through: the escaping helpers (`sparql_iri` 2,048, `sparql_literal` 1,000, `sparql_lang` 35) and the SPARQL guard (5,000) refuse an over-long value with 400 or 403, `MAX_CRITERIA` caps the concepts, and nginx caps a body at 1 MB. What is missing is an early, uniform 422.
- **P1: OpenTheso failures** come back as empty results (`/thesaurus/autocomplete`) or as a 404 (`/thesaurus/concept`) instead of an explicit 502 or 504 (AGENTS.md rule 9).
- **P2:** error details leaked; the health endpoint exposes the SPARQL URL; no nginx security headers; Google Fonts. Done in P0-4a: CORS credentials disabled by default, `data/*.db` git-ignored.
