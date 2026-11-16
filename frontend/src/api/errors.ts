/**
 * API errors and the user messages that go with them (RM-ACC-02).
 *
 * The heavy features (custom search, SPARQL playground, competency questions, exports) can be
 * refused by the backend guardrails: this module turns those refusals into translated,
 * readable messages.
 */

import type { TranslationDictionary } from '../i18n/types'

/** HTTP error from the backend: carries the status and, when the body is JSON, its `detail` field. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/**
 * Tells whether retrying the request automatically is useless or harmful: a backend refusal
 * (4xx) does not change on retry, and retrying a heavy query that timed out (504) or was
 * refused (429) would add load to the shared SPARQL server.
 */
export function isFinalApiError(error: unknown): boolean {
  return error instanceof ApiError && ((error.status >= 400 && error.status < 500) || error.status === 504)
}

/**
 * Translated message for an API error.
 *
 * 429: too many heavy queries in progress; 422: result too large; 504: the SPARQL server did
 * not answer in time; 502: SPARQL server unreachable or failing; 400 and 403: the backend
 * reason (the SPARQL guard's message) under a translated label. Any other error gets the
 * generic message.
 */
export function getApiErrorMessage(error: unknown, t: TranslationDictionary): string {
  if (!(error instanceof ApiError)) return t.apiErrors.generic
  const detail = typeof error.detail === 'string' ? error.detail.trim() : ''
  switch (error.status) {
    case 429:
      return t.apiErrors.tooManyHeavyQueries
    case 422:
      // FastAPI validation errors (detail as a list) are not a result that is too large.
      return typeof error.detail === 'string' ? t.apiErrors.resultTooLarge : t.apiErrors.generic
    case 504:
      return t.apiErrors.sparqlTimeout
    case 502:
      return t.apiErrors.sparqlUnavailable
    case 400:
    case 403:
      return detail ? `${t.apiErrors.requestRejected} ${detail}` : t.apiErrors.generic
    default:
      return t.apiErrors.generic
  }
}
