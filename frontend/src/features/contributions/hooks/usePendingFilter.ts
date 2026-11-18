import { useSearchParams } from 'react-router-dom'

/** URL parameter of the "show unreviewed" filter. */
const PENDING_PARAM = 'pending'

/**
 * The "show unreviewed contributions" filter (RM-ACC-03), kept in the URL as `pending=1` so a
 * link keeps it. Off by default. Writing keeps every other parameter and replaces the history
 * entry, so the Back button does not step through each toggle.
 */
export function usePendingFilter(): { includePending: boolean; setIncludePending: (value: boolean) => void } {
  const [searchParams, setSearchParams] = useSearchParams()

  const setIncludePending = (value: boolean) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (value) next.set(PENDING_PARAM, '1')
        else next.delete(PENDING_PARAM)
        return next
      },
      { replace: true },
    )
  }

  return { includePending: searchParams.get(PENDING_PARAM) === '1', setIncludePending }
}
