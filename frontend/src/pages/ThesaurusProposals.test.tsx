import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { LocationProbe, SESSION, renderWithProviders } from '../features/accounts/components/testSupport'
import { expectNoAxeViolations } from '../test/axe'
import { server } from '../test/server'
import type { ContributionStatus, ThesaurusProposal } from '../types'
import { ThesaurusProposals } from './ThesaurusProposals'

function proposal(id: number, status: ContributionStatus, extra: Partial<ThesaurusProposal> = {}): ThesaurusProposal {
  return {
    id,
    pref_label: `Terme ${id}`,
    language: 'fr',
    alt_labels: [],
    broader_concept_uri: null,
    broader_concept_label: null,
    definition: null,
    status,
    author: { id: 2, display_name: 'Bob Martin', affiliation: 'CNRS' },
    author_label: null,
    reviewer: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: null,
    version: 1,
    allowed_actions: [],
    ...extra,
  }
}

/** Answers the list with `total` proposals and records every query string. */
function mockList(options: { total?: number; items?: (status: ContributionStatus) => ThesaurusProposal[] } = {}) {
  const seen: URLSearchParams[] = []
  server.use(
    http.get(`${BASE_URL}/thesaurus/proposals`, ({ request }) => {
      const params = new URL(request.url).searchParams
      seen.push(params)
      const status = params.get('status') as ContributionStatus
      const items = options.items ? options.items(status) : [proposal(1, status)]
      return HttpResponse.json({ items, total: options.total ?? items.length })
    }),
  )
  return seen
}

function setup(route = '/thesaurus-proposals', session: typeof SESSION | null = SESSION) {
  return renderWithProviders(
    <>
      <ThesaurusProposals />
      <LocationProbe />
    </>,
    { route, session },
  )
}

describe('ThesaurusProposals', () => {
  it('RM-ACC-03: asks for the validated proposals by default, 50 at a time, and shows the total', async () => {
    const seen = mockList({ total: 7 })
    setup()
    expect(await screen.findByText('Terme 1')).toBeInTheDocument()
    expect(seen).toHaveLength(1)
    expect(seen[0].get('status')).toBe('validated')
    expect(seen[0].get('limit')).toBe('50')
    expect(seen[0].get('offset')).toBe('0')
    expect(seen[0].has('q')).toBe(false)
    expect(screen.getByText('7 proposition(s)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validées' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('RM-ACC-03: switching tab requests the other status and keeps it in the URL', async () => {
    const user = userEvent.setup()
    const seen = mockList()
    setup()
    await screen.findByText('Terme 1')
    await user.click(screen.getByRole('button', { name: 'Non relues' }))
    await waitFor(() => expect(seen.map((p) => p.get('status'))).toContain('pending'))
    expect(screen.getByTestId('location')).toHaveTextContent('status=pending')
    await user.click(screen.getByRole('button', { name: 'Rejetées' }))
    await waitFor(() => expect(seen.map((p) => p.get('status'))).toContain('rejected'))
    expect(await screen.findByRole('button', { name: 'Rejetées' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reads the status and the search from the URL', async () => {
    const seen = mockList()
    setup('/thesaurus-proposals?status=rejected&q=loup')
    await screen.findByText('Terme 1')
    expect(seen[0].get('status')).toBe('rejected')
    expect(seen[0].get('q')).toBe('loup')
    expect(screen.getByRole('searchbox', { name: 'Rechercher une proposition' })).toHaveValue('loup')
  })

  it('searches on the server, after a pause, with the typed text', async () => {
    const user = userEvent.setup()
    const seen = mockList()
    setup()
    await screen.findByText('Terme 1')
    await user.type(screen.getByRole('searchbox'), 'ours')
    await waitFor(() => expect(seen.at(-1)?.get('q')).toBe('ours'))
    // Not one request per key: the first request plus the debounced one.
    expect(seen).toHaveLength(2)
    expect(screen.getByTestId('location')).toHaveTextContent('q=ours')
  })

  it('loads the next 50 with "Afficher plus", from the number already loaded', async () => {
    const user = userEvent.setup()
    const seen = mockList({
      total: 3,
      items: () => [proposal(1, 'validated'), proposal(2, 'validated')],
    })
    setup()
    await screen.findByText('Terme 2')
    await user.click(screen.getByRole('button', { name: 'Afficher plus' }))
    await waitFor(() => expect(seen).toHaveLength(2))
    expect(seen[1].get('offset')).toBe('2')
  })

  it('shows no "Afficher plus" once everything is loaded', async () => {
    mockList({ total: 1 })
    setup()
    await screen.findByText('Terme 1')
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull()
  })

  it('RM-ACC-04: shows a rejection with its public reason, and the actions the backend allows', async () => {
    mockList({
      items: () => [
        proposal(5, 'rejected', {
          rejection_reason: 'Déjà dans le thésaurus',
          reviewed_at: '2026-11-12T09:00:00Z',
          reviewer: { id: 3, display_name: 'Eve Durand', affiliation: 'UCA' },
          allowed_actions: ['delete'],
        }),
      ],
    })
    setup('/thesaurus-proposals?status=rejected')
    expect(await screen.findByText(/Motif du rejet : Déjà dans le thésaurus/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer: Terme 5' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull()
  })

  it('RM-CTB-03: a visitor sees the sign-in prompt instead of the form', async () => {
    mockList()
    setup('/thesaurus-proposals', null)
    expect(await screen.findByText('Connectez-vous pour proposer un terme.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Soumettre la proposition' })).toBeNull()
  })

  it('RM-CTB-03, RM-THE-04: sends no contributor name, then offers the pending tab', async () => {
    const user = userEvent.setup()
    mockList()
    const bodies: unknown[] = []
    server.use(
      http.post(`${BASE_URL}/thesaurus/proposals`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(proposal(9, 'pending'), { status: 201 })
      }),
    )
    setup()
    await screen.findByText('Terme 1')
    expect(screen.queryByText(/contributeur/i)).toBeNull()
    await user.type(screen.getByRole('textbox', { name: /Terme préférentiel/ }), 'Canis aureus')
    await user.click(screen.getByRole('button', { name: 'Soumettre la proposition' }))
    expect(await screen.findByText(/attend la relecture/)).toBeInTheDocument()
    expect(bodies).toEqual([{ pref_label: 'Canis aureus', language: 'fr', alt_labels: [] }])
    await user.click(screen.getByRole('button', { name: 'Voir les propositions non relues' }))
    expect(screen.getByRole('button', { name: 'Non relues' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('RM-THE-04: shows the translated duplicate_proposal error', async () => {
    const user = userEvent.setup()
    mockList()
    server.use(
      http.post(`${BASE_URL}/thesaurus/proposals`, () =>
        HttpResponse.json({ detail: 'English', code: 'duplicate_proposal' }, { status: 409 }),
      ),
    )
    setup()
    await screen.findByText('Terme 1')
    await user.type(screen.getByRole('textbox', { name: /Terme préférentiel/ }), 'Canis aureus')
    await user.click(screen.getByRole('button', { name: 'Soumettre la proposition' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('shows a failed load as an error, never as an empty list', async () => {
    server.use(http.get(`${BASE_URL}/thesaurus/proposals`, () => HttpResponse.json({ detail: 'x' }, { status: 502 })))
    setup()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Aucune proposition/)).toBeNull()
  })

  it('has no accessibility violation', async () => {
    mockList()
    const { container } = setup()
    await screen.findByText('Terme 1')
    await expectNoAxeViolations(container)
  })
})
