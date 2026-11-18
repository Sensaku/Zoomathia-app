import { describe, expect, it } from 'vite-plus/test'
import { en, fr } from '../i18n'
import { ApiError, getApiErrorMessage, isFinalApiError } from './errors'

/** Every code of the contract with the backend (P0-5a brief, section 4). */
const CODES = [
  'invalid_credentials',
  'account_pending',
  'account_deactivated',
  'too_many_attempts',
  'server_busy',
  'database_busy',
  'csrf_failed',
  'not_authenticated',
  'invalid_reset_token',
  'invalid_password',
  'not_author',
  'own_contribution',
  'not_pending',
  'version_conflict',
  'validated_contribution',
  'duplicate_proposal',
  'builtin_query',
  'annotation_not_found',
  'proposal_not_found',
  'query_not_found',
  'too_many_results',
]

function error(status: number, code?: string, retryAfter?: number, detail: unknown = 'English detail'): ApiError {
  return new ApiError(status, 'raw', detail, code, retryAfter)
}

describe.each([
  ['fr', fr],
  ['en', en],
])('getApiErrorMessage (%s)', (_name, t) => {
  it.each(CODES)('translates the code %s, never the English detail', (code) => {
    const message = getApiErrorMessage(error(400, code), t)
    expect(message).not.toBe(t.apiErrors.generic)
    expect(message).not.toContain('English detail')
    expect(message).not.toContain('{minutes}')
  })

  it('gives a different message to each code that users must tell apart', () => {
    const messages = new Set(CODES.map((code) => getApiErrorMessage(error(400, code), t)))
    // too_many_attempts and server_busy differ; so do the 409 codes (not_pending, version_conflict).
    expect(messages.size).toBe(CODES.length)
  })

  it('prefers the code over the status (422 invalid_password is not "result too large")', () => {
    expect(getApiErrorMessage(error(422, 'invalid_password'), t)).toBe(t.apiErrors.invalidPassword)
    expect(getApiErrorMessage(error(403, 'csrf_failed'), t)).toBe(t.apiErrors.csrfFailed)
  })

  it('says how long to wait, in minutes rounded up, for too_many_attempts', () => {
    expect(getApiErrorMessage(error(429, 'too_many_attempts', 61), t)).toContain('2')
    expect(getApiErrorMessage(error(429, 'too_many_attempts', 900), t)).toContain('15')
    expect(getApiErrorMessage(error(429, 'too_many_attempts', 900), t)).not.toContain('{minutes}')
  })

  it('waits at least one minute, even for a few seconds', () => {
    expect(getApiErrorMessage(error(429, 'server_busy', 5), t)).toContain('1')
    expect(getApiErrorMessage(error(429, 'server_busy', 5), t)).not.toContain('{minutes}')
  })

  it('gives a message without a delay when Retry-After is unknown', () => {
    expect(getApiErrorMessage(error(429, 'too_many_attempts'), t)).toBe(t.apiErrors.tooManyAttempts)
    expect(getApiErrorMessage(error(429, 'server_busy'), t)).toBe(t.apiErrors.serverBusy)
  })

  it('shows a generic invalid-input message for a FastAPI validation list (422)', () => {
    const message = getApiErrorMessage(error(422, undefined, undefined, [{ loc: ['body'], msg: 'bad' }]), t)
    expect(message).toBe(t.apiErrors.invalidInput)
  })

  it('keeps the status messages for an error without a known code', () => {
    expect(getApiErrorMessage(error(429), t)).toBe(t.apiErrors.tooManyHeavyQueries)
    expect(getApiErrorMessage(error(422), t)).toBe(t.apiErrors.resultTooLarge)
    expect(getApiErrorMessage(error(504), t)).toBe(t.apiErrors.sparqlTimeout)
    expect(getApiErrorMessage(error(502), t)).toBe(t.apiErrors.sparqlUnavailable)
    expect(getApiErrorMessage(error(403, 'admin_required'), t)).toBe(`${t.apiErrors.requestRejected} English detail`)
    expect(getApiErrorMessage(error(500), t)).toBe(t.apiErrors.generic)
  })

  it('does not take a prototype property name for a code', () => {
    expect(getApiErrorMessage(error(500, 'constructor'), t)).toBe(t.apiErrors.generic)
    expect(getApiErrorMessage(error(500, 'toString'), t)).toBe(t.apiErrors.generic)
  })

  it('gives the generic message to anything that is not an ApiError', () => {
    expect(getApiErrorMessage(new Error('boom'), t)).toBe(t.apiErrors.generic)
  })
})

describe('isFinalApiError', () => {
  it('does not retry backend refusals (4xx) and timeouts (504), but retries other failures', () => {
    expect(isFinalApiError(error(409, 'version_conflict'))).toBe(true)
    expect(isFinalApiError(error(504))).toBe(true)
    expect(isFinalApiError(error(503, 'database_busy', 5))).toBe(false)
    expect(isFinalApiError(new Error('network'))).toBe(false)
  })
})
