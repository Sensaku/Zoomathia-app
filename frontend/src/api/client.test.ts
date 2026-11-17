import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { server } from '../test/server'
import { ApiError, BASE_URL, fetchAuthors } from './client'

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
  })

  it('returns the parsed body on success', async () => {
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([{ name: 'Pliny' }])))
    await expect(fetchAuthors()).resolves.toEqual([{ name: 'Pliny' }])
  })
})
