import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { server } from '../test/server'
import {
  ApiError,
  BASE_URL,
  connectSession,
  deleteAnnotation,
  downloadCustomSearch,
  downloadQC,
  fetchAuthors,
  fetchSectionAnnotations,
  fetchSession,
  login,
  logout,
  reviewAnnotation,
  updateAnnotation,
  updateSavedQuery,
} from './client'
import type { SessionBridge } from './client'

const SESSION_BODY = { user: { id: 1 }, csrf_token: 'fresh' }
const REVIEW = { version: 1, decision: 'validated' } as const
const CSRF_FAILED = { detail: 'The CSRF token is missing or wrong.', code: 'csrf_failed' }
const NOT_AUTHENTICATED = { detail: 'Authentication is required.', code: 'not_authenticated' }

function bridge(overrides: Partial<SessionBridge> = {}): SessionBridge {
  return {
    csrf: () => ({ token: 'old', userId: 1 }),
    refreshCsrfToken: vi.fn(async () => 'fresh'),
    onSessionExpired: vi.fn(),
    ...overrides,
  }
}

interface Call {
  csrf: string | null
  contentType: string | null
}

/** Answers `POST path` with `respond(callNumber)` and records what the backend received. */
function recordPost(path: string, respond: (call: number) => Response): Call[] {
  const calls: Call[] = []
  server.use(
    http.post(`${BASE_URL}${path}`, ({ request }) => {
      calls.push({
        csrf: request.headers.get('X-CSRF-Token'),
        contentType: request.headers.get('Content-Type'),
      })
      return respond(calls.length)
    }),
  )
  return calls
}

afterEach(() => connectSession(null))

describe('API client failures (AGENTS.md rule 9: never an empty success)', () => {
  it('rejects with an ApiError that carries the status and the JSON detail', async () => {
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json({ detail: 'Corese down' }, { status: 502 })))
    const error = await fetchAuthors().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, detail: 'Corese down' })
  })

  it('rejects on a non-JSON error body (proxy error page) without a detail', async () => {
    server.use(http.get(`${BASE_URL}/getAuthors`, () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })))
    const error = await fetchAuthors().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).detail).toBeUndefined()
    expect((error as ApiError).code).toBeUndefined()
  })

  it('returns the parsed body on success', async () => {
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([{ name: 'Pliny' }])))
    await expect(fetchAuthors()).resolves.toEqual([{ name: 'Pliny' }])
  })

  it('keeps the backend code and the Retry-After seconds on the ApiError', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json(
          { detail: 'Too many attempts: try again later.', code: 'too_many_attempts' },
          { status: 429, headers: { 'Retry-After': '120' } },
        ),
      ),
    )
    const error = await login({ email: 'a@b.fr', password: 'x' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 429, code: 'too_many_attempts', retryAfter: 120 })
  })

  it('ignores a Retry-After that is not a number of seconds', async () => {
    server.use(
      http.get(`${BASE_URL}/getAuthors`, () =>
        HttpResponse.json(
          { detail: 'busy' },
          { status: 503, headers: { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' } },
        ),
      ),
    )
    const error = await fetchAuthors().catch((e: unknown) => e)
    expect((error as ApiError).retryAfter).toBeUndefined()
  })

  it('keeps a FastAPI validation list as detail, without a code', async () => {
    server.use(
      http.post(`${BASE_URL}/annotations/1/review`, () =>
        HttpResponse.json({ detail: [{ loc: ['body'], msg: 'bad' }] }, { status: 422 }),
      ),
    )
    const error = await reviewAnnotation(1, REVIEW).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 422, code: undefined })
    expect(Array.isArray((error as ApiError).detail)).toBe(true)
  })
})

