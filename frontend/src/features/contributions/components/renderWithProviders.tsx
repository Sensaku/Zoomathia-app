/**
 * Test helper: renders a component with French i18n, a query client and a router.
 */
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../../i18n/I18nContext'
import { createTestQueryClient } from '../../../test/queryClient'

export function renderWithProviders(ui: ReactElement, options: { client?: QueryClient; route?: string } = {}) {
  localStorage.setItem('zoomathia_lang', 'fr')
  const client = options.client ?? createTestQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}
