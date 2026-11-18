/**
 * Request core of the API client: every call to the backend goes through `requestJson` or
 * `requestBlob`. `client.ts` is the public entry point; import from there.
 *
 * The CSRF token is never kept here: the client asks the session bridge for it on each unsafe
 * request (the token lives in the React Query cache only, see `features/accounts/session.ts`).
 */

import { ApiError } from './errors'

export const BASE_URL = import.meta.env.VITE_API_URL || '/api'

/** Methods that change data: the backend checks the CSRF token on them. */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** A CSRF token and the id of the account it was issued to. */
export interface CsrfCredential {
  token: string
  userId: number
}

/**
 * What the client needs from the session layer. The session layer owns the token and the
 * reaction to an expired session; the client only asks.
 */
export interface SessionBridge {
  /**
   * The CSRF token of the current session and the account it belongs to, or `null` for a
   * visitor. Read when the request is sent: the account is the one the write was decided for.
   */
  csrf: () => CsrfCredential | null
  /**
   * Reloads the session from the server and returns its fresh CSRF token, but only when the
   * refreshed session belongs to exactly `expectedUserId` (the account at send time). `null`
   * (no session, or any other account) means: do not resend.
   */
  refreshCsrfToken: (expectedUserId: number) => Promise<string | null>
  /** Called when a write is refused because the session ended (401 `not_authenticated`). */
  onSessionExpired: () => void
}

let sessionBridge: SessionBridge | null = null

/**
 * Connects the client to the session layer, once at startup. Pass `null` to disconnect (tests).
 */
export function connectSession(bridge: SessionBridge | null): void {
  sessionBridge = bridge
}

/** HTTP method of a request. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Options of one request. `body` is serialized as JSON. */
export interface RequestOptions {
  method?: HttpMethod
  body?: unknown
  signal?: AbortSignal
}

/** Reads `Retry-After` in seconds; the HTTP-date form is ignored (the backend sends seconds). */
function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get('Retry-After')
  if (raw === null || raw.trim() === '') return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

/** Builds the `ApiError` of an unsuccessful response, with the backend `detail` and `code` when the body is JSON. */
async function toApiError(res: Response): Promise<ApiError> {
  const errorBody = await res.text().catch(() => '')
  let detail: unknown
  let code: string | undefined
  try {
    const parsed: unknown = JSON.parse(errorBody)
    if (parsed && typeof parsed === 'object') {
      if ('detail' in parsed) detail = (parsed as { detail: unknown }).detail
      if ('code' in parsed && typeof (parsed as { code: unknown }).code === 'string') {
        code = (parsed as { code: string }).code
      }
    }
  } catch {
    // Non-JSON body (a proxy error page, for example): no structured detail.
  }
  return new ApiError(
    res.status,
    `Erreur API [${res.status}] ${res.statusText}: ${errorBody}`,
    detail,
    code,
    parseRetryAfter(res),
  )
}

function send(path: string, options: RequestOptions, csrfToken: string | null): Promise<Response> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  // Never on GET: the token must not leak into requests that do not need it.
  if (csrfToken && UNSAFE_METHODS.has(method)) headers['X-CSRF-Token'] = csrfToken
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
}

/**
 * Second chance after a 403 `csrf_failed`: the token is stale (the session was renewed in
 * another tab, for example). Refreshes the session and sends the request once more with the
 * new token. Returns the response, or `null` when the session could not be refreshed or is no
 * longer the same account: a write decided on one account's screen must never run as another.
 */
async function retryWithFreshToken(
  bridge: SessionBridge,
  path: string,
  options: RequestOptions,
  expectedUserId: number,
): Promise<Response | null> {
  let token: string | null
  try {
    token = await bridge.refreshCsrfToken(expectedUserId)
  } catch {
    // The refresh failed: the caller reports the original `csrf_failed`.
    return null
  }
  if (token === null) return null
  return send(path, options, token)
}

/**
 * Sends a request and returns the successful response; throws an `ApiError` otherwise.
 *
 * On an unsafe request: 403 `csrf_failed` refreshes the session and retries once (a second
 * failure is thrown, no loop); 401 `not_authenticated` tells the bridge that the session ended.
 * No other 401 does (`invalid_credentials` at login is a wrong password, not an expiry).
 */
async function execute(path: string, options: RequestOptions): Promise<Response> {
  const unsafe = UNSAFE_METHODS.has(options.method ?? 'GET')
  const bridge = sessionBridge
  // The account is recorded at send time: the cache may change before the answer arrives.
  const credential = unsafe && bridge ? bridge.csrf() : null
  let res = await send(path, options, credential?.token ?? null)
  if (res.ok) return res
  let error = await toApiError(res)
  if (unsafe && bridge && credential && error.status === 403 && error.code === 'csrf_failed') {
    const retried = await retryWithFreshToken(bridge, path, options, credential.userId)
    if (retried) {
      res = retried
      if (res.ok) return res
      error = await toApiError(res)
    }
  }
  if (unsafe && bridge && error.status === 401 && error.code === 'not_authenticated') {
    bridge.onSessionExpired()
  }
  throw error
}

/** JSON request. A 204 answer resolves to `undefined`. Throws an `ApiError` on any failure. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await execute(path, options)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Request whose answer is a file (the exports), with the same error handling as `requestJson`. */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const res = await execute(path, options)
  return res.blob()
}

/**
 * Query string of the defined parameters. A boolean is sent as `true` only when it is true:
 * the backend flags (`mine`, `include_pending`) are off by default.
 */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}
