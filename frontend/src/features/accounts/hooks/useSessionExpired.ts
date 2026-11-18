import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SESSION_EXPIRED_KEY, clearSessionExpired } from '../session'

/** What `useSessionExpired` returns. */
export interface UseSessionExpired {
  /** True after a write was refused because the session ended. */
  expired: boolean
  /** Hides the notice. */
  dismiss: () => void
}

/** The "your session ended" flag, set by the session bridge and cleared at login or on dismissal. */
export function useSessionExpired(): UseSessionExpired {
  const queryClient = useQueryClient()
  // A flag in the cache, never fetched: `initialData` and an infinite stale time keep it local.
  const { data } = useQuery<boolean>({
    queryKey: SESSION_EXPIRED_KEY,
    queryFn: () => false,
    initialData: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return { expired: data, dismiss: () => clearSessionExpired(queryClient) }
}