describe('request core (RM-CTB-03: the server decides; CSRF on unsafe methods only)', () => {
  it('sends the CSRF token on POST, PUT, PATCH and DELETE', async () => {
    connectSession(bridge())
    const seen: Record<string, string | null> = {}
    const remember = (method: string, request: Request) => {
      seen[method] = request.headers.get('X-CSRF-Token')
    }
    server.use(
      http.post(`${BASE_URL}/annotations/1/review`, ({ request }) => {
        remember('POST', request)
        return HttpResponse.json({})
      }),
      http.put(`${BASE_URL}/queries/1`, ({ request }) => {
        remember('PUT', request)
        return HttpResponse.json({})
      }),
      http.patch(`${BASE_URL}/annotations/1`, ({ request }) => {
        remember('PATCH', request)
        return HttpResponse.json({})
      }),
      http.delete(`${BASE_URL}/annotations/1`, ({ request }) => {
        remember('DELETE', request)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await reviewAnnotation(1, REVIEW)
    await updateSavedQuery(1, { title: 'A title' })
    await updateAnnotation(1, { version: 1, justification: 'x' })
    await deleteAnnotation(1)
    expect(seen).toEqual({ POST: 'old', PUT: 'old', PATCH: 'old', DELETE: 'old' })
  })

  it('never sends the CSRF token on a GET, even when the session has one', async () => {
    connectSession(bridge())
    let received: string | null = 'unset'
    server.use(
      http.get(`${BASE_URL}/getAuthors`, ({ request }) => {
        received = request.headers.get('X-CSRF-Token')
        return HttpResponse.json([])
      }),
    )
    await fetchAuthors()
    expect(received).toBeNull()
  })

  it('sends no CSRF header for a visitor (no token)', async () => {
    connectSession(bridge({ csrf: () => null }))
    const calls = recordPost('/auth/login', () => HttpResponse.json(SESSION_BODY))
    await login({ email: 'a@b.fr', password: 'x' })
    expect(calls[0].csrf).toBeNull()
  })

  it('sends cookies for the same origin only', async () => {
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([])))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await fetchAuthors()
      expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ credentials: 'same-origin' }))
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('sends a JSON body with its content type', async () => {
    const calls = recordPost('/auth/login', () => HttpResponse.json(SESSION_BODY))
    await login({ email: 'a@b.fr', password: 'x' })
    expect(calls[0].contentType).toBe('application/json')
  })

  it('sends no content type when there is no body', async () => {
    connectSession(bridge())
    const calls = recordPost('/auth/logout', () => new HttpResponse(null, { status: 204 }))
    await logout()
    expect(calls[0]).toMatchObject({ contentType: null, csrf: 'old' })
  })

  it('resolves a 204 to undefined', async () => {
    server.use(http.delete(`${BASE_URL}/annotations/3`, () => new HttpResponse(null, { status: 204 })))
    await expect(deleteAnnotation(3)).resolves.toBeUndefined()
  })

  it('sends only the fields of an annotation edit (RM-CTB-05: no status, no author)', async () => {
    let body: unknown
    server.use(
      http.patch(`${BASE_URL}/annotations/3`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({})
      }),
    )
    await updateAnnotation(3, { version: 2, justification: null })
    expect(body).toEqual({ version: 2, justification: null })
  })

  it('asks the section route for pending annotations only when includePending is true (RM-ACC-03)', async () => {
    const urls: string[] = []
    server.use(
      http.get(`${BASE_URL}/annotations/section`, ({ request }) => {
        urls.push(request.url)
        return HttpResponse.json({})
      }),
    )
    await fetchSectionAnnotations('urn:s', 'fr')
    await fetchSectionAnnotations('urn:s', 'fr', { includePending: true })
    expect(new URL(urls[0]).searchParams.has('include_pending')).toBe(false)
    expect(new URL(urls[1]).searchParams.get('include_pending')).toBe('true')
  })
})

