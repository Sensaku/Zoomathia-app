import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { fetchThesaurusAutocomplete } from '../../../api/client'

/** Fewest characters that trigger a search (the end-to-end stack has no OpenTheso). */
export const MIN_CONCEPT_SEARCH_LENGTH = 2
const DEBOUNCE_MS = 300

/**
 * TheZoo concept suggestions for a typed term. The term is trimmed and debounced (300 ms);
 * nothing is requested below 2 characters. Query key root: `conceptSuggestions`.
 */
export function useConceptSuggestions(term: string) {
  const trimmed = term.trim()
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  // Below the minimum, follow the raw term at once so stale results never show.
  const effective = trimmed.length < MIN_CONCEPT_SEARCH_LENGTH ? trimmed : debounced
  const enabled = effective.length >= MIN_CONCEPT_SEARCH_LENGTH
  return useQuery({
    queryKey: ['conceptSuggestions', effective],
    queryFn: ({ signal }) => fetchThesaurusAutocomplete(effective, signal),
    enabled,
    staleTime: 60_000,
  })
}
