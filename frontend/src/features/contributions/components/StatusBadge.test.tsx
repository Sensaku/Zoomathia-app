import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from './renderWithProviders'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['pending', 'Non relu'],
    ['validated', 'Validé'],
    ['rejected', 'Rejeté'],
  ] as const)('RM-ACC-03: %s shows its label and a decorative icon', async (status, label) => {
    const { container } = renderWithProviders(<StatusBadge status={status} />)
    const badge = screen.getByText(label)
    expect(badge.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    await expectNoAxeViolations(container)
  })
})
