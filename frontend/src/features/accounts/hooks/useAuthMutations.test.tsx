import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { createTestQueryClient, createWrapper } from '../../../test/queryClient'
import type { Session } from '../../../types'
import { SESSION_EXPIRED_KEY, SESSION_KEY, sessionQueryOptions } from '../session'
import { useChangePassword, useLogin, useLogout, useResetPassword } from './useAuthMutations'

const SESSION: Session = {
  user: {
    id: 9,
    email: 'ada@example.org',
    display_name: 'Ada',
    affiliation: 'I3S',
    role: 'contributor',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    activated_at: null,
  },
  csrf_token: 'tok',
}
const VIEWER_KEY = ['annotations', 'page', {}]
const ME_URL = `${BASE_URL}/auth/me`

/**
 * Starts a `/auth/me` load (a refetch on window focus) whose answer waits until `release` is
 * called, and resolves once the request reached the server.
 */
async function startSlowSessionLoad(client: ReturnType<typeof createTestQueryClient>, answer: () => Response) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const requested = new Promise<void>((resolve) => {
    started = resolve
  })
  server.use(
    http.get(ME_URL, async () => {
      started()
      await gate
      return answer()
    }),
  )
  const load = client.fetchQuery({ ...sessionQueryOptions(client), staleTime: 0 }).catch(() => undefined)
  await requested
  return { release, load }
}

describe('useLogin', () => {
  it('stores the session, clears the expired flag and resets the data of the previous viewer', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_EXPIRED_KEY, true)
    client.setQueryData(VIEWER_KEY, { items: [{ allowed_actions: ['review'] }], total: 1 })
    client.setQueryData(['works'], ['kept'])
    server.use(http.post(`${BASE_URL}/auth/login`, () => HttpResponse.json(SESSION)))
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync({ email: 'ada@example.org', password: 'a long enough password' })
    expect(client.getQueryData(SESSION_KEY)).toEqual(SESSION)
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBe(false)
    expect(client.getQueryData(VIEWER_KEY)).toBeUndefined()
    expect(client.getQueryData(['works'])).toEqual(['kept'])
  })

  it('exposes the backend error and leaves the session alone when the credentials are wrong', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, null)
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_credentials' }, { status: 401 }),
      ),
    )
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper(client) })
    result.current.mutate({ email: 'ada@example.org', password: 'wrong' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 401, code: 'invalid_credentials' })
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
  })
})

describe('a session load already in flight (race with the mutations)', () => {
  it('does not overwrite the session of a login that finished meanwhile', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, null)
    const slow = await startSlowSessionLoad(client, () =>
      HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
    )
    server.use(http.post(`${BASE_URL}/auth/login`, () => HttpResponse.json(SESSION)))
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync({ email: 'ada@example.org', password: 'a long enough password' })
    slow.release()
    await slow.load
    expect(client.getQueryData(SESSION_KEY)).toEqual(SESSION)
  })

  it('does not bring back the session after a logout that finished meanwhile', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, SESSION)
    const slow = await startSlowSessionLoad(client, () => HttpResponse.json(SESSION))
    server.use(http.post(`${BASE_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })))
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync()
    slow.release()
    await slow.load
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
  })
})

describe('useLogout', () => {
  it('turns the session into a visitor and resets the viewer data', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, SESSION)
    client.setQueryData(VIEWER_KEY, { items: [{ allowed_actions: ['review'] }], total: 1 })
    server.use(http.post(`${BASE_URL}/auth/logout`, () => new HttpResponse(null, { status: 204 })))
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync()
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
    expect(client.getQueryData(VIEWER_KEY)).toBeUndefined()
  })

  it('keeps the session when the server fails to log out (the user is still signed in)', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, SESSION)
    server.use(http.post(`${BASE_URL}/auth/logout`, () => HttpResponse.json({ detail: 'x' }, { status: 500 })))
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync().catch(() => undefined)
    expect(client.getQueryData(SESSION_KEY)).toEqual(SESSION)
  })
})

describe('useChangePassword', () => {
  it('exposes 403 invalid_credentials (wrong current password) and keeps the session', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, SESSION)
    server.use(
      http.post(`${BASE_URL}/auth/password`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_credentials' }, { status: 403 }),
      ),
    )
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync({ current_password: 'x', new_password: 'y' }).catch(() => undefined)
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 403, code: 'invalid_credentials' })
    expect(client.getQueryData(SESSION_KEY)).toEqual(SESSION)
  })
})

describe('useResetPassword', () => {
  it('reloads the session afterwards: a reset revokes every session of the account', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, SESSION)
    let meCalls = 0
    server.use(
      http.post(`${BASE_URL}/auth/password-reset`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE_URL}/auth/me`, () => {
        meCalls += 1
        return HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 })
      }),
    )
    const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync({ token: 't', new_password: 'a long enough password' })
    expect(meCalls).toBe(1)
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
  })

  it('exposes 400 invalid_reset_token', async () => {
    const client = createTestQueryClient()
    server.use(
      http.post(`${BASE_URL}/auth/password-reset`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_reset_token' }, { status: 400 }),
      ),
    )
    const { result } = renderHook(() => useResetPassword(), { wrapper: createWrapper(client) })
    await result.current.mutateAsync({ token: 't', new_password: 'x' }).catch(() => undefined)
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 400, code: 'invalid_reset_token' })
  })
})
