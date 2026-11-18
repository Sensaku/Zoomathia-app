# Decision 0002: component catalogue and end-to-end stack

- **Date:** 2026-11-18. **Status:** adopted (owner decisions at the start of P0-5a).
- **Source:** [decision record 0001](0001-frontend-tooling.md), which postponed both choices to P0-5a.

## Component catalogue

**Context.** The design system has no mockups, so the catalogue is the visual reference. Two tools were ruled out:

- Storybook 10.6.7 and 11.0 beta 3 still declare a `vite-plus` peer limited to 0.1 to 0.3, which conflicts with Vite+ 1.6 under npm.
- Ladle has had no release since 2025-11-04 and ships its own Vite 6.

**Decision.** An in-house page, with no dependency:

- `frontend/catalogue.html`, served by `npm run dev` at `/catalogue.html`;
- it shows the colour tokens and every component of `src/shared/ui/` in its states;
- the production build leaves it out;
- a Vitest test renders it and runs axe.

**Consequences.**

- There is no controls panel and no visual testing as in Storybook.
- A new shared component enters the catalogue in the same change.
- Look at Storybook again once it supports Vite+ 1.x.

## End-to-end stack

**Context.** The critical journeys (sign-in, review, password reset) need the real API: session cookie, CSRF token, statuses and error codes.

**Decision.**

- Playwright starts the backend through `backend-fastapi/tests/e2e/` (`uv run python -m tests.e2e.stack`). The stack has:
  - a temporary SQLite database, migrated by Alembic;
  - seeded test accounts;
  - a fake Corese (Python standard library) that answers recorded SPARQL results;
  - uvicorn on port 3101.
- The stack refuses to start if its database is not the temporary one: it never uses `data/staging.db`.
- `vp preview` relays `/api` to that port (`API_PROXY_TARGET`).
- Playwright never reuses a running server, and runs one worker: the journeys share one database.
- Test data lives in `frontend/e2e/fixtures/`: accounts and SPARQL results.
- OpenTheso is not simulated, so no journey uses the concept autocomplete.
- The CI e2e job installs uv and the backend before Playwright.

**Consequences.**

- `npm run test:e2e` needs uv and Python, as well as Node.
- A journey that opens a new page may need a new SPARQL fixture. The fake Corese logs every query it cannot answer.
