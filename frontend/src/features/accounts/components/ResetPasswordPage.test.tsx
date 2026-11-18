import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { I18nProvider } from '../../../i18n'
import { server } from '../../../test/server'
import { expectNoAxeViolations } from '../../../test/axe'
import { createTestQueryClient } from '../../../test/queryClient'
import { ResetPasswordPage } from './ResetPasswordPage'
import { SignInPrompt } from './SignInPrompt'
import { renderWithProviders } from './testSupport'

afterEach(() => window.history.replaceState(null, '', '/'))

const RESET_ROUTE = '/reset-password#token=secret-token'

/** Prints the fragment of the router location, which is where a stray token would stay. */
function HashProbe() {
  return <p data-testid="hash">{useLocation().hash}</p>
}

async function submit(user: ReturnType<typeof userEvent.setup>, password = 'a long enough password') {
  await user.type(screen.getByLabelText(/^Nouveau mot de passe/), password)
  await user.type(screen.getByLabelText(/^Confirmation du nouveau mot de passe/), password)
  await user.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }))
}

describe('ResetPasswordPage', () => {
  it('removes the token from the router location after the first render, yet still submits it', async () => {
    let body: unknown
    server.use(
      http.post(`${BASE_URL}/auth/password-reset`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
      http.get(`${BASE_URL}/auth/me`, () =>
        HttpResponse.json({ detail: 'x', code: 'not_authenticated' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    const { container } = renderWithProviders(
      <>
        <ResetPasswordPage />
        <HashProbe />
      </>,
      { route: RESET_ROUTE },
    )
    expect(screen.getByTestId('hash')).toHaveTextContent('')
    await expectNoAxeViolations(container)
    await submit(user)
    expect(await screen.findByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute('href', '/login')
    expect(body).toEqual({ token: 'secret-token', new_password: 'a long enough password' })
  })

  it('cleans the address bar too (a browser router), without losing the token', async () => {
    window.history.replaceState(null, '', RESET_ROUTE)
    localStorage.setItem('zoomathia_lang', 'fr')
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <I18nProvider>
          <BrowserRouter>
            <ResetPasswordPage />
          </BrowserRouter>
        </I18nProvider>
      </QueryClientProvider>,
    )
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/reset-password')
    expect(screen.getByLabelText(/^Nouveau mot de passe/)).toBeInTheDocument()
  })

  it('does not copy the token into a sign-in link built from the location', () => {
    renderWithProviders(
      <>
        <ResetPasswordPage />
        <SignInPrompt message="Sign in" />
      </>,
      { route: RESET_ROUTE },
    )
    const href = screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href') ?? ''
    expect(href).toBe('/login?next=%2Freset-password')
    expect(href).not.toContain('token')
  })

  it('explains the missing token and shows no form', async () => {
    const { container } = renderWithProviders(<ResetPasswordPage />, { route: '/reset-password' })
    expect(screen.getByText('Lien incomplet')).toBeInTheDocument()
    // The token lives in state only: a reload loses it, so the text says to open the link again.
    expect(screen.getByText(/Ouvrez à nouveau le lien que vous avez reçu/)).toBeInTheDocument()
    expect(screen.getByText(/demandez-en un nouveau à un administrateur/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Nouveau mot de passe/)).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('checks that the confirmation matches before sending', async () => {
    let requests = 0
    server.use(
      http.post(`${BASE_URL}/auth/password-reset`, () => {
        requests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, { route: '/reset-password#token=t' })
    await user.type(screen.getByLabelText(/^Nouveau mot de passe/), 'a long enough password')
    await user.type(screen.getByLabelText(/^Confirmation du nouveau mot de passe/), 'different')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }))
    expect(screen.getAllByText('La confirmation ne correspond pas au nouveau mot de passe.').length).toBeGreaterThan(0)
    expect(requests).toBe(0)
  })

  it('shows the translated message for 400 invalid_reset_token', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/password-reset`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_reset_token' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<ResetPasswordPage />, { route: '/reset-password#token=expired' })
    await submit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce lien est invalide ou expiré.')
  })
})
