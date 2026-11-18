import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchThesaurusProposalPage } from '../../../api/client'
import type { ContributionStatus } from '../../../types'
import { contributionKeys } from '../queryKeys'

/** Proposals loaded per request. */
export const PROPOSAL_PAGE_SIZE = 50

/**
 * The proposals of one status (RM-ACC-03, RM-ACC-04), `q` filtering on the server, loaded 50 at
 * a time by offset: `fetchNextPage` adds the next 50. The first page carries the `total` of the
 * filter. Under the `thesaurusProposals` root, so a review, an edit or a sign-in reloads it.
 */
export function useProposalList({ status, q }: { status: ContributionStatus; q: string }) {
  return useInfiniteQuery({
    queryKey: [...contributionKeys.proposalPage({ status, q, limit: PROPOSAL_PAGE_SIZE }), 'infinite'] as const,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchThesaurusProposalPage({ status, q: q || undefined, limit: PROPOSAL_PAGE_SIZE, offset: pageParam }, signal),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })
}
