import { useQuery } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { expectNoAxeViolations } from '../../../test/axe'
import { server } from '../../../test/server'
import type { ThesaurusProposal } from '../../../types'
import { contributionKeys } from '../queryKeys'
import { ProposalEditDialog } from './ProposalEditDialog'
import { renderWithProviders } from './renderWithProviders'

const proposal: ThesaurusProposal = {
  id: 4,
  pref_label: 'Loup',
  language: 'fr',
  alt_labels: ['canis'],
  broader_concept_uri: 'http://thezoo/canis',
  broader_concept_label: 'Canis',
  definition: 'Un canidé',
  status: 'pending',
  author: { id: 1, display_name: 'Ada Lovelace', affiliation: 'I3S' },
  author_label: null,
  reviewer: null,
  reviewed_at: null,
  rejection_reason: null,
  created_at: '2026-11-10T10:00:00Z',
  updated_at: null,
  version: 3,
  allowed_actions: ['edit'],
}

/** Records the PATCH bodies sent to the proposal. */
function mockPatch(respond: () => Response = () => HttpResponse.json({ ...proposal, version: 4 })) {
  const bodies: unknown[] = []
  server.use(
    http.patch(`${BASE_URL}/thesaurus/proposals/4`, async ({ request }) => {
      bodies.push(await request.json())
      return respond()
    }),
  )
  return bodies
}

function setup(onClose = vi.fn(), value = proposal) {
  const view = renderWithProviders(<ProposalEditDialog proposal={value} onClose={onClose} />)
  return { onClose, ...view }
}

const save = () => screen.getByRole('button', { name: 'Enregistrer' })
const prefLabel = () => screen.getByRole('textbox', { name: /Terme préférentiel/ })

describe('ProposalEditDialog', () => {
  it('RM-CTB-05: starts from the proposal and sends only the changed fields with the version', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    const { onClose } = setup()
    expect(prefLabel()).toHaveValue('Loup')
    await user.clear(prefLabel())
    await user.type(prefLabel(), '  Loup gris ')
    await user.click(save())
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([{ version: 3, pref_label: 'Loup gris' }])
  })

  it('RM-CTB-05: sends every kind of change, and the alternative labels as a list', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    setup()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'grc')
    const alts = screen.getByRole('textbox', { name: /Variantes ou synonymes/ })
    await user.clear(alts)
    await user.type(alts, 'canis, lupus , Canis')
    await user.clear(screen.getByRole('textbox', { name: /Définition/ }))
    await user.click(save())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ version: 3, language: 'grc', alt_labels: ['canis', 'lupus'], definition: null })
  })

  it('RM-CTB-05: a cleared broader concept is sent as null, URI and label together', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    setup()
    expect(screen.getByText('Canis')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer le concept' }))
    await user.click(save())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ version: 3, broader_concept_uri: null, broader_concept_label: null })
  })

  it('sends nothing and says so when nothing changed', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    const { onClose } = setup()
    await user.click(save())
    expect(await screen.findByText('Aucune modification à enregistrer.')).toBeInTheDocument()
    expect(bodies).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('RM-THE-04: refuses a one-character label with an error summary and no request', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    setup()
    await user.clear(prefLabel())
    await user.type(prefLabel(), 'L')
    await user.click(save())
    expect(await screen.findByText('Le formulaire contient des erreurs')).toBeInTheDocument()
    expect(prefLabel()).toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toEqual([])
  })

  it('RM-CTB-05: a 409 version_conflict shows its message with "Fermer" only; closing reloads the lists', async () => {
    const user = userEvent.setup()
    mockPatch(() => HttpResponse.json({ detail: 'English', code: 'version_conflict' }, { status: 409 }))
    let loads = 0
    function List() {
      useQuery({
        queryKey: contributionKeys.proposalPage({}),
        queryFn: () => {
          loads += 1
          return { items: [], total: 0 }
        },
        staleTime: Infinity,
      })
      return null
    }
    const onClose = vi.fn()
    renderWithProviders(
      <>
        <List />
        <ProposalEditDialog proposal={proposal} onClose={onClose} />
      </>,
    )
    await waitFor(() => expect(loads).toBe(1))
    await user.type(prefLabel(), 's')
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette contribution a changé depuis')
    expect(screen.getByRole('alert')).toHaveTextContent('Fermez cette fenêtre pour recharger la liste.')
    // The focused submit button is gone: the focus must land on the new button (RGAA).
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(loads).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(loads).toBe(2))
  })

  it('RM-CTB-05: sends the version of the moment the dialog opened, not a newer one', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    let reload: (next: ThesaurusProposal) => void = () => undefined
    function Host() {
      const [current, setCurrent] = useState(proposal)
      reload = setCurrent
      return <ProposalEditDialog proposal={current} onClose={() => undefined} />
    }
    renderWithProviders(<Host />)
    await user.type(prefLabel(), 's')
    // The author's list reloaded while the dialog was open (a conflict, another tab).
    act(() => reload({ ...proposal, version: 5, definition: 'Autre' }))
    await user.click(save())
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({ version: 3, pref_label: 'Loups' })
  })

  it('RGAA: every failed submit puts the focus back on the error summary', async () => {
    const user = userEvent.setup()
    const bodies = mockPatch()
    setup()
    await user.clear(prefLabel())
    await user.type(prefLabel(), 'L')
    const summary = () => screen.getByRole('heading', { name: 'Le formulaire contient des erreurs' }).parentElement
    await user.click(save())
    expect(summary()).toHaveFocus()
    // The same errors again, from the button.
    await user.click(save())
    expect(summary()).toHaveFocus()
    expect(bodies).toEqual([])
  })

  it('does not search TheZoo before the user types', () => {
    const requests: string[] = []
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, ({ request }) => {
        requests.push(request.url)
        return HttpResponse.json([])
      }),
    )
    setup()
    expect(requests).toEqual([])
  })

  it('has no accessibility violation', async () => {
    setup()
    await expectNoAxeViolations(document.body)
  })
})
