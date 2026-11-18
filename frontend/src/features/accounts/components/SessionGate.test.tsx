import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { expectNoAxeViolations } from '../../../test/axe'
import { SESSION_KEY } from '../session'
import { SessionGate } from './SessionGate'
import { SESSION, renderWithProviders } from './testSupport'

const ME_URL = `${BASE_URL}/auth/me`

function renderGate(options: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(
    <SessionGate signInMessage="Connectez-vous pour proposer.">
      <p>The form</p>
    </SessionGate>,
    options,
  )
}

describe('SessionGate', () => {
  it('says that the session is loading, without a sign-in prompt', async () => {
    server.use(http.get(ME_URL, () => new Promise<Response>(() => undefined)))
    const { container } = renderGate({})
    expect(screen.getByText('Chargement en cours...')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('shows an error with a retry, not a sign-in prompt, when the session cannot be checked (rule 9)', async () => {
    let calls = 0
    server.use(
      http.get(ME_URL, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ detail: 'down' }, { status: 503 }) : HttpResponse.json(SESSION)
      }),
    )
    const user = userEvent.setup()
    const { container } = renderGate({})
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de vérifier votre session.')
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument()
    expect(screen.queryByText('The form')).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('The form')).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('keeps the form when a known session fails to reload (503)', async () => {
    server.use(http.get(ME_URL, () => HttpResponse.json({ detail: 'down' }, { status: 503 })))
    const { queryClient } = renderGate({ session: SESSION })
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: SESSION_KEY })
      // React Query notifies its observers on the next tick: wait for it, or the check is vacuous.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // The reload failed, but the account is known: the form is not torn down, and no error shows.
    expect(queryClient.getQueryState(SESSION_KEY)?.status).toBe('error')
    expect(screen.getByText('The form')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the sign-in prompt with its message to a visitor', async () => {
    const { container } = renderGate({ session: null, route: '/thesaurus-proposals' })
    expect(screen.getByText('Connectez-vous pour proposer.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/login?next=%2Fthesaurus-proposals',
    )
    expect(screen.queryByText('The form')).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('shows its children to a signed-in user', async () => {
    const { container } = renderGate({ session: SESSION })
    expect(screen.getByText('The form')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})
