import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import { markSessionExpired } from '../session'
import { SessionExpiredNotice } from './SessionExpiredNotice'
import { SignInPrompt } from './SignInPrompt'
import { renderWithProviders } from './testSupport'

describe('SessionExpiredNotice', () => {
  it('shows nothing while the session is fine', () => {
    const { container } = renderWithProviders(<SessionExpiredNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('announces the end of the session, links back with the current location and can be closed', async () => {
    const user = userEvent.setup()
    const { container, queryClient } = renderWithProviders(<SessionExpiredNotice />, {
      route: '/annotate?pending=1#p3',
    })
    act(() => markSessionExpired(queryClient))
    expect(await screen.findByRole('alert')).toHaveTextContent('Votre session a pris fin.')
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute(
      'href',
      '/login?next=%2Fannotate%3Fpending%3D1%23p3',
    )
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SignInPrompt', () => {
  it('shows its message and a link that returns to the current page', async () => {
    const { container } = renderWithProviders(<SignInPrompt message="Connectez-vous pour proposer un terme." />, {
      route: '/thesaurus-proposals?q=lion',
    })
    expect(screen.getByText('Connectez-vous pour proposer un terme.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/login?next=%2Fthesaurus-proposals%3Fq%3Dlion',
    )
    await expectNoAxeViolations(container)
  })
})
