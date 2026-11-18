import { useQuery } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { ApiError } from '../../../api/errors'
import { createTestQueryClient, createWrapper } from '../../../test/queryClient'
import { server } from '../../../test/server'
import { isContributionConflict } from '../lib/conflict'
import { contributionKeys } from '../queryKeys'
import {
  useDeleteAnnotation,
  useEditProposal,
  useReloadContributions,
  useReviewAnnotation,
} from './useContributionMutations'

const REVIEW = { id: 5, input: { version: 3, decision: 'validated' } } as const

/** A mutation hook next to a list query that counts how many times it loaded. */
function setup<T>(useMutationHook: () => T) {
  const client = createTestQueryClient()
  let listLoads = 0
  const hook = renderHook(
    () => ({
      mutation: useMutationHook(),
      list: useQuery({
        queryKey: contributionKeys.annotationPage({}),
        queryFn: () => {
          listLoads += 1
          return { items: [], total: 0 }
        },
        staleTime: Infinity,
      }),
    }),
    { wrapper: createWrapper(client) },
  )
  return { hook, loads: () => listLoads }
}

function conflict(code: string, status = 409) {
  return HttpResponse.json({ detail: 'English', code }, { status })
}

describe('contribution mutation hooks', () => {
  it('reload the lists after a successful review', async () => {
    server.use(http.post(`${BASE_URL}/annotations/5/review`, () => HttpResponse.json({ id: 5 })))
    const { hook, loads } = setup(useReviewAnnotation)
    await waitFor(() => expect(loads()).toBe(1))
    await hook.result.current.mutation.mutateAsync(REVIEW)
    await waitFor(() => expect(loads()).toBe(2))
  })

  it('RM-CTB-05: on 409 version_conflict, expose the error and do not reload the lists', async () => {
    server.use(http.post(`${BASE_URL}/annotations/5/review`, () => conflict('version_conflict')))
    const { hook, loads } = setup(useReviewAnnotation)
    await waitFor(() => expect(loads()).toBe(1))
    hook.result.current.mutation.mutate(REVIEW)
    await waitFor(() => expect(hook.result.current.mutation.isError).toBe(true))
    const error = hook.result.current.mutation.error
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'version_conflict' })
    // The caller reloads when the user closes the message: a reload now could remove the item.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(loads()).toBe(1)
  })

  it('RM-MOD-02: on 409 not_pending (already reviewed), do not reload the lists either', async () => {
    server.use(http.post(`${BASE_URL}/annotations/5/review`, () => conflict('not_pending')))
    const { hook, loads } = setup(useReviewAnnotation)
    await waitFor(() => expect(loads()).toBe(1))
    hook.result.current.mutation.mutate(REVIEW)
    await waitFor(() => expect(hook.result.current.mutation.isError).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(loads()).toBe(1)
  })

  it('useReloadContributions reloads the contribution lists when called', async () => {
    const { hook, loads } = setup(useReloadContributions)
    await waitFor(() => expect(loads()).toBe(1))
    await hook.result.current.mutation()
    await waitFor(() => expect(loads()).toBe(2))
  })

  it('do not reload the lists after another failure (403 not_author)', async () => {
    server.use(http.post(`${BASE_URL}/annotations/5/review`, () => conflict('not_author', 403)))
    const { hook, loads } = setup(useReviewAnnotation)
    await waitFor(() => expect(loads()).toBe(1))
    hook.result.current.mutation.mutate(REVIEW)
    await waitFor(() => expect(hook.result.current.mutation.isError).toBe(true))
    expect(loads()).toBe(1)
  })

  it('reload the lists after a deletion (204) and after a proposal edit', async () => {
    server.use(
      http.delete(`${BASE_URL}/annotations/5`, () => new HttpResponse(null, { status: 204 })),
      http.patch(`${BASE_URL}/thesaurus/proposals/8`, () => HttpResponse.json({ id: 8 })),
    )
    const removal = setup(useDeleteAnnotation)
    await waitFor(() => expect(removal.loads()).toBe(1))
    await removal.hook.result.current.mutation.mutateAsync(5)
    await waitFor(() => expect(removal.loads()).toBe(2))

    const edit = setup(useEditProposal)
    await waitFor(() => expect(edit.loads()).toBe(1))
    await edit.hook.result.current.mutation.mutateAsync({ id: 8, input: { version: 1, definition: 'new' } })
    await waitFor(() => expect(edit.loads()).toBe(2))
  })
})

describe('isContributionConflict', () => {
  it('recognizes the "changed meanwhile" answers only: 409 and 404 with their codes', () => {
    expect(isContributionConflict(new ApiError(409, 'm', 'd', 'version_conflict'))).toBe(true)
    expect(isContributionConflict(new ApiError(409, 'm', 'd', 'not_pending'))).toBe(true)
    expect(isContributionConflict(new ApiError(409, 'm', 'd', 'validated_contribution'))).toBe(true)
    expect(isContributionConflict(new ApiError(404, 'm', 'd', 'annotation_not_found'))).toBe(true)
    expect(isContributionConflict(new ApiError(404, 'm', 'd', 'proposal_not_found'))).toBe(true)
    expect(isContributionConflict(new ApiError(404, 'm', 'd', 'query_not_found'))).toBe(false)
    expect(isContributionConflict(new ApiError(404, 'm', 'd'))).toBe(false)
    expect(isContributionConflict(new ApiError(403, 'm', 'd', 'validated_contribution'))).toBe(false)
    expect(isContributionConflict(new ApiError(409, 'm', 'd', 'duplicate_proposal'))).toBe(false)
    expect(isContributionConflict(new ApiError(403, 'm', 'd', 'not_pending'))).toBe(false)
    expect(isContributionConflict(new Error('x'))).toBe(false)
  })
})
