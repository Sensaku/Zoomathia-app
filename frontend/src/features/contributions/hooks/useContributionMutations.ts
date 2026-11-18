import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  deleteAnnotation,
  deleteThesaurusProposal,
  reviewAnnotation,
  reviewThesaurusProposal,
  updateAnnotation,
  updateThesaurusProposal,
} from '../../../api/client'
import type { AnnotationUpdateInput, ProposalUpdateInput, ReviewInput } from '../../../types'
import { CONTRIBUTION_ROOTS } from '../queryKeys'

function invalidateContributions(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => CONTRIBUTION_ROOTS.some((root) => root === query.queryKey[0]),
  })
}

/**
 * Reloads the contribution lists. A dialog that ended on a conflict calls it when the user
 * closes it (RM-CTB-05): reloading earlier could remove the item, and its dialog with it.
 */
export function useReloadContributions(): () => Promise<void> {
  const queryClient = useQueryClient()
  return () => invalidateContributions(queryClient)
}

/**
 * A mutation on a contribution. On success, the contribution lists reload (the promise is
 * awaited, so the caller closes its dialog on fresh data). On a failure nothing reloads, a 409
 * `version_conflict` or `not_pending` included: the error stays available and the caller shows
 * `getApiErrorMessage(error, t)`, then calls `useReloadContributions()` when the user closes
 * the message. The bridge of the API client already handles a 401.
 */
function useContributionMutation<Variables, Result>(mutationFn: (variables: Variables) => Promise<Result>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateContributions(queryClient),
  })
}

/** Validates or rejects an annotation (RM-MOD-01 to RM-MOD-03). Variables: `{ id, input }`. */
export function useReviewAnnotation() {
  return useContributionMutation(({ id, input }: { id: number; input: ReviewInput }) => reviewAnnotation(id, input))
}

/** Edits the concept or the justification of a pending annotation (RM-CTB-05). Variables: `{ id, input }`. */
export function useEditAnnotation() {
  return useContributionMutation(({ id, input }: { id: number; input: AnnotationUpdateInput }) =>
    updateAnnotation(id, input),
  )
}

/** Deletes an annotation (RM-CTB-05, RM-MOD-06). Variable: the annotation id. */
export function useDeleteAnnotation() {
  return useContributionMutation((id: number) => deleteAnnotation(id))
}

/** Validates or rejects a term proposal (RM-MOD-01 to RM-MOD-03). Variables: `{ id, input }`. */
export function useReviewProposal() {
  return useContributionMutation(({ id, input }: { id: number; input: ReviewInput }) =>
    reviewThesaurusProposal(id, input),
  )
}

/** Edits any field of a pending proposal (RM-CTB-05). Variables: `{ id, input }`. */
export function useEditProposal() {
  return useContributionMutation(({ id, input }: { id: number; input: ProposalUpdateInput }) =>
    updateThesaurusProposal(id, input),
  )
}

/** Deletes a term proposal (RM-CTB-05, RM-MOD-06). Variable: the proposal id. */
export function useDeleteProposal() {
  return useContributionMutation((id: number) => deleteThesaurusProposal(id))
}
