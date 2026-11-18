/**
 * Session state of the browser: query keys, the bridge that the API client uses, and the
 * cleanup of data that depends on who is signed in.
 *
 * The session (`Session | null`) lives only in the React Query cache entry `SESSION_KEY`. The
 * CSRF token it carries is never copied to `localStorage`, `sessionStorage` or a module variable.
 */

import type { QueryClient } from '@tanstack/react-query'
import { fetchSession } from '../../api/client'
import type { SessionBridge } from '../../api/client'
import type { Session } from '../../types'

/** Cache key of the session: `Session` for a signed-in user, `null` for a visitor. */
export const SESSION_KEY = ['session'] as const

/** Cache key of the "your session ended" flag (a boolean), cleared at login or when dismissed. */
export const SESSION_EXPIRED_KEY = ['sessionExpired'] as const

/**
 * Roots (first element of the query key) of the queries whose data carry `allowed_actions`.
 * What a viewer may do depends on who is signed in, so these queries are reset at login,
 * logout and session expiry. A new query that returns `allowed_actions` must use one of these
 * roots, or be added here.
 */
export const VIEWER_QUERY_ROOTS = ['sectionAnnotations', 'annotations', 'thesaurusProposals', 'savedQueries'] as const

/** One of the `VIEWER_QUERY_ROOTS`. */
export type ViewerQueryRoot = (typeof VIEWER_QUERY_ROOTS)[number]

function isViewerRoot(root: unknown): boolean {
  return VIEWER_QUERY_ROOTS.some((viewerRoot) => viewerRoot === root)
}

/** Drops the cached data that depends on the viewer and reloads what is on screen. */
export function resetViewerQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.resetQueries({ predicate: (query) => isViewerRoot(query.queryKey[0]) })
}

/** Raises the "session ended" flag. */
export function markSessionExpired(queryClient: QueryClient): void {
  queryClient.setQueryData(SESSION_EXPIRED_KEY, true)
}

/** Lowers the "session ended" flag. */
export function clearSessionExpired(queryClient: QueryClient): void {
  queryClient.setQueryData(SESSION_EXPIRED_KEY, false)
}

/**
 * Loads the session from the server and stores it under `SESSION_KEY`. When the signed-in
 * account is not the one that was cached (login or logout in another tab), the viewer
 * queries are reset: their `allowed_actions` belong to someone else.
 */
export function loadSession(queryClient: QueryClient, signal?: AbortSignal): Promise<Session | null> {
  const previous = queryClient.getQueryData<Session | null>(SESSION_KEY)
  return fetchSession(signal).then((next) => {
    if (previous !== undefined && (previous?.user.id ?? null) !== (next?.user.id ?? null)) {
      void resetViewerQueries(queryClient)
    }
    return next
  })
}

/** Options of the session query: used by `useSession` and by `refreshSession`, so there is one loader. */
export function sessionQueryOptions(queryClient: QueryClient) {
  return {
    queryKey: SESSION_KEY,
    queryFn: ({ signal }: { signal: AbortSignal }) => loadSession(queryClient, signal),
  }
}

/** Reloads the session now, whatever its age, even when no component displays it. */
export function refreshSession(queryClient: QueryClient): Promise<Session | null> {
  return queryClient.fetchQuery({ ...sessionQueryOptions(queryClient), staleTime: 0 })
}

/**
 * Connects the session layer to a query client: the object to pass to `connectSession`.
 * It also keeps the session and expiry entries in the cache while nothing displays them.
 *
 * - `csrf` reads the token and the account id from the cache, when the request is sent;
 * - `refreshCsrfToken(expectedUserId)` reloads the session (the client calls it after a 403
 *   `csrf_failed`) and gives the new token only when the session is exactly that account (the
 *   one at send time, not the one in the cache when the refresh starts: it may have changed in
 *   between). For another account or none it gives `null`, and raises the "session ended" flag
 *   when a user had been signed in;
 * - `onSessionExpired` turns the user into a visitor and raises the flag, only when a user was
 *   signed in: a visitor whose write is refused never had a session to lose.
 */
export function createSessionBridge(queryClient: QueryClient): SessionBridge {
  queryClient.setQueryDefaults(SESSION_KEY, { gcTime: Infinity })
  queryClient.setQueryDefaults(SESSION_EXPIRED_KEY, { gcTime: Infinity })
  return {
    csrf: () => {
      const session = queryClient.getQueryData<Session | null>(SESSION_KEY)
      return session ? { token: session.csrf_token, userId: session.user.id } : null
    },
    refreshCsrfToken: async (expectedUserId) => {
      const hadUser = Boolean(queryClient.getQueryData<Session | null>(SESSION_KEY))
      const session = await refreshSession(queryClient)
      // Only the account of the send may resend: the write was decided on a screen computed for it.
      if (session?.user.id === expectedUserId) return session.csrf_token
      // `onSessionExpired` cannot raise the flag here: the refresh already emptied the cache.
      if (hadUser && !session) markSessionExpired(queryClient)
      return null
    },
    onSessionExpired: () => {
      if (!queryClient.getQueryData<Session | null>(SESSION_KEY)) return
      queryClient.setQueryData(SESSION_KEY, null)
      markSessionExpired(queryClient)
      void resetViewerQueries(queryClient)
    },
  }
}
