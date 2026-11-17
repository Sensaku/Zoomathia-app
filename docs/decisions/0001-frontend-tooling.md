# Decision 0001: frontend tooling

- **Date:** 2026-11-16. **Status:** adopted.
- **Source:** [development guidelines](../development-guidelines.md), "Frontend tooling: Vite+", "Tests" and "Adoption" step 1.

## Context

The guidelines decided on 2026-11-15 to use Vite+ (Oxlint, Oxfmt, Vitest), Playwright with axe and TypeDoc, and waited for Node 24 on the maintainer's machine. Node 24.22 and npm 11.19 are now available. The frontend had no lint, no formatter and no test.

## Decisions

### Vite+ installed manually, with npm overrides

`vite-plus` 1.6.0 is a devDependency. The `vite` entry becomes the alias `npm:@voidzero-dev/vite-plus-core@1.6.0`, and `vitest` is pinned to 5.1.0 (the version bundled by Vite+). Both appear in `devDependencies` **and** in `overrides` with the same specification: npm refuses a direct dependency that differs from its override (`EOVERRIDE`). `vite.config.ts` imports `defineConfig` from `vite-plus` and holds the `lint`, `fmt` and `test` blocks. `vp migrate` was not used, so that it could not rewrite agent instructions, editor files or hooks.

All new dependencies use exact versions. Oxfmt is still 0.x (beta since February 2026): its output may change between versions, hence the exact pins.

### The three checks required by the guidelines

| Check | Result |
|---|---|
| Oxfmt status | Beta (0.78.0), Prettier-compatible. Accepted with exact pins. The formatting pass is one commit, so a later output change shows as its own diff. |
| Tailwind class sorting | Built into Oxfmt (`sortTailwindcss`, a port of `prettier-plugin-tailwindcss`). Enabled with `stylesheet: './src/index.css'` (Tailwind v4 entry), in the same pass as the first formatting. |
| `jsx-a11y` coverage | Oxlint has 36 of the 39 rules of `eslint-plugin-jsx-a11y` 6.10.2. The three missing rules (`accessible-emoji`, `label-has-for`, `no-onchange`) are deprecated upstream, so coverage is equivalent. All 36 are set to `error`, including `anchor-ambiguous-text` and `prefer-tag-over-role`, which are upstream rules (6.7+). That is stricter than the upstream strict profile, which leaves `prefer-tag-over-role` off, for example. |

### TypeScript 6 stays the only type checker

`vp check` type-checks with TypeScript 7 (Go) through tsgolint, but the project pins TypeScript `~6.0.2`. So `tsc` stays the type checker (`build` runs `tsc` first), and the lint block sets `typeAware: true, typeCheck: false`: type-aware rules (for example `no-floating-promises`) run, type errors come from `tsc` alone. Revisit when the project moves to TypeScript 7.

Two TypeScript projects: `tsconfig.json` for `src` (browser code) and `tsconfig.node.json` for `vite.config.ts`, `playwright.config.ts` and `e2e/`, with `@types/node` 24.19.2 (approved 2026-11-17). `npm run typecheck` checks both.

**Node globals in `src/`:** TypeScript 6 already defaults `types` to `[]`, so `src` does not see Node globals even though `msw` pulls `@types/node` transitively. A probe using `process.env` in `src/` fails `tsc` with TS2591, with or without an explicit `"types": []`. The setting would change nothing, so it is not added.

### Lint strictness

- `categories: { correctness: 'error' }`: every default correctness rule (for example `react/jsx-key`, `no-debugger`, `typescript/await-thenable`) blocks new code. Confirmed with `vp lint --print-config`.
- `react/exhaustive-deps` is at `error` instead of the upstream `warn`: warnings never block CI, and the legacy override needs the base level at `error`.

### Format options

`singleQuote: true` and `semi: false` match the existing code (all imports use single quotes, almost no semicolons). `printWidth: 120` was chosen over the Oxfmt default: on the existing code it changed about 6.8k lines against about 7.4k at the default width. The first formatting pass touched formatting only; it is committed separately.

### Test stack

