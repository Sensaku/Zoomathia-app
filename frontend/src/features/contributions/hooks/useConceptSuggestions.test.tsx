import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/http'
import { server } from '../../../test/server'
import { createTestQueryClient, createWrapper } from '../../../test/queryClient'
import { useConceptSuggestions } from './useConceptSuggestions'

function track(items = [{ label: 'Lion', uri: 'http://x/1', identifier: '1' }]) {
  const terms: (string | null)[] = []
  server.use(
    http.get(`${BASE_URL}/thesaurus/autocomplete`, ({ request }) => {
      terms.push(new URL(request.url).searchParams.get('q'))
      return HttpResponse.json(items)
    }),
  )
  return terms
}

const wrapper = () => createWrapper(createTestQueryClient())

describe('useConceptSuggestions', () => {
  it('sends no request for fewer than 2 characters', async () => {
    const terms = track()
    const { result } = renderHook(() => useConceptSuggestions(' l '), { wrapper: wrapper() })
    await new Promise((r) => setTimeout(r, 450))
    expect(terms).toEqual([])
    expect(result.current.data).toBeUndefined()
  })

  it('sends one request with the trimmed term after the debounce', async () => {
    const terms = track()
    const { result, rerender } = renderHook(({ term }) => useConceptSuggestions(term), {
      wrapper: wrapper(),
      initialProps: { term: 'li' },
    })
    rerender({ term: 'lio' })
    rerender({ term: ' lion ' })
    expect(terms).toEqual([])
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(terms).toEqual(['lion'])
  })
})
