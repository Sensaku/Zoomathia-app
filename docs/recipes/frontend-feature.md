# Recipe: add a frontend feature or page

Examples to copy: `frontend/src/features/accounts/` and `frontend/src/features/contributions/` (P0-5a).

1. **Rules.** Read the rules of the feature in [regles-metier.md](../regles-metier.md) and note their IDs: they go into comments and test names.
2. **API.** Add the calls to `src/api/client.ts`, the public entry of `src/api/` (its request core, `http.ts`, handles the cookie, the CSRF token and the errors), and the types to `src/types/index.ts`. A failure is an `ApiError` with the backend `code`: show it with `getApiErrorMessage(error, t)`.
3. **Folder.** Create `src/features/<domain>/` with `components/`, `hooks/`, `lib/` and an `index.ts` that exports what other code may use. Import another feature only through its `index.ts`.
4. **Data.** Write one React Query hook per read or write, in `hooks/`. A query whose data carry `allowed_actions` uses a root of `VIEWER_QUERY_ROOTS` (`features/accounts/session.ts`), so it reloads when someone signs in or out.
5. **Screens.**
   - Build them from `src/shared/ui/` and the design tokens (no hex colour).
   - Show actions from `allowed_actions`, never from a role check in the interface.
   - Put every text in `src/i18n/` (`types.ts`, `fr.ts`, `en.ts`).
6. **Page.** Add the route in `src/App.tsx`, with an `h1` and `useDocumentTitle`.
7. **Tests.**
   - Vitest next to each component and hook: MSW for the network, queries by role and label, `expectNoAxeViolations`.
   - A Playwright journey in `frontend/e2e/` for a critical path.
8. **Catalogue.** A new shared component goes into `src/catalogue/Catalogue.tsx` in the same change.
9. **Done** when the "Definition of done" of `AGENTS.md` passes.
