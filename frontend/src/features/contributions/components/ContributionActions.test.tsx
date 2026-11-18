import { useQuery } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { useState } from 'react'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { expectNoAxeViolations } from '../../../test/axe'
import { createTestQueryClient } from '../../../test/queryClient'
import { server } from '../../../test/server'
import type { ContributionAction } from '../../../types'
import { contributionKeys } from '../queryKeys'
import { ContributionActions } from './ContributionActions'
import { renderWithProviders } from './renderWithProviders'

function setup(
  options: {
    kind?: 'annotation' | 'proposal'
    actions?: ContributionAction[]
    onEdit?: () => void
  } = {},
) {
  const { kind = 'annotation', actions = ['review', 'edit', 'delete'], onEdit } = options
  const client = createTestQueryClient()
  let listLoads = 0
  function Harness() {
    // Stands for a list on screen: a conflict must reload it.
    useQuery({
      queryKey: contributionKeys.annotationPage({}),
      queryFn: () => {
        listLoads += 1
        return { items: [], total: 0 }
      },
      staleTime: Infinity,
    })
    return (
      <ContributionActions
        kind={kind}
        subject="Lion"
        onEdit={onEdit}
        contribution={{ id: 7, version: 3, allowed_actions: actions }}
      />
    )
  }
  const view = renderWithProviders(<Harness />, { client })
  return { ...view, loads: () => listLoads }
}

/** Actions whose `version` prop can change while a dialog is open, as after a list reload. */
function hostWithVersion() {
  const host = { setVersion: (_version: number) => {}, Host: () => <></> }
  host.Host = function Host() {
    const [version, setVersion] = useState(3)
    host.setVersion = setVersion
    return (
      <ContributionActions
        kind="annotation"
        subject="Lion"
        contribution={{ id: 7, version, allowed_actions: ['review'] }}
      />
    )
  }
  return host
}

/** Records the body of a request to `url`. */
function capture(method: 'post' | 'delete', path: string, status = 200) {
  const seen: { body?: unknown; calls: number } = { calls: 0 }
  server.use(
    http[method](`${BASE_URL}${path}`, async ({ request }) => {
      seen.calls += 1
      seen.body = method === 'post' ? await request.json() : undefined
      return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json({ id: 7 })
    }),
  )
  return seen
}

