import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { I18nProvider } from '../../../i18n/I18nContext'
import { expectNoAxeViolations } from '../../../test/axe'
import { PendingToggle } from './PendingToggle'
import { renderWithProviders } from './renderWithProviders'

function Probe() {
  const location = useLocation()
  return <output data-testid="search">{location.search}</output>
}

const setup = (route: string) =>
  renderWithProviders(
    <>
      <PendingToggle />
      <Probe />
    </>,
    { route },
  )

const toggle = () => screen.getByRole('checkbox', { name: 'Afficher les contributions non relues' })

describe('PendingToggle', () => {
  it('RM-ACC-03: is off by default, and checking it adds pending=1 and keeps the other parameters', async () => {
    const user = userEvent.setup()
    const { container } = setup('/explore-work?uri=abc')
    expect(toggle()).not.toBeChecked()
    expect(toggle()).toHaveAccessibleDescription(/Non relu/)
    await user.click(toggle())
    expect(toggle()).toBeChecked()
    const params = new URLSearchParams(screen.getByTestId('search').textContent ?? '')
    expect(params.get('pending')).toBe('1')
    expect(params.get('uri')).toBe('abc')
    await expectNoAxeViolations(container)
  })

  it('is on when the URL has pending=1, and unchecking removes only that parameter', async () => {
    const user = userEvent.setup()
    setup('/explore-work?uri=abc&pending=1')
    expect(toggle()).toBeChecked()
    await user.click(toggle())
    expect(toggle()).not.toBeChecked()
    expect(screen.getByTestId('search')).toHaveTextContent('?uri=abc')
    expect(screen.getByTestId('search').textContent).not.toContain('pending')
  })

  it('shows its new state at once, even when the router applies the URL change later', async () => {
    localStorage.setItem('zoomathia_lang', 'fr')
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <>
              <PendingToggle />
              <Probe />
            </>
          ),
        },
      ],
      { initialEntries: ['/explore-work?uri=abc'] },
    )
    // React Router applies a navigation in a transition: a slow one is a late one.
    const navigate = router.navigate.bind(router) as (...args: unknown[]) => Promise<void>
    router.navigate = ((...args: unknown[]) => {
      setTimeout(() => void navigate(...args), 150)
      return Promise.resolve()
    }) as typeof router.navigate
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    await user.click(toggle())
    // The URL has not changed yet: the box must not snap back (it made Playwright's check() fail).
    expect(screen.getByTestId('search').textContent).not.toContain('pending')
    expect(toggle()).toBeChecked()
    await waitFor(() => expect(screen.getByTestId('search').textContent).toContain('pending=1'))
    expect(toggle()).toBeChecked()
  })

  it('follows the URL when it changes elsewhere, for example with the Back button', async () => {
    localStorage.setItem('zoomathia_lang', 'fr')
    const router = createMemoryRouter([{ path: '*', element: <PendingToggle /> }], {
      initialEntries: ['/explore-work', '/explore-work?pending=1'],
      initialIndex: 1,
    })
    render(
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>,
    )
    expect(toggle()).toBeChecked()
    await act(() => router.navigate(-1))
    await waitFor(() => expect(toggle()).not.toBeChecked())
    await act(() => router.navigate('/explore-work?pending=1'))
    await waitFor(() => expect(toggle()).toBeChecked())
  })
})
