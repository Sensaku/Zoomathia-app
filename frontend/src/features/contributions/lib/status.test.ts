import { describe, expect, it } from 'vite-plus/test'
import { en, fr } from '../../../i18n'
import { CONTRIBUTION_STATUSES, isContributionStatus } from './status'

describe('contribution statuses (RM-MOD-01: codes, never French labels)', () => {
  it('lists the three status codes', () => {
    expect([...CONTRIBUTION_STATUSES]).toEqual(['pending', 'validated', 'rejected'])
  })

  it('has a label in French and in English for every status', () => {
    for (const status of CONTRIBUTION_STATUSES) {
      expect(fr.contributions.status[status]).toBeTruthy()
      expect(en.contributions.status[status]).toBeTruthy()
    }
    expect(fr.contributions.status.pending).toBe('Non relu')
    expect(en.contributions.status.pending).toBe('Not reviewed')
  })

  it('accepts a status code and refuses a French label or any other value', () => {
    expect(isContributionStatus('rejected')).toBe(true)
    expect(isContributionStatus('Rejeté')).toBe(false)
    expect(isContributionStatus('En attente de validation')).toBe(false)
    expect(isContributionStatus(null)).toBe(false)
  })
})
