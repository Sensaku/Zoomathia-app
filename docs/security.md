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

| Guardrail | Proposed value |
|---|---|
| SPARQL timeout (API → Corese) | 30 s |
| Maximum rows returned (enforced `LIMIT`) | 10,000 |
| Maximum response size | 10 MB |
| Concurrent heavy queries per client | 2 |
| Anti-flood throttling per IP (blocks floods only) | 300 requests/min |
| Request body size | 1 MB (TEI uploads: separate limit, 20 MB) |
| Criteria in a custom search | 30 |

- User-supplied SPARQL is **parsed**, not filtered by keywords: only `SELECT` or `ASK`, no `SERVICE`, no Corese extension functions that read files or fetch URLs, `LIMIT` enforced. One validation function serves every endpoint.
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

Fixed so far: injection through request data in the read endpoints, including the user regex of `/searchConcepts` and the incomplete escaping of `/getWorksFromAuthors` and `/customSearch` (P0-1, helpers in `app/shared/sparql.py`).

| Priority | Gap | Rules |
|---|---|---|
| P0 | No authentication or authorization on write endpoints | RM-CTB-01, RM-MOD-01 |
| P0 | Client can set `status` at creation; native QCs can be overwritten with `PUT /queries/{id}` | RM-CTB-04, RM-QC-02 |
| P0 | Turtle injection in `/annotations/export-ttl` and `/thesaurus/proposals/export-ttl` | RM-PUB-01 |
| P0 | Unbounded SPARQL accepted; unlimited search criteria | RM-ACC-02 |
| P0 | `SERVICE` blocked on `/sparql/execute` but accepted on `/download-custom-search-*`; keyword denylist with false positives | RM-ACC-02 |
| P1 | Unbounded caches (SPARQL results, OpenTheso); no maximum length on fields | RM-ACC-02 |
| P1 | CSV export not escaped (Greek `;`, formula injection) | — |
| P1 | OpenTheso URLs built without encoding | — |
| P2 | Error details leaked; health endpoint exposes the SPARQL URL; no nginx security headers; CORS credentials; `--forwarded-allow-ips "*"`; Google Fonts; `staging.db` and `__pycache__` tracked | — |
