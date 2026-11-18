import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { ContributorLine, type ContributorFields } from './ContributorLine'
import { renderWithProviders } from './renderWithProviders'

const ada = { id: 1, display_name: 'Ada Lovelace', affiliation: 'Université Côte d’Azur' }
const bob = { id: 2, display_name: 'Bob Martin', affiliation: 'CNRS' }

const pending: ContributorFields = {
  author: ada,
  author_label: null,
  created_at: '2026-11-10T10:00:00Z',
  reviewer: null,
  reviewed_at: null,
  status: 'pending',
  rejection_reason: null,
}

describe('ContributorLine', () => {
  it('RM-CPT-05: shows the author as "name (affiliation)" and the date, no review line', async () => {
    const { container } = renderWithProviders(<ContributorLine contribution={pending} />)
    expect(screen.getByText(/Par Ada Lovelace \(Université Côte d’Azur\), le 10 nov\. 2026/)).toBeInTheDocument()
    expect(screen.queryByText(/par Bob/i)).toBeNull()
    await expectNoAxeViolations(container)
  })

  it('RM-CTB-06: marks a historical author in words', () => {
    renderWithProviders(<ContributorLine contribution={{ ...pending, author: null, author_label: 'Jean' }} />)
    expect(screen.getByText(/Jean \(antérieur aux comptes\)/)).toBeInTheDocument()
  })

  it('RM-MOD-03: shows the reviewer and the review date of a validated contribution', () => {
    renderWithProviders(
      <ContributorLine
        contribution={{ ...pending, status: 'validated', reviewer: bob, reviewed_at: '2026-11-12T09:00:00Z' }}
      />,
    )
    expect(screen.getByText('Validé par Bob Martin (CNRS), le 12 nov. 2026')).toBeInTheDocument()
  })

  it('RM-ACC-04: shows the public reason of a rejected contribution', () => {
    renderWithProviders(
      <ContributorLine
        contribution={{
          ...pending,
          status: 'rejected',
          reviewer: bob,
          reviewed_at: '2026-11-12T09:00:00Z',
          rejection_reason: 'Le passage ne parle pas du lion.',
        }}
      />,
    )
    expect(screen.getByText(/Rejeté par Bob Martin \(CNRS\)/)).toBeInTheDocument()
    expect(screen.getByText('Motif du rejet : Le passage ne parle pas du lion.')).toBeInTheDocument()
  })

  it('does not show a reason for a validated contribution', () => {
    renderWithProviders(
      <ContributorLine
        contribution={{
          ...pending,
          status: 'validated',
          reviewer: bob,
          reviewed_at: '2026-11-12T09:00:00Z',
          rejection_reason: 'stale',
        }}
      />,
    )
    expect(screen.queryByText(/Motif/)).toBeNull()
  })
})
