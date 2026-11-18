import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { createTestQueryClient, createWrapper } from '../../../test/queryClient'
import type { Session } from '../../../types'
import { SESSION_KEY } from '../session'
import { useSession } from './useSession'

const SESSION: Session = {
  user: {
    id: 4,
    email: 'ada@example.org',
    display_name: 'Ada',
    affiliation: 'I3S',
    role: 'contributor',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    activated_at: '2026-01-02T00:00:00Z',
  },
  csrf_token: 'secret-csrf-token',
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('useSession', () => {
  it('treats a 401 as a visitor, not as an error', async () => {
    server.use(
      http.get(`${BASE_URL}/auth/me`, () =>
        HttpResponse.json({ detail: 'Authentication is required.', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper(createTestQueryClient()) })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toMatchObject({ session: null, user: null, isSignedIn: false, isError: false })
  })

  it('returns the user and keeps the CSRF token in the query cache only', async () => {
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(SESSION)))
    const client = createTestQueryClient()
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper(client) })
    await waitFor(() => expect(result.current.isSignedIn).toBe(true))
    expect(result.current.user).toEqual(SESSION.user)
    expect(result.current.session?.csrf_token).toBe('secret-csrf-token')
    expect(client.getQueryData(SESSION_KEY)).toEqual(SESSION)
    const stored = [localStorage, sessionStorage]
      .flatMap((area) => Object.keys(area).map((key) => area.getItem(key)))
      .join()
    expect(stored).not.toContain('secret-csrf-token')
  })

  it('reports a server error as an error, not as a visitor', async () => {
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json({ detail: 'oops' }, { status: 500 })))
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper(createTestQueryClient()) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isSignedIn).toBe(false)
  })

  it('shows a logout done elsewhere when the session is reloaded, and drops the old account data', async () => {
    let signedIn = true
    server.use(
      http.get(`${BASE_URL}/auth/me`, () =>
        signedIn
          ? HttpResponse.json(SESSION)
          : HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    const client = createTestQueryClient()
    const { result } = renderHook(() => useSession(), { wrapper: createWrapper(client) })
    await waitFor(() => expect(result.current.isSignedIn).toBe(true))
    client.setQueryData(['savedQueries', 'page', {}], { items: [{ allowed_actions: ['delete'] }], total: 1 })
    signedIn = false
    result.current.refetch()
    await waitFor(() => expect(result.current.isSignedIn).toBe(false))
    expect(client.getQueryData(['savedQueries', 'page', {}])).toBeUndefined()
  })
})
