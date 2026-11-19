import { useQuery } from '@tanstack/react-query'
import { getConceptCategories } from '../../../api/client'

/**
 * The concept categories and their TheZoo collections, in priority order (RM-CON-01, RM-CON-02).
 * The list changes with the thesaurus, not with the session: it is kept for an hour.
 * Query key root: `conceptCategories`.
 */
export function useConceptCategories() {
  return useQuery({
    queryKey: ['conceptCategories'],
    queryFn: ({ signal }) => getConceptCategories(signal),
    staleTime: 60 * 60_000,
  })
}
