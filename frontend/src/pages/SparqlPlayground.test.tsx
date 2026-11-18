import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { I18nProvider } from '../i18n'
import { createTestQueryClient } from '../test/queryClient'
import { expectNoAxeViolations } from '../test/axe'
import { server } from '../test/server'
import type { SavedSparqlQuery } from '../types'
import { SparqlPlayground } from './SparqlPlayground'

function saved(id: number, title: string, queryText: string): SavedSparqlQuery {
  return {
    id,
    title,
    description: null,
    query_text: queryText,
    query_spo_text: null,
    category: 'Faune',
    author: null,
    author_label: null,
    is_builtin: true,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    allowed_actions: [],
  }
}

const FIRST = saved(1, 'Première question', 'SELECT ?first WHERE { ?first ?p ?o } LIMIT 1')

function mockQueries(items: SavedSparqlQuery[] = [FIRST, saved(2, 'Seconde question', 'ASK { ?s ?p ?o }')]) {
  server.use(http.get(`${BASE_URL}/queries`, () => HttpResponse.json({ items, total: items.length })))
}

function setup(state?: { queryText: string; title?: string }) {
  localStorage.setItem('zoomathia_lang', 'fr')
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[{ pathname: '/sparql', state }]}>
          <SparqlPlayground />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('SparqlPlayground', () => {
  it('fills the editor with the first saved query once the list arrives', async () => {
    mockQueries()
    setup()
    await waitFor(() => expect(screen.getByDisplayValue(FIRST.query_text)).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Première question' })).toBeInTheDocument()
  })

  it('a query handed over by navigation wins over the first saved query', async () => {
    mockQueries()
    setup({ queryText: 'SELECT ?given WHERE { ?given ?p ?o }', title: 'Transmise' })
    await screen.findByDisplayValue('SELECT ?given WHERE { ?given ?p ?o }')
    expect(await screen.findByText('Première question')).toBeInTheDocument()
    expect(screen.queryByDisplayValue(FIRST.query_text)).toBeNull()
    expect(screen.getByDisplayValue('Transmise')).toBeInTheDocument()
  })

  it('an edit is not overwritten when the list loads or reloads', async () => {
    mockQueries()
    const user = userEvent.setup()
    setup({ queryText: 'SELECT 1', title: 'Transmise' })
    const nameField = await screen.findByLabelText(/Nom de la requête/)
    await user.clear(nameField)
    await user.type(nameField, 'Modifiée')
    await screen.findByText('Seconde question')
    expect(nameField).toHaveValue('Modifiée')
  })

  it('a query chosen before the list arrives is not overwritten by the first saved query', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${BASE_URL}/queries`, async () => {
        await gate
        return HttpResponse.json({ items: [FIRST], total: 1 })
      }),
    )
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /Test d’existence/ }))
    expect(screen.getByDisplayValue(/ASK/)).toBeInTheDocument()
    release()
    await screen.findByText('Première question')
    expect(screen.getByDisplayValue(/ASK/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(FIRST.query_text)).toBeNull()
  })

  it('rule 9: a failed list shows an alert, not "no query found", and the retry recovers', async () => {
    server.use(http.get(`${BASE_URL}/queries`, () => HttpResponse.json({ detail: 'down' }, { status: 502 })))
    const user = userEvent.setup()
    setup()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucune requête trouvée.')).toBeNull()
    mockQueries()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.getByDisplayValue(FIRST.query_text)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('has labelled fields and no accessibility violation', async () => {
    mockQueries([{ ...FIRST, is_builtin: false, allowed_actions: ['edit'] }])
    const { container } = setup()
    await screen.findByLabelText(/Nom de la requête/)
    expect(screen.getByLabelText(/Intentions scientifiques/)).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })
})
