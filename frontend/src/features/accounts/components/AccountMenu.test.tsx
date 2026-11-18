import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { server } from '../../../test/server'
import { expectNoAxeViolations } from '../../../test/axe'
import { AccountMenu } from './AccountMenu'
import { LocationProbe, SESSION, renderWithProviders } from './testSupport'

function renderMenu(route: string, session: typeof SESSION | null | undefined, variant?: 'desktop' | 'mobile') {
  return renderWithProviders(
    <>
      <button type="button">Outside</button>
      <AccountMenu variant={variant} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </>,
    { route, session },
  )
}

describe('AccountMenu', () => {
  it('offers a sign-in link that keeps the current path and search as next', () => {
    renderMenu('/explore-work?pending=1#top', null)
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/login?next=%2Fexplore-work%3Fpending%3D1',
    )
  })

  it('offers a retry, not a sign-in link, when the session cannot be checked (rule 9)', async () => {
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/auth/me`, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ detail: 'down' }, { status: 503 }) : HttpResponse.json(SESSION)
      }),
    )
    const user = userEvent.setup()
    const { container } = renderMenu('/', undefined)
    const retry = await screen.findByRole('button', { name: 'Session indisponible, réessayer' })
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument()
    await expectNoAxeViolations(container)
    await user.click(retry)
    expect(await screen.findByRole('button', { name: /Ada Lovelace/ })).toBeInTheDocument()
  })

  it('uses the plain login path when already on the login page', () => {
    renderMenu('/login?next=%2Fa', null)
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login')
  })

  it('opens with Enter, closes with Escape and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    const { container } = renderMenu('/', SESSION)
    const button = screen.getByRole('button', { name: /Ada Lovelace/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    button.focus()
    await user.keyboard('{Enter}')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveAttribute('href', '/account')
    await expectNoAxeViolations(container)
    await user.keyboard('{Tab}')
    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('opens with Space', async () => {
    const user = userEvent.setup()
    renderMenu('/', SESSION)
    const button = screen.getByRole('button', { name: /Ada Lovelace/ })
    button.focus()
    await user.keyboard(' ')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on a click outside and when the focus leaves the menu', async () => {
    const user = userEvent.setup()
    renderMenu('/', SESSION)
    const button = screen.getByRole('button', { name: /Ada Lovelace/ })
    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Outside' }))
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    screen.getByRole('button', { name: 'Outside' }).focus()
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'))
  })

  it('closes after a route change', async () => {
    const user = userEvent.setup()
    renderMenu('/', SESSION)
    const button = screen.getByRole('button', { name: /Ada Lovelace/ })
    await user.click(button)
    await user.click(screen.getByRole('link', { name: 'Mon compte' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/account')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('signs out with POST /auth/logout and brings the sign-in link back', async () => {
    let logouts = 0
    server.use(
      http.post(`${BASE_URL}/auth/logout`, () => {
        logouts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderMenu('/account', SESSION)
    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }))
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
    expect(logouts).toBe(1)
    // Leaving /account: the page is not for visitors.
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/)
  })

  it('shows a failed logout instead of hiding it (AGENTS.md rule 9) and stays signed in', async () => {
    server.use(http.post(`${BASE_URL}/auth/logout`, () => HttpResponse.json({ detail: 'x' }, { status: 500 })))
    const user = userEvent.setup()
    renderMenu('/', SESSION)
    await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }))
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La déconnexion a échoué.')
    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument()
  })

  it('lists the same entries in the mobile variant', () => {
    renderMenu('/', SESSION, 'mobile')
    expect(screen.getByRole('link', { name: 'Mon compte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
  })
})