- **Vitest** (through `vp test`), `jsdom` environment, explicit imports from `vite-plus/test` (`globals: false`).
- **Testing Library** (`react`, `dom`, `user-event`, `jest-dom`) for components, queried by role and label.
- **MSW** for the network: with `onUnhandledFrame: 'error'` an unhandled request is rejected with an error and logged, so no test reaches the network. `VITE_API_URL` is set to an absolute test URL because Node's `fetch` rejects relative URLs.
- **axe-core** through a small helper (`src/test/axe.ts`, `expectNoAxeViolations`) in component tests. `vitest-axe` (0.1.0) has had no release since 2022 and is not adopted. The helper disables `color-contrast`, which jsdom cannot compute; Playwright checks contrast in a real browser.
- **Playwright** with `@axe-core/playwright` (WCAG 2 A/AA and 2.1 A/AA), Chromium only, against the production build served by `vp preview`. The local stack with the backend and simulated Corese is framed with P0-5a.
- Known defects found by the first tests are written as strict known-failure tests (`it.fails`, as in `tests/test_known_gaps.py` on the backend): the test fails the day the defect is fixed, and the marker is then removed.

### TypeDoc into the documentation site

`typedoc` with `typedoc-plugin-markdown` writes `docs/reference/frontend/`, listed in `mkdocs.yml`. The output is generated and never committed (`.gitignore`). `treatWarningsAsErrors` is on, to match the MkDocs strict build. Run `npm run docs` in `frontend/` before the MkDocs build; the CI `docs` job does it.

### Node 24 everywhere

`frontend/.nvmrc` (`24`) is read by Vite+, nvm and `actions/setup-node`; `engines.node` is `^24.15.0` (the minimum of jsdom 31); the Docker build image is `node:24-alpine`. The lockfile keeps the `@voidzero-dev/vite-plus-linux-x64-musl` optional entry that the Alpine build needs.

### Component catalogue tool: postponed

Owner decision, 2026-11-16: the choice is made again at the start of P0-5a. Storybook 10.6.7 and 11.0.0-beta.3 declare an optional peer `vite-plus` `^0.1.15 || ^0.2.0 (|| ^0.3.0)`, which conflicts with Vite+ 1.6 under npm. Ladle 5.1.1 has had no release since 2025-11-04 and ships its own Vite 6.

### Legacy lint findings

Existing code is not fixed in this change. The rules that fail on existing files are set to `error` for everything, and a `lint.overrides` entry per rule lists the failing files explicitly and downgrades the rule to `warn` (no inline disable, no glob, so new files get the full rules). Each entry is removed as its file is fixed, when the file is next modified (guidelines, "Adoption" step 3). At adoption: 191 findings in 19 files, 0 errors.

| Rule | Findings |
|---|---|
| `eslint/no-unused-vars` | 88 |
| `typescript/no-floating-promises` | 21 |
| `react/exhaustive-deps` | 20 |
| `react/set-state-in-effect` | 18 |
| `jsx-a11y/click-events-have-key-events` | 16 |
| `jsx-a11y/no-static-element-interactions` | 16 |
| `typescript/no-redundant-type-constituents` | 5 |
| `jsx-a11y/no-noninteractive-element-interactions` | 2 |
| `unicorn/no-useless-fallback-in-spread` | 2 |
| `jsx-a11y/label-has-associated-control` | 1 |
| `jsx-a11y/no-autofocus` | 1 |
| `jsx-a11y/no-noninteractive-tabindex` | 1 |

## Consequences

- Lint, format, type check, unit and component tests, build and the end-to-end smoke journeys run in CI (`frontend` and `e2e` jobs).
- The first formatting pass is a large, purely cosmetic diff (`style(frontend): format with oxfmt`).
- Oxfmt output may change on upgrade: review the diff of the `format:check` failure and reformat in a dedicated commit.
- Accessibility defects of existing components are visible as lint warnings and as known-failure tests, not hidden.

## Upgrade procedure for Vite+

`vite-plus`, the `vite` alias and the `vitest` pin move **together**, never separately; dependency bots must not update them one by one.

1. Pick the new `vite-plus` version. Read the `@voidzero-dev/vite-plus-core` version and the bundled Vitest version it ships (`vp toolchain vitest`).
2. In `frontend/package.json`, set in `devDependencies`: `vite-plus`, `vite` (`npm:@voidzero-dev/vite-plus-core@<version>`) and `vitest`; and in `overrides`: `vite` (same alias) and `vitest` (same version).
3. `npm install`, then check `npm ls vite vitest`: one Vite core and one Vitest, and that the lockfile still contains the `linux-x64-musl` optional entry.
4. Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`. If `format:check` fails, reformat in a separate commit.
5. Only then consider moving to TypeScript 7 and `vp check` (see above).