describe('ContributionActions', () => {
  it('RM-MOD-01: shows only the allowed buttons, each named with the subject', async () => {
    const { container } = setup({ actions: ['review'] })
    expect(screen.getByRole('button', { name: 'Valider: Lion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rejeter: Lion' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    await expectNoAxeViolations(container)
  })

  it('shows delete alone, and edit only when onEdit is given', async () => {
    const user = userEvent.setup()
    const first = setup({ actions: ['delete', 'edit'] })
    expect(screen.getByRole('button', { name: 'Supprimer: Lion' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
    first.unmount()

    let edits = 0
    setup({ actions: ['edit'], onEdit: () => (edits += 1) })
    await user.click(screen.getByRole('button', { name: 'Modifier: Lion' }))
    expect(edits).toBe(1)
  })

  it('shows nothing when there is no allowed action', () => {
    setup({ actions: [] })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('RM-MOD-06: validate asks for confirmation, then sends the current version', async () => {
    const user = userEvent.setup()
    const seen = capture('post', '/annotations/7/review')
    setup()
    await user.click(screen.getByRole('button', { name: 'Valider: Lion' }))
    expect(screen.getByRole('dialog', { name: 'Valider « Lion » ?' })).toHaveTextContent('définitive')
    expect(seen.calls).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(seen.body).toEqual({ version: 3, decision: 'validated' })
  })

  it('RM-MOD-03: an empty or blank reason shows the summary and sends nothing', async () => {
    const user = userEvent.setup()
    const seen = capture('post', '/annotations/7/review')
    setup()
    await user.click(screen.getByRole('button', { name: 'Rejeter: Lion' }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('textbox', { name: /Motif du rejet/ })).toHaveFocus()
    expect(dialog).toHaveTextContent('Le motif sera public')
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '2000')

    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(screen.getByRole('heading', { name: 'Le rejet ne peut pas être envoyé' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInvalid()
    await user.type(screen.getByRole('textbox'), '   ')
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(screen.getByRole('heading', { name: 'Le rejet ne peut pas être envoyé' })).toBeInTheDocument()
    expect(seen.calls).toBe(0)
    await expectNoAxeViolations(dialog)
  })

  it('RGAA: every blank submit of the reject dialog puts the focus back on the error summary', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Rejeter: Lion' }))
    const summary = () => screen.getByRole('heading', { name: 'Le rejet ne peut pas être envoyé' }).parentElement
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(summary()).toHaveFocus()
    // The same failure again, from the button: the summary must take the focus again.
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(summary()).toHaveFocus()
  })

  it('RM-MOD-03: rejecting with a reason sends the trimmed reason and the version', async () => {
    const user = userEvent.setup()
    const seen = capture('post', '/annotations/7/review')
    setup()
    await user.click(screen.getByRole('button', { name: 'Rejeter: Lion' }))
    await user.type(screen.getByRole('textbox'), '  Hors sujet  ')
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(seen.body).toEqual({ version: 3, decision: 'rejected', reason: 'Hors sujet' })
  })

  it('RM-MOD-05: delete asks for confirmation, then calls DELETE', async () => {
    const user = userEvent.setup()
    const seen = capture('delete', '/annotations/7', 204)
    setup()
    await user.click(screen.getByRole('button', { name: 'Supprimer: Lion' }))
    expect(seen.calls).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(seen.calls).toBe(1)
  })

  it('does not call the API when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const seen = capture('delete', '/annotations/7', 204)
    setup()
    await user.click(screen.getByRole('button', { name: 'Supprimer: Lion' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(seen.calls).toBe(0)
  })

  it('RM-CTB-05: a 409 version_conflict leaves only "Fermer"; closing it reloads the list', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/annotations/7/review`, () =>
        HttpResponse.json({ detail: 'English', code: 'version_conflict' }, { status: 409 }),
      ),
    )
    const { loads } = setup()
    await waitFor(() => expect(loads()).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Valider: Lion' }))
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    const dialog = await screen.findByRole('dialog')
    expect(await screen.findByRole('alert')).toHaveTextContent(/a changé depuis/)
    expect(dialog).toContainElement(screen.getByRole('alert'))
    // No retry: the confirm button is gone, and nothing reloaded yet.
    expect(within(dialog).queryByRole('button', { name: 'Valider' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(loads()).toBe(1)
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(loads()).toBe(2))
  })

  it('RM-MOD-02: a 409 not_pending on a rejection also ends on "Fermer" only', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/annotations/7/review`, () =>
        HttpResponse.json({ detail: 'English', code: 'not_pending' }, { status: 409 }),
      ),
    )
    const { loads } = setup()
    await waitFor(() => expect(loads()).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Rejeter: Lion' }))
    await user.type(screen.getByRole('textbox'), 'Hors sujet')
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    const dialog = await screen.findByRole('dialog')
    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà été relue/)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Rejeter' })).toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(loads()).toBe(2))
  })

  it('RM-CTB-05: a conflict on a deletion also ends on "Fermer" only', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(`${BASE_URL}/annotations/7`, () =>
        HttpResponse.json({ detail: 'English', code: 'version_conflict' }, { status: 409 }),
      ),
    )
    setup()
    await user.click(screen.getByRole('button', { name: 'Supprimer: Lion' }))
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('dialog')
    expect(await screen.findByRole('alert')).toHaveTextContent(/a changé depuis/)
    expect(within(dialog).queryByRole('button', { name: 'Supprimer' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it.each([
    ['delete', 'annotation', 409, 'validated_contribution', /validée ne peut pas être supprimée/],
    ['review', 'annotation', 404, 'annotation_not_found', /annotation n'existe plus/],
    ['review', 'proposal', 404, 'proposal_not_found', /proposition n'existe plus/],
  ] as const)(
    'RM-MOD-05: %s (%s) answered %i %s ends on "Fermer" only and reloads the list',
    async (action, kind, status, code, message) => {
      const user = userEvent.setup()
      const url = kind === 'annotation' ? '/annotations/7' : '/thesaurus/proposals/7'
      const answer = () => HttpResponse.json({ detail: 'English', code }, { status })
      server.use(
        action === 'delete' ? http.delete(`${BASE_URL}${url}`, answer) : http.post(`${BASE_URL}${url}/review`, answer),
      )
      const { loads } = setup({ kind })
      await waitFor(() => expect(loads()).toBe(1))
      const [open, confirm] = action === 'delete' ? ['Supprimer: Lion', 'Supprimer'] : ['Valider: Lion', 'Valider']
      await user.click(screen.getByRole('button', { name: open }))
      await user.click(screen.getByRole('button', { name: confirm }))
      const dialog = await screen.findByRole('dialog', { name: 'Action non effectuée' })
      expect(within(dialog).getByRole('alert')).toHaveTextContent(message)
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Fermez cette fenêtre pour recharger la liste.')
      expect(within(dialog).queryByRole('button', { name: confirm })).toBeNull()
      await user.click(within(dialog).getByRole('button', { name: 'Fermer' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(loads()).toBe(2))
    },
  )

  it('RM-CTB-05: the message stays visible when a reload would remove the item, until "Fermer"', async () => {
    const user = userEvent.setup()
    server.use(
      http.post(`${BASE_URL}/annotations/7/review`, () =>
        HttpResponse.json({ detail: 'English', code: 'not_pending' }, { status: 409 }),
      ),
    )
    // A pending tab: once reviewed elsewhere, the item is no longer in the list.
    let reviewedElsewhere = false
    function PendingTab() {
      const list = useQuery({
        queryKey: contributionKeys.annotationPage({ status: 'pending' }),
        queryFn: () => ({ items: reviewedElsewhere ? [] : [{ id: 7, version: 3 }], total: 1 }),
        staleTime: Infinity,
      })
      return (
        <>
          {list.data?.items.map((item) => (
            <ContributionActions
              key={item.id}
              kind="annotation"
              subject="Lion"
              contribution={{ id: item.id, version: item.version, allowed_actions: ['review'] }}
            />
          ))}
          <p>{list.data?.items.length ?? '?'} en attente</p>
        </>
      )
    }
    renderWithProviders(<PendingTab />)
    await user.click(await screen.findByRole('button', { name: 'Valider: Lion' }))
    reviewedElsewhere = true
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/déjà été relue/)
    // Give a (wrong) automatic reload the time to remove the card, and the dialog with it.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.getByRole('alert')).toBe(alert)
    expect(screen.getByText('1 en attente')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(await screen.findByText('0 en attente')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('RM-CTB-05: validating sends the version of the moment the dialog opened, not a newer one', async () => {
    const user = userEvent.setup()
    const seen = capture('post', '/annotations/7/review')
    const host = hostWithVersion()
    renderWithProviders(<host.Host />)
    await user.click(screen.getByRole('button', { name: 'Valider: Lion' }))
    // The author edited the content and the list reloaded while the dialog was open.
    act(() => host.setVersion(4))
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(seen.calls).toBe(1))
    expect(seen.body).toEqual({ version: 3, decision: 'validated' })
  })

  it('RM-CTB-05: a rejection sends the version of the moment the reject dialog opened', async () => {
    const user = userEvent.setup()
    const seen = capture('post', '/annotations/7/review')
    const host = hostWithVersion()
    renderWithProviders(<host.Host />)
    await user.click(screen.getByRole('button', { name: 'Rejeter: Lion' }))
    act(() => host.setVersion(4))
    await user.type(screen.getByRole('textbox'), 'Hors sujet')
    await user.click(screen.getByRole('button', { name: 'Rejeter' }))
    await waitFor(() => expect(seen.calls).toBe(1))
    expect(seen.body).toEqual({ version: 3, decision: 'rejected', reason: 'Hors sujet' })
  })

  it('a refusal (403 not_author) shows its message in the dialog too', async () => {
    const user = userEvent.setup()
    server.use(
      http.delete(`${BASE_URL}/annotations/7`, () =>
        HttpResponse.json({ detail: 'English', code: 'not_author' }, { status: 403 }),
      ),
    )
    setup()
    await user.click(screen.getByRole('button', { name: 'Supprimer: Lion' }))
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a proposal uses the /thesaurus/proposals routes', async () => {
    const user = userEvent.setup()
    const review = capture('post', '/thesaurus/proposals/7/review')
    const removal = capture('delete', '/thesaurus/proposals/7', 204)
    setup({ kind: 'proposal' })
    await user.click(screen.getByRole('button', { name: 'Valider: Lion' }))
    await user.click(screen.getByRole('button', { name: 'Valider' }))
    await waitFor(() => expect(review.calls).toBe(1))
    expect(review.body).toEqual({ version: 3, decision: 'validated' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Supprimer: Lion' }))
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(removal.calls).toBe(1))
  })
})
