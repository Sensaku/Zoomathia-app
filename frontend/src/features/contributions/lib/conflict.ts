import { ApiError } from '../../../api/errors'

/** 409 codes that mean the contribution is no longer as the user saw it. */
const CONFLICT_409_CODES = new Set(['version_conflict', 'not_pending', 'validated_contribution'])

/** 404 codes that mean it was deleted meanwhile. */
const GONE_404_CODES = new Set(['annotation_not_found', 'proposal_not_found'])

/**
 * Tells whether an error means "this contribution changed since you loaded it": 409
 * `version_conflict` (edited or reviewed meanwhile), `not_pending` (already reviewed) or
 * `validated_contribution` (a peer validated it before a deletion), or 404
 * `annotation_not_found` / `proposal_not_found` (deleted meanwhile). The screen reloads and
 * shows the translated message (`getApiErrorMessage`).
 */
export function isContributionConflict(error: unknown): error is ApiError {
  if (!(error instanceof ApiError) || error.code === undefined) return false
  if (error.status === 409) return CONFLICT_409_CODES.has(error.code)
  return error.status === 404 && GONE_404_CODES.has(error.code)
}
