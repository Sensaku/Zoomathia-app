/** Test helpers for the account screens: providers, a fixed language and a seeded session. */
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { I18nProvider } from '../../../i18n'
import { createTestQueryClient } from '../../../test/queryClient'
import type { Session } from '../../../types'
import { SESSION_KEY } from '../session'

export const SESSION: Session = {
  user: {
    id: 9,
    email: 'ada@example.org',
    display_name: 'Ada Lovelace',
    affiliation: 'I3S',
    role: 'contributor',
    status: 'active',
    created_at: '2026-01-02T00:00:00Z',
    activated_at: '2026-02-03T00:00:00Z',
  },
  csrf_token: 'tok',
}

/** Prints the router location, so that a test can assert where the user landed. */
export function LocationProbe() {
  const { pathname, search } = useLocation()
  return <p data-testid="location">{pathname + search}</p>
}

interface RenderOptions {
  route?: string
  /** `null` is a visitor, a session is a signed-in user; omitted leaves the cache empty. */
  session?: Session | null
  client?: QueryClient
}

/** Renders `ui` in French with a query client and a memory router. */
export function renderWithProviders(ui: ReactNode, { route = '/', session, client }: RenderOptions = {}) {
  localStorage.setItem('zoomathia_lang', 'fr')
  const queryClient = client ?? createTestQueryClient()
  if (session !== undefined) queryClient.setQueryData(SESSION_KEY, session)
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    ),
  }
}
