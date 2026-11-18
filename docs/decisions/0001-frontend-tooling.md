# Decision 0001: frontend tooling

- **Date:** 2026-11-16. **Status:** adopted.
- **Source:** [development guidelines](../development-guidelines.md), "Frontend tooling: Vite+", "Tests" and "Adoption" step 1.

## Context

On 2026-11-15, the guidelines chose Vite+ (Oxlint, Oxfmt, Vitest), Playwright with axe and TypeDoc, to be installed once the maintainer had Node 24 (now 24.22, with npm 11.19). The frontend had no lint, no formatter and no test.

## Decisions

- **Vite+ 1.6.0, installed by hand.** `vite` becomes the alias `npm:@voidzero-dev/vite-plus-core@1.6.0`, and `vitest` is pinned to 5.1.0, the version bundled by Vite+. Both appear in `devDependencies` **and** in `overrides`, with the same specification, or npm refuses the install (`EOVERRIDE`). `vite.config.ts` imports `defineConfig` from `vite-plus` and holds the `lint`, `fmt` and `test` blocks. `vp migrate` was not used: it can rewrite agent instructions, editor files and hooks.
- **Exact versions** for every new dependency: Oxfmt is still 0.x (beta, 0.78.0), and its output may change between versions.
- **`tsc` stays the only type checker.** `vp check` type-checks with TypeScript 7, but the project pins TypeScript `~6.0.2`. The lint runs the type-aware rules (`typeAware: true`, for example `no-floating-promises`) without type checking (`typeCheck: false`), and `build` runs `tsc` first. Revisit with TypeScript 7.
- **Two TypeScript projects**, both checked by `npm run typecheck`: `tsconfig.json` for `src`, and `tsconfig.node.json` for `vite.config.ts`, `playwright.config.ts` and `e2e/`, with `@types/node` 24.19.2 (approved 2026-11-17). TypeScript 6 already defaults `types` to `[]`, so `src` does not see Node globals even though `msw` pulls in `@types/node`.
- **Lint strictness:**
  - every default correctness rule (for example `react/jsx-key`, `no-debugger`, `typescript/await-thenable`) is an error for new code (`categories: { correctness: 'error' }`);
  - Oxlint has 36 of the 39 rules of `eslint-plugin-jsx-a11y` 6.10.2 (the 3 missing ones are deprecated upstream), all at `error`: stricter than the upstream strict profile;
  - `react/exhaustive-deps` is at `error`, not the upstream `warn`: warnings never block CI.
- **Format:** `singleQuote: true` and `semi: false`, like the existing code; `printWidth: 120`, which changes the fewest lines of the existing code; Tailwind class sorting built into Oxfmt (`sortTailwindcss`, with `stylesheet: './src/index.css'`). The first formatting pass is its own commit and changes formatting only.
- **Tests:**
  - Vitest (`vp test`) with `jsdom` and explicit imports from `vite-plus/test` (`globals: false`); Testing Library (`react`, `dom`, `user-event`, `jest-dom`), querying by role and label.
  - MSW with `onUnhandledFrame: 'error'`: an unhandled request is rejected and logged, so no test reaches the network. `VITE_API_URL` is an absolute test URL, because Node's `fetch` rejects relative URLs.
  - axe-core in component tests, through `expectNoAxeViolations` (`src/test/axe.ts`), without `color-contrast`, which jsdom cannot compute. `vitest-axe` (no release since 2022) is not adopted.
  - Playwright with `@axe-core/playwright` (WCAG 2 A/AA and 2.1 A/AA), Chromium only, against the production build served by `vp preview`; it checks contrast in a real browser. The local stack with the backend and a simulated Corese is planned with P0-5a.
  - A known defect is a strict known-failure test (`it.fails`, like `tests/test_known_gaps.py` in the backend): the test fails the day the defect is fixed, and the marker is then removed.
- **TypeDoc** with `typedoc-plugin-markdown` writes `docs/reference/frontend/`, listed in `mkdocs.yml`, generated and never committed. `treatWarningsAsErrors` is on, like the strict MkDocs build. The CI `docs` job runs `npm run docs` before the site build.
- **Node 24 everywhere:** `frontend/.nvmrc` (`24`), read by Vite+, nvm and `actions/setup-node`; `engines.node` `^24.15.0`, the minimum of jsdom 31; the Docker build image `node:24-alpine`, for which the lockfile keeps the optional `@voidzero-dev/vite-plus-linux-x64-musl` entry.
- **Component catalogue tool: postponed** to the start of P0-5a (owner decision, 2026-11-16). Storybook (10.6 and 11.0 beta) declares a `vite-plus` peer limited to 0.x, which conflicts with Vite+ 1.6 under npm. Ladle has had no release since 2025-11-04 and ships its own Vite 6.
- **Legacy lint findings** are not fixed in this change. A rule that fails on existing files stays at `error`, and one `lint.overrides` entry per rule lists those files one by one at `warn`: no inline disable, no glob, so new files get the full rules. An entry is removed when its file is fixed, the next time the file is modified (guidelines, "Adoption" step 3). At adoption: 191 findings in 19 files, 0 errors; the list is in `vite.config.ts`.

## Consequences

- CI runs lint, format, type check, unit and component tests, build and the end-to-end smoke journeys (`frontend` and `e2e` jobs).
- An Oxfmt upgrade may change its output: check the `format:check` diff and reformat in a dedicated commit.
- Accessibility defects of existing components stay visible, as lint warnings and known-failure tests.

## Upgrade procedure for Vite+

`vite-plus`, the `vite` alias and the `vitest` pin always move **together**; dependency bots must never update them one by one.

1. Pick the new `vite-plus` version. Note the `@voidzero-dev/vite-plus-core` version and the Vitest version it bundles (`vp toolchain vitest`).
2. In `frontend/package.json`, set `vite-plus`, `vite` (`npm:@voidzero-dev/vite-plus-core@<version>`) and `vitest` in `devDependencies`, and `vite` (same alias) and `vitest` (same version) in `overrides`.
3. Run `npm install`, then `npm ls vite vitest`: there must be one Vite core and one Vitest. Check that the lockfile still has the `linux-x64-musl` optional entry.
4. Run `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run test`, `npm run build` and `npm run test:e2e`. If `format:check` fails, reformat in a separate commit.
5. Only then consider TypeScript 7 and `vp check` (see above).
