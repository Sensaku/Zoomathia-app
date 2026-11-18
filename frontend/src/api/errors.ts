/**
 * API errors and the user messages that go with them (RM-ACC-02).
 *
 * The backend answers a failure with `{"detail": <English message>, "code": <stable code>}`.
 * The screens never show `detail`: they translate the `code`, then fall back to the status.
 * The heavy features (custom search, SPARQL playground, competency questions, exports) can be
 * refused by the backend guardrails: this module turns those refusals into readable messages.
 */

import type { TranslationDictionary } from '../i18n/types'

type ApiErrorMessages = TranslationDictionary['apiErrors']

/** HTTP error from the backend: carries the status and, when the body is JSON, its `detail` and `code`. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  /** Stable machine-readable code of the backend (`version_conflict`, `csrf_failed`...), when it sent one. */
  readonly code?: string
  /** Seconds to wait, from the `Retry-After` header of a 429 or 503. */
  readonly retryAfter?: number

  constructor(status: number, message: string, detail?: unknown, code?: string, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = code
    this.retryAfter = retryAfter
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

/** Backend code to the `apiErrors` key that says it. A Map, so that a code like `constructor` never matches. */
const CODE_MESSAGES = new Map<string, keyof ApiErrorMessages>([
  ['invalid_credentials', 'invalidCredentials'],
  ['account_pending', 'accountPending'],
  ['account_deactivated', 'accountDeactivated'],
  ['too_many_attempts', 'tooManyAttempts'],
  ['server_busy', 'serverBusy'],
  ['database_busy', 'databaseBusy'],
  ['csrf_failed', 'csrfFailed'],
  ['not_authenticated', 'notAuthenticated'],
  ['invalid_reset_token', 'invalidResetToken'],
  ['invalid_password', 'invalidPassword'],
  ['not_author', 'notAuthor'],
  ['own_contribution', 'ownContribution'],
  ['not_pending', 'notPending'],
  ['version_conflict', 'versionConflict'],
  ['validated_contribution', 'validatedContribution'],
  ['duplicate_proposal', 'duplicateProposal'],
  ['builtin_query', 'builtinQuery'],
  ['annotation_not_found', 'annotationNotFound'],
  ['proposal_not_found', 'proposalNotFound'],
  ['query_not_found', 'queryNotFound'],
  ['too_many_results', 'tooManyResults'],
])

/** Codes whose message says how long to wait: the `...Wait` key holds a `{minutes}` placeholder. */
const WAIT_MESSAGES = new Map<string, keyof ApiErrorMessages>([
  ['too_many_attempts', 'tooManyAttemptsWait'],
  ['server_busy', 'serverBusyWait'],
])

/** Whole minutes to wait for a `Retry-After` in seconds: rounded up, never below one. */
function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60))
}

function messageForCode(error: ApiError, t: TranslationDictionary): string | null {
  const code = error.code
  if (!code) return null
  const waitKey = WAIT_MESSAGES.get(code)
  if (waitKey && error.retryAfter !== undefined) {
    return t.apiErrors[waitKey].replace('{minutes}', String(waitMinutes(error.retryAfter)))
  }
  const key = CODE_MESSAGES.get(code)
  return key ? t.apiErrors[key] : null
}

/**
 * Translated message for an API error.
 *
 * The backend `code` comes first (`too_many_attempts` and `server_busy` say how many minutes
 * to wait when `Retry-After` is known). Without a known code, the status decides. 429: too many
 * heavy queries in progress; 422: result too large, or invalid input when `detail` is a list
 * (FastAPI validation); 504: the SPARQL server did not answer in time; 502: SPARQL server
 * unreachable or failing; 400 and 403: the backend reason (the SPARQL guard's message) under a
 * translated label. Any other error gets the generic message.
 */
export function getApiErrorMessage(error: unknown, t: TranslationDictionary): string {
  if (!(error instanceof ApiError)) return t.apiErrors.generic
  const byCode = messageForCode(error, t)
  if (byCode) return byCode
  const detail = typeof error.detail === 'string' ? error.detail.trim() : ''
  switch (error.status) {
    case 429:
      return t.apiErrors.tooManyHeavyQueries
    case 422:
      // FastAPI validation errors (detail as a list) are not a result that is too large.
      return typeof error.detail === 'string' ? t.apiErrors.resultTooLarge : t.apiErrors.invalidInput
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
