import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { BASE_URL, connectSession, reviewAnnotation } from '../../api/client'
import { createTestQueryClient } from '../../test/queryClient'
import { server } from '../../test/server'
import type { Session } from '../../types'
import { contributionKeys } from '../contributions/queryKeys'
import {
  SESSION_EXPIRED_KEY,
  SESSION_KEY,
  VIEWER_QUERY_ROOTS,
  createSessionBridge,
  resetViewerQueries,
} from './session'

function sessionWith(token: string, id = 1): Session {
  return {
    user: {
      id,
      email: 'ada@example.org',
      display_name: 'Ada',
      affiliation: 'I3S',
      role: 'contributor',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      activated_at: null,
    },
    csrf_token: token,
  }
}

afterEach(() => connectSession(null))

describe('VIEWER_QUERY_ROOTS', () => {
  it('covers the root of every contribution query key (their data carry allowed_actions)', () => {
    const roots = [
      contributionKeys.sectionAnnotations('urn:s', 'fr', false)[0],
      contributionKeys.annotationPage({})[0],
      contributionKeys.proposalPage({})[0],
      contributionKeys.savedQueryPage({})[0],
    ]
    for (const root of roots) expect(VIEWER_QUERY_ROOTS).toContain(root)
  })
})

describe('resetViewerQueries', () => {
  it('drops the data of the viewer queries and keeps the others', async () => {
    const client = createTestQueryClient()
    client.setQueryData(contributionKeys.annotationPage({ mine: true }), { items: [], total: 0 })
    client.setQueryData(contributionKeys.sectionAnnotations('urn:s', 'fr', true), { staged_annotations: [] })
    client.setQueryData(['works'], [{ title: 'Historia' }])
    await resetViewerQueries(client)
    expect(client.getQueryData(contributionKeys.annotationPage({ mine: true }))).toBeUndefined()
    expect(client.getQueryData(contributionKeys.sectionAnnotations('urn:s', 'fr', true))).toBeUndefined()
    expect(client.getQueryData(['works'])).toEqual([{ title: 'Historia' }])
  })
})

describe('session bridge', () => {
  it('reads the CSRF token and the account from the cache, and gives null to a visitor', () => {
    const client = createTestQueryClient()
    const bridge = createSessionBridge(client)
    expect(bridge.csrf()).toBeNull()
    client.setQueryData(SESSION_KEY, sessionWith('abc', 7))
    expect(bridge.csrf()).toEqual({ token: 'abc', userId: 7 })
    client.setQueryData(SESSION_KEY, null)
    expect(bridge.csrf()).toBeNull()
  })

  it('refreshes the token from the server and stores the new session', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('old'))
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(sessionWith('new'))))
    const bridge = createSessionBridge(client)
    await expect(bridge.refreshCsrfToken(1)).resolves.toBe('new')
    expect(client.getQueryData<Session>(SESSION_KEY)?.csrf_token).toBe('new')
  })

  it('gives no token when the refreshed session belongs to another account, and resets the viewer data', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('a-token', 1))
    client.setQueryData(contributionKeys.proposalPage({}), { items: [], total: 0 })
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(sessionWith('b-token', 2))))
    await expect(createSessionBridge(client).refreshCsrfToken(1)).resolves.toBeNull()
    // The cache now holds the other account, and the data computed for the first one is gone.
    expect(client.getQueryData<Session>(SESSION_KEY)?.user.id).toBe(2)
    await Promise.resolve()
    expect(client.getQueryData(contributionKeys.proposalPage({}))).toBeUndefined()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
  })

  it('gives no token and raises the expired flag when a signed-in user finds no session any more', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('old', 1))
    server.use(
      http.get(`${BASE_URL}/auth/me`, () =>
        HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    await expect(createSessionBridge(client).refreshCsrfToken(1)).resolves.toBeNull()
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBe(true)
  })

  it('does not raise the expired flag for a visitor whose refresh finds no session', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, null)
    server.use(
      http.get(`${BASE_URL}/auth/me`, () =>
        HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    await expect(createSessionBridge(client).refreshCsrfToken(1)).resolves.toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
  })

  it('does not resend a write end to end when the cache moved to another account between the send and the 403', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('a-token', 1))
    connectSession(createSessionBridge(client))
    const tokens: Array<string | null> = []
    server.use(
      http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(sessionWith('b-token', 2))),
      http.post(`${BASE_URL}/annotations/2/review`, ({ request }) => {
        tokens.push(request.headers.get('X-CSRF-Token'))
        // A focus refetch answers user 2 while the write is in flight.
        client.setQueryData(SESSION_KEY, sessionWith('b-token', 2))
        return HttpResponse.json({ detail: 'CSRF', code: 'csrf_failed' }, { status: 403 })
      }),
    )
    const error = await reviewAnnotation(2, { version: 1, decision: 'validated' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(tokens).toEqual(['a-token'])
  })

  it('does not resend a write end to end when another account signed in meanwhile', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('a-token', 1))
    connectSession(createSessionBridge(client))
    const tokens: Array<string | null> = []
    server.use(
      http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(sessionWith('b-token', 2))),
      http.post(`${BASE_URL}/annotations/2/review`, ({ request }) => {
        tokens.push(request.headers.get('X-CSRF-Token'))
        return HttpResponse.json({ detail: 'CSRF', code: 'csrf_failed' }, { status: 403 })
      }),
    )
    const error = await reviewAnnotation(2, { version: 1, decision: 'validated' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(tokens).toEqual(['a-token'])
  })

  it('turns the user into a visitor, raises the flag and resets viewer data when the session ended', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('old'))
    client.setQueryData(contributionKeys.proposalPage({}), { items: [], total: 0 })
    createSessionBridge(client).onSessionExpired()
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBe(true)
    await Promise.resolve()
    expect(client.getQueryData(contributionKeys.proposalPage({}))).toBeUndefined()
  })

  it('does not tell a visitor that a session ended', () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, null)
    createSessionBridge(client).onSessionExpired()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
  })

  it('recovers from a stale token end to end: 403 csrf_failed, refresh, retry with the new token', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('stale'))
    connectSession(createSessionBridge(client))
    const tokens: Array<string | null> = []
    server.use(
      http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(sessionWith('current'))),
      http.post(`${BASE_URL}/annotations/2/review`, ({ request }) => {
        const token = request.headers.get('X-CSRF-Token')
        tokens.push(token)
        return token === 'current'
          ? HttpResponse.json({ id: 2 })
          : HttpResponse.json({ detail: 'CSRF', code: 'csrf_failed' }, { status: 403 })
      }),
    )
    await expect(reviewAnnotation(2, { version: 1, decision: 'validated' })).resolves.toEqual({ id: 2 })
    expect(tokens).toEqual(['stale', 'current'])
    expect(client.getQueryData<Session>(SESSION_KEY)?.csrf_token).toBe('current')
  })

  it('marks the session as ended end to end when a write answers 401 not_authenticated', async () => {
    const client = createTestQueryClient()
    client.setQueryData(SESSION_KEY, sessionWith('old'))
    connectSession(createSessionBridge(client))
    server.use(
      http.post(`${BASE_URL}/annotations/2/review`, () =>
        HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    await reviewAnnotation(2, { version: 1, decision: 'validated' }).catch(() => undefined)
    expect(client.getQueryData(SESSION_KEY)).toBeNull()
    expect(client.getQueryData(SESSION_EXPIRED_KEY)).toBe(true)
  })
})
