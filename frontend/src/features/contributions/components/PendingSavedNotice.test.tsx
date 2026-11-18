import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { PendingSavedNotice } from './PendingSavedNotice'
import { renderWithProviders } from './renderWithProviders'

function Probe() {
  return <p data-testid="search">{useLocation().search}</p>
}

function setup(onDismiss = vi.fn()) {
  const view = renderWithProviders(
    <>
      <PendingSavedNotice onDismiss={onDismiss} />
      <Probe />
    </>,
    { route: '/explore-work?uri=abc' },
  )
  return { onDismiss, ...view }
}

describe('PendingSavedNotice', () => {
  it('RM-ACC-03: says the annotation was saved and waits for a review, as a status message', async () => {
    const { container } = setup()
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Annotation enregistrée')
    expect(notice).toHaveTextContent("attend la relecture d'un autre compte")
    await expectNoAxeViolations(container)
  })

  it('RM-ACC-03: its button turns the unreviewed filter on, keeps the other parameters, and dismisses the notice', async () => {
    const user = userEvent.setup()
    const { onDismiss } = setup()
    await user.click(screen.getByRole('button', { name: 'Afficher les contributions non relues' }))
    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '')
    expect(params.get('pending')).toBe('1')
    expect(params.get('uri')).toBe('abc')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('can be closed without turning the filter on', async () => {
    const user = userEvent.setup()
    const { onDismiss } = setup()
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('search').textContent).not.toContain('pending')
  })
})
