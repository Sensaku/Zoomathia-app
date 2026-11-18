import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { expectNoAxeViolations } from '../../../test/axe'
import { server } from '../../../test/server'
import type { StagedAnnotation } from '../../../types'
import { RejectedAnnotationList } from './RejectedAnnotationList'
import { renderWithProviders } from './renderWithProviders'

const rejected: StagedAnnotation = {
  id: 7,
  paragraph_uri: 'p1',
  target_text: 'le lion rugit',
  start_offset: 3,
  end_offset: 16,
  concept_uri: 'http://thezoo/lion',
  concept_label: 'Lion',
  concept_type: 'concept',
  justification: null,
  scope_type: 'word_sequence',
  end_paragraph_uri: null,
  target_paragraphs: [],
  status: 'rejected',
  author: { id: 2, display_name: 'Ada Lovelace', affiliation: 'I3S' },
  author_label: null,
  reviewer: { id: 3, display_name: 'Grace Hopper', affiliation: 'MIT' },
  reviewed_at: '2026-03-02T10:00:00Z',
  rejection_reason: 'Hors sujet',
  created_at: '2026-03-01T10:00:00Z',
  updated_at: null,
  version: 2,
  allowed_actions: [],
}

/** Answers the list of rejected annotations and records the query string it received. */
function mockList(respond: () => Response) {
  const seen: { search?: string } = {}
  server.use(
    http.get(`${BASE_URL}/annotations`, ({ request }) => {
      seen.search = new URL(request.url).search
      return respond()
    }),
  )
  return seen
}

describe('RejectedAnnotationList', () => {
  it('RM-ACC-04: asks for the rejected annotations of the paragraph, 50 at most, and shows them with their reason', async () => {
    const seen = mockList(() => HttpResponse.json({ items: [rejected], total: 1 }))
    const { container } = renderWithProviders(<RejectedAnnotationList paragraphUri="p1" />)
    expect(await screen.findByText('Lion')).toBeInTheDocument()
    const params = new URLSearchParams(seen.search)
    expect(params.get('paragraph_uri')).toBe('p1')
    expect(params.get('status')).toBe('rejected')
    expect(params.get('limit')).toBe('50')
    expect(screen.getByText(/Motif du rejet : Hors sujet/)).toBeInTheDocument()
    // Rejected annotations are never highlighted, so they cannot be followed.
    expect(screen.queryByRole('button', { pressed: false })).toBeNull()
    expect(screen.queryByText(/affichées sur/)).toBeNull()
    await expectNoAxeViolations(container)
  })

  it('rule 9: a failure shows an error with a retry, never the empty state', async () => {
    const user = userEvent.setup()
    let failing = true
    mockList(() =>
      failing
        ? HttpResponse.json({ detail: 'down', code: 'database_busy' }, { status: 503 })
        : HttpResponse.json({ items: [rejected], total: 1 }),
    )
    renderWithProviders(<RejectedAnnotationList paragraphUri="p1" />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucune annotation rejetée sur ce paragraphe.')).toBeNull()
    failing = false
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('Lion')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the empty state when nothing was rejected', async () => {
    mockList(() => HttpResponse.json({ items: [], total: 0 }))
    renderWithProviders(<RejectedAnnotationList paragraphUri="p1" />)
    expect(await screen.findByText('Aucune annotation rejetée sur ce paragraphe.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rule 10: says "N of total" when the list is cut off by the limit', async () => {
    mockList(() => HttpResponse.json({ items: [rejected], total: 63 }))
    renderWithProviders(<RejectedAnnotationList paragraphUri="p1" />)
    expect(await screen.findByText('1 annotations rejetées affichées sur 63.')).toBeInTheDocument()
  })

  it('shows a loading state first', () => {
    mockList(() => HttpResponse.json({ items: [], total: 0 }))
    renderWithProviders(<RejectedAnnotationList paragraphUri="p1" />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des annotations rejetées')
  })
})
