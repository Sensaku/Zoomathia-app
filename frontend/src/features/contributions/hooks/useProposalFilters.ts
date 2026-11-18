import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ContributionStatus } from '../../../types'
import { isContributionStatus } from '../lib/status'

/** Validated proposals show first: pending ones are hidden by default (RM-ACC-03). */
export const DEFAULT_PROPOSAL_STATUS: ContributionStatus = 'validated'
/** Longest search the backend accepts. */
export const MAX_PROPOSAL_SEARCH_LENGTH = 200
const SEARCH_DEBOUNCE_MS = 300

/**
 * Filters of the proposal list, kept in the URL (`status` and `q`) so a link keeps them. The
 * search text is local while typing and reaches the URL (and the request) after 300 ms. Writes
 * replace the history entry and keep the other parameters.
 */
export function useProposalFilters() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status')
  const status = isContributionStatus(rawStatus) ? rawStatus : DEFAULT_PROPOSAL_STATUS
  const q = (searchParams.get('q') ?? '').slice(0, MAX_PROPOSAL_SEARCH_LENGTH)
  const [search, setSearch] = useState(q)

  const write = useCallback(
    (change: (next: URLSearchParams) => void) =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          change(next)
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  const trimmed = search.trim()
  useEffect(() => {
    if (trimmed === q) return
    const timer = setTimeout(
      () =>
        write((next) => {
          if (trimmed) next.set('q', trimmed)
          else next.delete('q')
        }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [trimmed, q, write])

  const setStatus = (value: ContributionStatus) =>
    write((next) => {
      if (value === DEFAULT_PROPOSAL_STATUS) next.delete('status')
      else next.set('status', value)
    })

  return { status, q, search, setSearch, setStatus }
}