describe('CSRF failure: refresh once, retry once (no loop)', () => {
  it('retries the request once with the refreshed token after 403 csrf_failed', async () => {
    const session = bridge()
    connectSession(session)
    const calls = recordPost('/annotations/1/review', (call) =>
      call === 1 ? HttpResponse.json(CSRF_FAILED, { status: 403 }) : HttpResponse.json({ id: 1 }),
    )
    await expect(reviewAnnotation(1, REVIEW)).resolves.toEqual({ id: 1 })
    expect(calls.map((c) => c.csrf)).toEqual(['old', 'fresh'])
    expect(session.refreshCsrfToken).toHaveBeenCalledTimes(1)
    // The account recorded at send time is what the refresh must match.
    expect(session.refreshCsrfToken).toHaveBeenCalledWith(1)
  })

  it('throws the second csrf_failed instead of looping', async () => {
    const session = bridge()
    connectSession(session)
    const calls = recordPost('/annotations/1/review', () => HttpResponse.json(CSRF_FAILED, { status: 403 }))
    const error = await reviewAnnotation(1, REVIEW).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(calls).toHaveLength(2)
    expect(session.refreshCsrfToken).toHaveBeenCalledTimes(1)
  })

  it('throws the original csrf_failed when the session cannot be refreshed', async () => {
    connectSession(bridge({ refreshCsrfToken: vi.fn().mockRejectedValue(new Error('down')) }))
    const calls = recordPost('/annotations/1/review', () => HttpResponse.json(CSRF_FAILED, { status: 403 }))
    const error = await reviewAnnotation(1, REVIEW).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(calls).toHaveLength(1)
  })

  it('does not resend the write when the refresh finds no same-account session (another account or none)', async () => {
    const session = bridge({ refreshCsrfToken: vi.fn(async () => null) })
    connectSession(session)
    const calls = recordPost('/annotations/1/review', () => HttpResponse.json(CSRF_FAILED, { status: 403 }))
    const error = await reviewAnnotation(1, REVIEW).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(calls).toHaveLength(1)
    expect(session.refreshCsrfToken).toHaveBeenCalledTimes(1)
  })

  it('never refreshes nor resends for a visitor, who has no account to check', async () => {
    const session = bridge({ csrf: () => null })
    connectSession(session)
    const calls = recordPost('/annotations/1/review', () => HttpResponse.json(CSRF_FAILED, { status: 403 }))
    await expect(reviewAnnotation(1, REVIEW)).rejects.toMatchObject({ status: 403, code: 'csrf_failed' })
    expect(calls).toHaveLength(1)
    expect(session.refreshCsrfToken).not.toHaveBeenCalled()
  })

  it('does not retry another 403 (not_author)', async () => {
    const session = bridge()
    connectSession(session)
    const calls = recordPost('/annotations/1/review', () =>
      HttpResponse.json({ detail: 'no', code: 'not_author' }, { status: 403 }),
    )
    await reviewAnnotation(1, REVIEW).catch(() => undefined)
    expect(calls).toHaveLength(1)
    expect(session.refreshCsrfToken).not.toHaveBeenCalled()
  })

  it('does not retry a GET', async () => {
    const session = bridge()
    connectSession(session)
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json(CSRF_FAILED, { status: 403 })))
    await fetchAuthors().catch(() => undefined)
    expect(session.refreshCsrfToken).not.toHaveBeenCalled()
  })

  it('reports an ended session when the retry is answered 401 not_authenticated', async () => {
    const session = bridge()
    connectSession(session)
    recordPost('/annotations/1/review', (call) =>
      call === 1
        ? HttpResponse.json(CSRF_FAILED, { status: 403 })
        : HttpResponse.json(NOT_AUTHENTICATED, { status: 401 }),
    )
    await reviewAnnotation(1, REVIEW).catch(() => undefined)
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1)
  })
})

describe('session expiry', () => {
  it('calls onSessionExpired on a write refused with 401 not_authenticated, then throws', async () => {
    const session = bridge()
    connectSession(session)
    recordPost('/annotations/1/review', () => HttpResponse.json(NOT_AUTHENTICATED, { status: 401 }))
    const error = await reviewAnnotation(1, REVIEW).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 401, code: 'not_authenticated' })
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('does not call onSessionExpired for 401 invalid_credentials at login', async () => {
    const session = bridge()
    connectSession(session)
    recordPost('/auth/login', () => HttpResponse.json({ detail: 'bad', code: 'invalid_credentials' }, { status: 401 }))
    const error = await login({ email: 'a@b.fr', password: 'x' }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 401, code: 'invalid_credentials' })
    expect(session.onSessionExpired).not.toHaveBeenCalled()
  })

  it('does not call onSessionExpired for a 401 on a read', async () => {
    const session = bridge()
    connectSession(session)
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json(NOT_AUTHENTICATED, { status: 401 })))
    await fetchAuthors().catch(() => undefined)
    expect(session.onSessionExpired).not.toHaveBeenCalled()
  })
})

describe('fetchSession', () => {
  it('resolves to null for a visitor (401)', async () => {
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(NOT_AUTHENTICATED, { status: 401 })))
    await expect(fetchSession()).resolves.toBeNull()
  })

  it('returns the user and the CSRF token', async () => {
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json(SESSION_BODY)))
    await expect(fetchSession()).resolves.toEqual(SESSION_BODY)
  })

  it('throws a server error instead of treating it as a visitor', async () => {
    server.use(http.get(`${BASE_URL}/auth/me`, () => HttpResponse.json({ detail: 'oops' }, { status: 500 })))
    await expect(fetchSession()).rejects.toMatchObject({ status: 500 })
  })
})

describe('file downloads share the error handling', () => {
  it('throws an ApiError with the code when an export is refused', async () => {
    server.use(
      http.get(`${BASE_URL}/download-qc-csv`, () =>
        HttpResponse.json({ detail: 'big', code: 'too_many_results' }, { status: 422 }),
      ),
    )
    const error = await downloadQC(1, 'csv').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 422, code: 'too_many_results' })
  })

  it('returns the file as a Blob, and sends the CSRF token on a POST export', async () => {
    connectSession(bridge())
    const calls = recordPost('/download-custom-search-csv', () => new HttpResponse('a,b\n1,2', { status: 200 }))
    const blob = await downloadCustomSearch({}, 'csv')
    expect(await blob.text()).toBe('a,b\n1,2')
    expect(calls[0].csrf).toBe('old')
  })
})
