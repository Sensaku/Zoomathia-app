import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { expectNoAxeViolations } from '../../../test/axe'
import { LoginPage } from './LoginPage'
import { LocationProbe, SESSION, renderWithProviders } from './testSupport'

function renderLogin(route: string, session: typeof SESSION | null = null) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { route, session },
  )
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/adresse e-mail/i), 'ada@example.org')
  await user.type(screen.getByLabelText(/^mot de passe/i), 'a long enough password')
  await user.click(screen.getByRole('button', { name: 'Se connecter' }))
}

describe('LoginPage', () => {
  it('has a heading, labelled fields with autocomplete and no accessibility violation', async () => {
    const { container } = renderLogin('/login')
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument()
    expect(screen.getByLabelText(/adresse e-mail/i)).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText(/^mot de passe/i)).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByText(/demandez un lien de réinitialisation à un administrateur/i)).toBeInTheDocument()
    expect(document.title).toBe('Connexion · Zoomathia')
    await expectNoAxeViolations(container)
  })

  it('shows the error summary with its focus and sends nothing on an empty submit', async () => {
    let requests = 0
    server.use(
      http.post(`${BASE_URL}/auth/login`, () => {
        requests += 1
        return HttpResponse.json(SESSION)
      }),
    )
    const user = userEvent.setup()
    const { container } = renderLogin('/login')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))
    const summary = screen.getByRole('heading', { name: 'Le formulaire contient des erreurs' }).parentElement
    expect(summary).toHaveFocus()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByLabelText(/adresse e-mail/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^mot de passe/i)).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toBe(0)
    await expectNoAxeViolations(container)
  })

  it('shows the translated message when the credentials are wrong (401 invalid_credentials)', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_credentials' }, { status: 401 }),
      ),
    )
    const user = userEvent.setup()
    renderLogin('/login')
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Adresse e-mail ou mot de passe incorrect.')
  })

  it('says how many minutes to wait after a 429 with Retry-After: 120', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/login`, () =>
        HttpResponse.json(
          { detail: 'slow down', code: 'too_many_attempts' },
          { status: 429, headers: { 'Retry-After': '120' } },
        ),
      ),
    )
    const user = userEvent.setup()
    renderLogin('/login')
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Réessayez dans 2 min.')
  })

  it('goes to a safe next path after a successful login', async () => {
    server.use(http.post(`${BASE_URL}/auth/login`, () => HttpResponse.json(SESSION)))
    const user = userEvent.setup()
    renderLogin('/login?next=%2Fexplore-work%3Fpending%3D1')
    await fillAndSubmit(user)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/explore-work?pending=1'))
  })

  it('refuses an open redirect: an unsafe next lands on the home page', async () => {
    server.use(http.post(`${BASE_URL}/auth/login`, () => HttpResponse.json(SESSION)))
    const user = userEvent.setup()
    renderLogin('/login?next=%2F%2Fevil.example')
    await fillAndSubmit(user)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
  })

  it('shows a notice with a link to the account instead of the form when already signed in', () => {
    renderLogin('/login', SESSION)
    expect(screen.getByText('Vous êtes déjà connecté.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aller à mon compte' })).toHaveAttribute('href', '/account')
    expect(screen.queryByLabelText(/adresse e-mail/i)).not.toBeInTheDocument()
  })
})
