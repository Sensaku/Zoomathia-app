import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { ComponentProps, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { SESSION } from '../../accounts/components/testSupport'
import { SESSION_KEY } from '../../accounts/session'
import { contributionKeys } from '../queryKeys'
import { I18nProvider } from '../../../i18n'
import { expectNoAxeViolations } from '../../../test/axe'
import { createTestQueryClient } from '../../../test/queryClient'
import { server } from '../../../test/server'
import { AnnotationCreateDialog } from './AnnotationCreateDialog'

type ModalProps = Partial<ComponentProps<typeof AnnotationCreateDialog>>

const LION = [{ label: 'Lion', uri: 'http://thezoo/lion', identifier: 'lion' }]
const SEARCH = /Rechercher un concept/
const SAVE = /Enregistrer l.annotation/

/** `signedIn` seeds the session; `undefined` leaves the cache empty, so `/auth/me` is asked. */
function setup(signedIn: boolean | undefined, extra?: ReactNode, props: ModalProps = {}) {
  localStorage.setItem('zoomathia_lang', 'fr')
  const client = createTestQueryClient()
  if (signedIn !== undefined) client.setQueryData(SESSION_KEY, signedIn ? SESSION : null)
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter>
          {extra}
          <AnnotationCreateDialog
            open
            onClose={() => {}}
            paragraphUri="p1"
            targetText="le lion rugit"
            startOffset={3}
            endOffset={16}
            {...props}
          />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('AnnotationCreateDialog', () => {
  it('RM-CTB-03: a visitor sees the sign-in prompt and no form', async () => {
    setup(false)
    expect(screen.getByText('Connectez-vous pour annoter ce passage.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    await expectNoAxeViolations(document.body)
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
    setup(undefined)
    expect(await screen.findByText(/Impossible de vérifier votre session/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Se connecter' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('button', { name: SAVE })).toBeInTheDocument()
  })

  it('RM-CTB-03: a signed-in user has no name field and the request carries no author name or status', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | undefined
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json(LION)),
      http.post(`${BASE_URL}/annotations`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    setup(true)
    // The concept search and the justification: no name field any more.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    await user.type(screen.getByRole('textbox', { name: SEARCH }), 'lio')
    await user.click(await screen.findByRole('button', { name: /Lion/ }))
    await user.click(screen.getByRole('button', { name: SAVE }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({ paragraph_uri: 'p1', concept_uri: 'http://thezoo/lion', concept_label: 'Lion' })
    expect(Object.keys(body ?? {})).not.toContain('annotator_name')
    expect(Object.keys(body ?? {})).not.toContain('status')
  })

  it('RM-CTB-03: the payload carries the exact selection of the props, no author and no status', async () => {
    const user = userEvent.setup()
    let body: unknown
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json(LION)),
      http.post(`${BASE_URL}/annotations`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    setup(true, undefined, {
      endParagraphUri: 'p3',
      targetParagraphs: ['p1', 'p2', 'p3'],
      targetParagraphDetails: [
        { uri: 'p1', id: '1', text: 'Un' },
        { uri: 'p2', id: '2', text: 'Deux' },
        { uri: 'p3', id: '3', text: 'Trois' },
      ],
    })
    expect(screen.getByText('3 paragraphes')).toBeInTheDocument()
    expect(screen.getByText('§ 2')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: SEARCH }), 'lio')
    await user.click(await screen.findByRole('button', { name: /Lion/ }))
    await user.type(screen.getByRole('textbox', { name: /Justification/ }), '  Voir Pline.  ')
    await user.click(screen.getByRole('button', { name: SAVE }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body).toEqual({
      paragraph_uri: 'p1',
      target_text: 'le lion rugit',
      start_offset: 3,
      end_offset: 16,
      concept_uri: 'http://thezoo/lion',
      concept_label: 'Lion',
      justification: 'Voir Pline.',
      scope_type: 'multi_paragraph',
      end_paragraph_uri: 'p3',
      target_paragraphs: ['p1', 'p2', 'p3'],
    })
  })

  it('reloads the annotation lists after a creation (the new annotation is pending)', async () => {
    const user = userEvent.setup()
    let loads = 0
    function List() {
      useQuery({
        queryKey: contributionKeys.annotationPage({ mine: true }),
        queryFn: () => {
          loads += 1
          return { items: [], total: 0 }
        },
        staleTime: Infinity,
      })
      return null
    }
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json(LION)),
      http.post(`${BASE_URL}/annotations`, () => HttpResponse.json({ id: 1 }, { status: 201 })),
    )
    setup(true, <List />)
    await waitFor(() => expect(loads).toBe(1))
    await user.type(screen.getByRole('textbox', { name: SEARCH }), 'lio')
    await user.click(await screen.findByRole('button', { name: /Lion/ }))
    await user.click(screen.getByRole('button', { name: SAVE }))
    await waitFor(() => expect(loads).toBe(2))
  })

  it('submitting without a concept shows the error summary and sends nothing', async () => {
    const user = userEvent.setup()
    let posted = false
    server.use(
      http.post(`${BASE_URL}/annotations`, () => {
        posted = true
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    setup(true)
    await user.click(screen.getByRole('button', { name: SAVE }))
    await user.click(await screen.findByRole('link', { name: /Choisissez un concept/ }))
    expect(screen.getByRole('textbox', { name: SEARCH })).toHaveFocus()
    expect(posted).toBe(false)
  })

  it('rule 9: a failed concept search shows an error, not an empty list', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () => HttpResponse.json({ detail: 'down' }, { status: 503 })),
    )
    setup(true)
    await user.type(screen.getByRole('textbox', { name: SEARCH }), 'lio')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucun concept trouvé.')).toBeNull()
  })

  it('creating a concept on the fly selects it, and the annotation uses it', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | undefined
    let proposal: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/thesaurus/proposals`, async ({ request }) => {
        proposal = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 7, pref_label: 'le lion rugit' }, { status: 201 })
      }),
      http.post(`${BASE_URL}/annotations`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    setup(true)
    const toggle = screen.getByRole('button', { name: 'Ajouter un concept' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Prefilled from the selection, Latin by default.
    expect(screen.getByRole('textbox', { name: /Terme préférentiel/ })).toHaveValue('le lion rugit')
    await user.click(screen.getByRole('button', { name: 'Créer le concept' }))
    expect(await screen.findByText('Nouveau concept')).toBeInTheDocument()
    expect(proposal).toMatchObject({ pref_label: 'le lion rugit', language: 'la', alt_labels: [] })
    expect(screen.queryByRole('button', { name: 'Créer le concept' })).toBeNull()
    await user.click(screen.getByRole('button', { name: SAVE }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({
      concept_uri: 'http://zoomathia.i3s.unice.fr/concept/proposal/7',
      concept_label: 'le lion rugit',
    })
  })

  it('a new concept with a too short term shows the field error and sends nothing', async () => {
    const user = userEvent.setup()
    let posted = false
    server.use(
      http.post(`${BASE_URL}/thesaurus/proposals`, () => {
        posted = true
        return HttpResponse.json({ id: 1, pref_label: 'x' }, { status: 201 })
      }),
    )
    setup(true, undefined, { targetText: 'x', endOffset: 4 })
    await user.click(screen.getByRole('button', { name: 'Ajouter un concept' }))
    await user.click(screen.getByRole('button', { name: 'Créer le concept' }))
    expect(await screen.findByText(/2 caractères au moins/)).toBeInTheDocument()
    expect(posted).toBe(false)
  })

  it('has no accessibility violation once signed in', async () => {
    setup(true)
    await expectNoAxeViolations(document.body)
  })
})
