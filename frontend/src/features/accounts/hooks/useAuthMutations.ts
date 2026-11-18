import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { changePassword, login, logout, resetPassword } from '../../../api/client'
import { SESSION_KEY, clearSessionExpired, refreshSession, resetViewerQueries } from '../session'

function noop(): void {}

/**
 * Cancels a session load that is already running, so that its late answer (a refetch on window
 * focus started before the mutation) cannot overwrite the session that the mutation just set.
 */
function cancelSessionLoad(queryClient: QueryClient): Promise<void> {
  return queryClient.cancelQueries({ queryKey: SESSION_KEY })
}

/**
 * Signs in. On success the session replaces the cached one, the "session ended" notice goes
 * away and the data that depends on the viewer is reloaded for the new account.
 */
export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onMutate: () => cancelSessionLoad(queryClient),
    onSuccess: (session) => {
      queryClient.setQueryData(SESSION_KEY, session)
      clearSessionExpired(queryClient)
      void resetViewerQueries(queryClient)
    },
  })
}

/** Signs out. On success the visitor state replaces the session and the viewer data is dropped. */
export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    onMutate: () => cancelSessionLoad(queryClient),
    onSuccess: () => {
      queryClient.setQueryData(SESSION_KEY, null)
      void resetViewerQueries(queryClient)
    },
  })
}

/** Changes the password of the signed-in account. The current session stays open (the others close). */
export function useChangePassword() {
  return useMutation({ mutationFn: changePassword })
}

/**
 * Sets a new password with an administrator's token. Every session of the account is revoked,
 * so the session is reloaded: a user signed in here becomes a visitor. A failed reload does not
 * turn the successful reset into an error.
 */
export function useResetPassword() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: resetPassword,
    // The reset itself succeeded: if the reload fails, the next 401 on a write ends the session anyway.
    onSuccess: () => refreshSession(queryClient).then(noop, noop),
  })
}
