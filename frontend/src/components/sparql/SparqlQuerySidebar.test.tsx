import type { ComponentProps } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithProviders } from '../../features/accounts/components/testSupport'
import { expectNoAxeViolations } from '../../test/axe'
import type { SavedSparqlQuery } from '../../types'
import { SparqlQuerySidebar } from './SparqlQuerySidebar'

const ada = { id: 1, display_name: 'Ada Lovelace', affiliation: 'I3S' }

function query(overrides: Partial<SavedSparqlQuery>): SavedSparqlQuery {
  return {
    id: 10,
    title: 'Loups',
    description: null,
    query_text: 'SELECT * WHERE { ?s ?p ?o } LIMIT 5',
    query_spo_text: null,
    category: 'Faune terrestre',
    author: ada,
    author_label: null,
    is_builtin: false,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-10T10:00:00Z',
    allowed_actions: [],
    ...overrides,
  }
}

async function setup(
  saved: SavedSparqlQuery[],
  extra: Partial<ComponentProps<typeof SparqlQuerySidebar>> = {},
  tab: RegExp | null = /Mes requêtes/,
) {
  const onDeleteQuery = vi.fn()
  const view = renderWithProviders(
    <SparqlQuerySidebar
      savedQueries={saved}
      selectedQueryId=""
      onSelectQuery={() => undefined}
      onNewQuery={() => undefined}
      onDeleteQuery={onDeleteQuery}
      onApplyTemplate={() => undefined}
      historyQueries={[]}
      onSelectHistory={() => undefined}
      onClearHistory={() => undefined}
      isCollapsed={false}
      onToggleCollapse={() => undefined}
      {...extra}
    />,
  )
  if (tab) await userEvent.click(screen.getByRole('button', { name: tab }))
  return { onDeleteQuery, ...view }
}

describe('SparqlQuerySidebar', () => {
  it('RM-QC-06: shows the delete button only for a query whose allowed_actions has delete', async () => {
    const own = query({ id: 10, title: 'Loups', allowed_actions: ['edit', 'delete'] })
    const other = query({ id: 11, title: 'Ours', allowed_actions: [] })
    const { onDeleteQuery } = await setup([own, other])
    expect(screen.getAllByRole('button', { name: /^Supprimer la requête/ })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la requête : Loups' }))
    expect(onDeleteQuery).toHaveBeenCalledWith(own)
    expect(screen.queryByRole('button', { name: 'Supprimer la requête : Ours' })).toBeNull()
  })

  it('RM-CPT-05, RM-CTB-06: shows the author as "name (affiliation)", or the typed name marked as historical', async () => {
    await setup([
      query({ id: 10, title: 'Loups' }),
      query({ id: 11, title: 'Ours', author: null, author_label: 'Jean' }),
    ])
    expect(screen.getByText('Ada Lovelace (I3S)')).toBeInTheDocument()
    expect(screen.getByText('Jean (antérieur aux comptes)')).toBeInTheDocument()
  })

  it('rule 9: a failed list shows an alert and a retry, never "no query found", on both tabs', async () => {
    const onRetryLoad = vi.fn()
    await setup([], { loadError: new Error('boom'), onRetryLoad }, /Mes requêtes/)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucune requête trouvée.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Questions CQs' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucune requête trouvée.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })

  it('rule 9: the local history stays usable when the list failed', async () => {
    const onSelectHistory = vi.fn()
    const item = { id: 'h1', query: 'SELECT * WHERE { ?s ?p ?o }', title: 'Ma requête', timestamp: 1 }
    await setup([], { loadError: new Error('boom'), historyQueries: [item], onSelectHistory }, /Historique/)
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Ma requête/ }))
    expect(onSelectHistory).toHaveBeenCalledWith(item)
  })

  it('an empty list without failure still says that no query was found', async () => {
    await setup([])
    expect(screen.getByText('Aucune requête trouvée.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('names the search field and the icon-only buttons', async () => {
    await setup([query({})], {}, null)
    await userEvent.type(screen.getByRole('textbox', { name: 'Filtrer les requêtes' }), 'loup')
    expect(screen.getByRole('button', { name: 'Effacer le filtre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle requête' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masquer la bibliothèque' })).toBeInTheDocument()
  })

  it('has no accessibility violation', async () => {
    const { container } = await setup([query({ allowed_actions: ['delete'] })])
    await expectNoAxeViolations(container)
  })

  it('has no accessibility violation with a failed list', async () => {
    const { container } = await setup([], { loadError: new Error('boom'), onRetryLoad: () => undefined })
    await expectNoAxeViolations(container)
  })

  it('has no accessibility violation on the history tab', async () => {
    const item = { id: 'h1', query: 'SELECT * WHERE { ?s ?p ?o }', title: 'Ma requête', timestamp: 1 }
    const { container } = await setup([], { historyQueries: [item] }, /Historique/)
    await expectNoAxeViolations(container)
  })
})
