import type { ContributionStatus } from '../../../types'

/** Every review status, in the order the screens list them. Labels: i18n `contributions.status.*`. */
export const CONTRIBUTION_STATUSES: readonly ContributionStatus[] = ['pending', 'validated', 'rejected']

/** Narrows a raw value (a URL parameter, for example) to a status code. */
export function isContributionStatus(value: unknown): value is ContributionStatus {
  return CONTRIBUTION_STATUSES.some((status) => status === value)
}
