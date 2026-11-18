import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session, SessionUser } from '../../../types'
import { sessionQueryOptions } from '../session'

/** How long a loaded session counts as fresh: several components may ask for it at once. */
const SESSION_STALE_MS = 30_000

/** What `useSession` returns. */
export interface UseSession {
  /** The session (user and CSRF token), or `null` for a visitor and while loading. */
  session: Session | null
  /** The signed-in account, or `null`. */
  user: SessionUser | null
  isSignedIn: boolean
  /** True until the first answer of the server: do not show "Sign in" yet. */
  isLoading: boolean
  /** True when the last load failed for another reason than "not signed in" (5xx, network). */
  isError: boolean
  refetch: () => void
}

/**
 * The current session. A 401 is a visitor, not an error. The session is reloaded when the
 * window regains focus, so that a logout in another tab shows up.
 */
export function useSession(): UseSession {
  const queryClient = useQueryClient()
  const query = useQuery<Session | null>({
    ...sessionQueryOptions(queryClient),
    staleTime: SESSION_STALE_MS,
    gcTime: Infinity,
    refetchOnWindowFocus: true,
  })
  const session = query.data ?? null
  return {
    session,
    user: session?.user ?? null,
    isSignedIn: session !== null,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: () => {
      void query.refetch()
    },
  }
}
