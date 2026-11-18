/**
 * React Query keys of the contribution lists. The first element is the root: the roots listed
 * in `VIEWER_QUERY_ROOTS` (accounts feature) are reset when the signed-in account changes,
 * because their data carry `allowed_actions`.
 */

import type { AnnotationListParams, ProposalListParams, SavedQueryListParams } from '../../types'
import type { ViewerQueryRoot } from '../accounts'

/** Roots that a review, an edit or a deletion of an annotation or a proposal makes stale. */
export const CONTRIBUTION_ROOTS = [
  'sectionAnnotations',
  'annotations',
  'thesaurusProposals',
] as const satisfies readonly ViewerQueryRoot[]

/** Root of the saved-query lists (own mutations by the saved-query screens). */
export const SAVED_QUERIES_ROOT = 'savedQueries' as const satisfies ViewerQueryRoot

/** Key builders, one per list. Params are part of the key: a new filter is a new entry. */
export const contributionKeys = {
  /** Reference and staged annotations of a section; `includePending` is part of the key (RM-ACC-03). */
  sectionAnnotations: (sectionUri: string, lang: string, includePending: boolean) =>
    ['sectionAnnotations', sectionUri, lang, includePending] as const,
  annotationPage: (params: AnnotationListParams) => ['annotations', 'page', params] as const,
  proposalPage: (params: ProposalListParams) => ['thesaurusProposals', 'page', params] as const,
  savedQueryPage: (params: SavedQueryListParams) => [SAVED_QUERIES_ROOT, 'page', params] as const,
}
