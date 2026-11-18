import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { expectNoAxeViolations } from '../../../test/axe'
import { AccountPage } from './AccountPage'
import { PasswordChangeForm } from './PasswordChangeForm'
import { LocationProbe, SESSION, renderWithProviders } from './testSupport'

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) {
  await user.type(screen.getByLabelText(/^Mot de passe actuel/), current)
  await user.type(screen.getByLabelText(/^Nouveau mot de passe/), next)
  await user.type(screen.getByLabelText(/^Confirmation du nouveau mot de passe/), confirm)
  await user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }))
}

describe('PasswordChangeForm', () => {
  it('refuses a confirmation that differs and sends nothing', async () => {
    let requests = 0
    server.use(
      http.post(`${BASE_URL}/auth/password`, () => {
        requests += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    const { container } = renderWithProviders(<PasswordChangeForm />, { session: SESSION })
    await fill(user, 'old password value', 'a long enough password', 'another long password')
    expect(screen.getAllByText('La confirmation ne correspond pas au nouveau mot de passe.').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/^Confirmation du nouveau mot de passe/)).toHaveAttribute('aria-invalid', 'true')
    expect(requests).toBe(0)
    await expectNoAxeViolations(container)
  })

  it('says the current password is wrong on a 403 invalid_credentials, not the login message', async () => {
    server.use(
      http.post(`${BASE_URL}/auth/password`, () =>
        HttpResponse.json({ detail: 'bad', code: 'invalid_credentials' }, { status: 403 }),
      ),
    )
    const user = userEvent.setup()
    renderWithProviders(<PasswordChangeForm />, { session: SESSION })
    await fill(user, 'old password value', 'a long enough password', 'a long enough password')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Le mot de passe actuel est incorrect.')
    expect(alert).not.toHaveTextContent('Adresse e-mail')
  })

  it('sends the passwords, confirms, and clears the fields on success (204)', async () => {
    let body: unknown
    server.use(
      http.post(`${BASE_URL}/auth/password`, async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<PasswordChangeForm />, { session: SESSION })
    await fill(user, 'old password value', 'a long enough password', 'a long enough password')
    expect(await screen.findByRole('status')).toHaveTextContent('Vos autres sessions ont été fermées.')
    expect(body).toEqual({ current_password: 'old password value', new_password: 'a long enough password' })
    expect(screen.getByLabelText(/^Mot de passe actuel/)).toHaveValue('')
    expect(screen.getByLabelText(/^Nouveau mot de passe/)).toHaveValue('')
    expect(screen.getByLabelText(/^Confirmation du nouveau mot de passe/)).toHaveValue('')
  })
})

describe('AccountPage', () => {
  it('shows the profile of the signed-in account in a description list', async () => {
    const { container } = renderWithProviders(<AccountPage />, { session: SESSION })
    expect(screen.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeInTheDocument()
    expect(screen.getByText('Nom affiché').nextElementSibling).toHaveTextContent('Ada Lovelace')
    expect(screen.getByText('Adresse e-mail').nextElementSibling).toHaveTextContent('ada@example.org')
    expect(screen.getByText('Rôle').nextElementSibling).toHaveTextContent('Contributeur')
    // activated_at wins over created_at.
    expect(screen.getByText('Membre depuis').nextElementSibling).toHaveTextContent(/3 févr\.? 2026/)
    expect(document.title).toBe('Mon compte · Zoomathia')
    await expectNoAxeViolations(container)
  })

  it('sends a visitor to the login page and comes back to /account afterwards', () => {
    renderWithProviders(
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>,
      { route: '/account', session: null },
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Faccount')
  })
})
