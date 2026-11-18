# E2E fixtures

Data of the local stack that the Playwright journeys use (`backend-fastapi/tests/e2e/`).

- `accounts.json`: test accounts (`admin`, `alice`, `bruno`, `carol`), seeded as active. `carol` is kept for the password-reset journey. The passwords are test-only.
- `corese.json`: recorded SPARQL results for one fictional work (`Fictus`, _De animalibus_, one book, one chapter of three Latin paragraphs, one reference annotation on "leo").

## Run the stack alone

From `backend-fastapi/`:

```bash
uv run python -m tests.e2e.stack --api-port 3101 --corese-port 3102 --fixtures ../frontend/e2e/fixtures
```

It uses a temporary database, never `data/staging.db`, and a fake Corese. Playwright starts it for you.

## Add a fixture rule

Add `{ "name", "contains", "result" }` to `corese.json`. The first rule whose `contains` substrings all appear in the query (whitespace collapsed) answers, with `result` as SPARQL JSON. Put specific rules first. A query with no rule gets an empty result and a `fake-corese: no fixture for: ...` line on stderr: watch for it.

## Not simulated

OpenTheso is not simulated. A journey must not trigger the concept autocomplete.

## Known quirk

`GET /annotations/section` only looks for staged annotations on the paragraphs that Corese returns. The annotation rule therefore also lists paragraphs 2 and 3 with no label (so no reference annotation), or a pending annotation on them would not show in the reader.
