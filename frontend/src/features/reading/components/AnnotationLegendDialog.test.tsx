import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../../../api/http'
import { I18nProvider } from '../../../i18n'
import { createTestQueryClient } from '../../../test/queryClient'
import { expectNoAxeViolations } from '../../../test/axe'
import { server } from '../../../test/server'
import { AnnotationLegendDialog } from './AnnotationLegendDialog'

const CATEGORIES = [
  {
    category: 'animal',
    collections: [{ iri: 'https://thezoo/zoonyms', labels: { fr: 'Zoonymes', en: 'Zoonyms' } }],
  },
  {
    category: 'person',
    collections: [
      { iri: 'https://thezoo/authors', labels: { fr: 'Auteurs', en: 'Authors' } },
      { iri: 'https://thezoo/rulers', labels: { en: 'Rulers' } },
    ],
  },
  { category: 'general', collections: [] },
]

function mockCategories(handler: () => Response | Promise<Response> = () => HttpResponse.json(CATEGORIES)) {
  server.use(http.get(`${BASE_URL}/thesaurus/categories`, handler))
}

function setup(language: 'fr' | 'en' = 'fr', onClose = () => undefined) {
  localStorage.setItem('zoomathia_lang', language)
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <I18nProvider>
        <MemoryRouter>
          <AnnotationLegendDialog open onClose={onClose} />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('AnnotationLegendDialog', () => {
  it('RM-CON-02: lists the categories of the backend table with their collections, in French', async () => {
    mockCategories()
    setup('fr')

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Zoonymes')).toBeInTheDocument()
    expect(within(dialog).getByText('Animal')).toBeInTheDocument()
    // A collection with no French name falls back to its English one.
    expect(within(dialog).getByText('Auteurs, Rulers')).toBeInTheDocument()
    expect(within(dialog).getByText('Toute autre collection, ou aucune')).toBeInTheDocument()
  })

  it('RM-CON-02: names the collections in English when the interface is in English', async () => {
    mockCategories()
    setup('en')

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('Zoonyms')).toBeInTheDocument()
    expect(within(dialog).getByText('Authors, Rulers')).toBeInTheDocument()
    expect(within(dialog).getByText('Person')).toBeInTheDocument()
    expect(within(dialog).getByText('Any other collection, or none')).toBeInTheDocument()
  })

  it('shows a loading state, then the table', async () => {
    mockCategories(async () => {
      await delay(50)
      return HttpResponse.json(CATEGORIES)
    })
    setup('fr')

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des catégories')
    expect(await screen.findByText('Zoonymes')).toBeInTheDocument()
  })

  it('rule 9: a failed load shows the error, not an empty legend, and the retry reloads it', async () => {
    let calls = 0
    mockCategories(() => {
      calls += 1
      return calls === 1 ? HttpResponse.json({ detail: 'down' }, { status: 502 }) : HttpResponse.json(CATEGORIES)
    })
    setup('fr')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Animal')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Zoonymes')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains the overlaps, the edges and the states', async () => {
    mockCategories()
    setup('fr')

    for (const name of ['Chevauchement', 'Bords', 'Survol', 'Épinglé', 'Atténué', 'Non relu', 'Validé']) {
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
  })

  it('Escape closes the dialog', async () => {
    mockCategories()
    const onClose = vi.fn()
    setup('fr', onClose)

    await screen.findByText('Zoonymes')
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes the accessibility checks with data and on error', async () => {
    mockCategories()
    setup('fr')
    await screen.findByText('Zoonymes')
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    await expectNoAxeViolations(document.body)
  })

  it('passes the accessibility checks when the load fails', async () => {
    mockCategories(() => HttpResponse.json({ detail: 'down' }, { status: 502 }))
    setup('fr')
    await screen.findByRole('alert')
    await expectNoAxeViolations(document.body)
  })
})
