import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { SESSION, renderWithProviders } from '../features/accounts/components/testSupport'
import { expectNoAxeViolations } from '../test/axe'
import { server } from '../test/server'
import { SaveQueryModal } from './SaveQueryModal'

const saved = { id: 12, title: 'Loups' }

/** Records the bodies sent to `POST /queries` and `PUT /queries/3`. */
function mockWrites(failure?: { status: number; code: string }) {
  const seen: { method: string; body: unknown }[] = []
  const answer = () =>
    failure
      ? HttpResponse.json({ detail: 'English', code: failure.code }, { status: failure.status })
      : HttpResponse.json(saved)
  server.use(
    http.post(`${BASE_URL}/queries`, async ({ request }) => {
      seen.push({ method: 'POST', body: await request.json() })
      return answer()
    }),
    http.put(`${BASE_URL}/queries/3`, async ({ request }) => {
      seen.push({ method: 'PUT', body: await request.json() })
      return answer()
    }),
  )
  return seen
}

/** `session: 'unchecked'` leaves the cache empty, so the session is asked to the server. */
function setup(
  props: { session?: typeof SESSION | null | 'unchecked'; queryId?: number | ''; canUpdate?: boolean } = {},
) {
  const { session = SESSION, queryId = '', canUpdate } = props
  const onClose = vi.fn()
  const onSuccess = vi.fn()
  const view = renderWithProviders(
    <SaveQueryModal
      isOpen
      onClose={onClose}
      onSuccess={onSuccess}
      queryText="SELECT * WHERE { ?s ?p ?o } LIMIT 5"
      initialTitle="Loups"
      queryId={queryId}
      canUpdate={canUpdate}
    />,
    { session: session === 'unchecked' ? undefined : session },
  )
  return { onClose, onSuccess, ...view }
}

const submit = () => screen.getByRole('button', { name: /^(Enregistrer|Mettre à jour)$/ })

describe('SaveQueryModal', () => {
  it('RM-CTB-03: shows a visitor the sign-in prompt and no form', () => {
    setup({ session: null })
    expect(screen.getByText('Connectez-vous pour enregistrer une requête.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
  })

  it('shows a retry, not the sign-in prompt, when the session cannot be checked (rule 9)', async () => {
    const user = userEvent.setup()
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/auth/me`, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ detail: 'down' }, { status: 503 }) : HttpResponse.json(SESSION)
      }),
    )
    setup({ session: 'unchecked' })
    expect(await screen.findByText(/Impossible de vérifier votre session/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('textbox', { name: /Titre de la requête/ })).toBeInTheDocument()
  })

  it('RM-CTB-03: a creation sends no author, whatever the form', async () => {
    const user = userEvent.setup()
    const seen = mockWrites()
    const { onSuccess, onClose } = setup()
    expect(screen.queryByText(/Auteur/)).toBeNull()
    await user.click(submit())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(seen).toEqual([
      {
        method: 'POST',
        body: {
          title: 'Loups',
          query_text: 'SELECT * WHERE { ?s ?p ?o } LIMIT 5',
          category: 'Recherche personnalisée',
        },
      },
    ])
    expect(onSuccess).toHaveBeenCalledWith(12)
  })

  it('RM-QC-06: saves a new query when the selected one cannot be updated', async () => {
    const user = userEvent.setup()
    const seen = mockWrites()
    setup({ queryId: 3, canUpdate: false })
    expect(screen.queryByRole('button', { name: 'Mettre à jour l’existante' })).toBeNull()
    await user.click(submit())
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].method).toBe('POST')
  })

  it('RM-QC-06: updates the selected query when it can be updated, and can still save a copy', async () => {
    const user = userEvent.setup()
    const seen = mockWrites()
    const first = setup({ queryId: 3, canUpdate: true })
    expect(screen.getByRole('button', { name: 'Mettre à jour l’existante' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(submit())
    await waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]).toMatchObject({ method: 'PUT', body: { title: 'Loups' } })
    first.unmount()

    setup({ queryId: 3, canUpdate: true })
    await user.click(screen.getByRole('button', { name: 'Créer une nouvelle copie' }))
    await user.click(submit())
    await waitFor(() => expect(seen).toHaveLength(2))
    expect(seen[1].method).toBe('POST')
  })

  it('shows the translated refusal of the backend and stays open', async () => {
    const user = userEvent.setup()
    mockWrites({ status: 403, code: 'builtin_query' })
    const { onClose } = setup({ queryId: 3, canUpdate: true })
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('question de compétence native')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('refuses an empty title with an error summary and no request', async () => {
    const user = userEvent.setup()
    const seen = mockWrites()
    setup()
    await user.clear(screen.getByRole('textbox', { name: /Titre de la requête/ }))
    await user.click(submit())
    expect(await screen.findByText('Le formulaire contient des erreurs')).toBeInTheDocument()
    expect(seen).toEqual([])
  })

  it('RGAA: a second identical failed submit puts the focus back on the error summary', async () => {
    const user = userEvent.setup()
    mockWrites()
    setup()
    await user.clear(screen.getByRole('textbox', { name: /Titre de la requête/ }))
    const summary = () => screen.getByRole('heading', { name: 'Le formulaire contient des erreurs' }).parentElement
    await user.click(submit())
    expect(summary()).toHaveFocus()
    // The same failure again, from the button: the summary must take the focus again.
    await user.click(submit())
    expect(summary()).toHaveFocus()
  })

  it('has no accessibility violation', async () => {
    setup({ queryId: 3, canUpdate: true })
    await expectNoAxeViolations(document.body)
  })
})
