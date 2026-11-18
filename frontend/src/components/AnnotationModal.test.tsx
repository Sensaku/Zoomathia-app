import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { SESSION } from '../features/accounts/components/testSupport'
import { SESSION_KEY } from '../features/accounts/session'
import { contributionKeys } from '../features/contributions'
import { I18nProvider } from '../i18n'
import { expectNoAxeViolations } from '../test/axe'
import { createTestQueryClient } from '../test/queryClient'
import { server } from '../test/server'
import { AnnotationModal } from './AnnotationModal'

/** `signedIn` seeds the session; `undefined` leaves the cache empty, so `/auth/me` is asked. */
function setup(signedIn: boolean | undefined, extra?: ReactNode) {
  localStorage.setItem('zoomathia_lang', 'fr')
  const client = createTestQueryClient()
  if (signedIn !== undefined) client.setQueryData(SESSION_KEY, signedIn ? SESSION : null)
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter>
          {extra}
          <AnnotationModal
            isOpen
            onClose={() => {}}
            paragraphUri="p1"
            targetText="le lion rugit"
            startOffset={3}
            endOffset={16}
          />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  )
}

describe('AnnotationModal', () => {
  it('RM-CTB-03: a visitor sees the sign-in prompt and no form', async () => {
    const { container } = setup(false)
    expect(screen.getByText('Connectez-vous pour annoter ce passage.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    await expectNoAxeViolations(container)
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
    expect(await screen.findByRole('button', { name: /Enregistrer l.annotation/ })).toBeInTheDocument()
  })

  it('RM-CTB-03: a signed-in user has no name field and the request carries no author name or status', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | undefined
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () =>
        HttpResponse.json([{ label: 'Lion', uri: 'http://thezoo/lion', identifier: 'lion' }]),
      ),
      http.post(`${BASE_URL}/annotations`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    setup(true)
    // The concept search and the justification: no name field any more.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    await user.type(screen.getByPlaceholderText(/canis/), 'lio')
    await user.click(await screen.findByRole('button', { name: /Lion/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer l.annotation/ }))
    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({ paragraph_uri: 'p1', concept_uri: 'http://thezoo/lion', concept_label: 'Lion' })
    expect(Object.keys(body ?? {})).not.toContain('annotator_name')
    expect(Object.keys(body ?? {})).not.toContain('status')
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
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () =>
        HttpResponse.json([{ label: 'Lion', uri: 'http://thezoo/lion', identifier: 'lion' }]),
      ),
      http.post(`${BASE_URL}/annotations`, () => HttpResponse.json({ id: 1 }, { status: 201 })),
    )
    setup(true, <List />)
    await waitFor(() => expect(loads).toBe(1))
    await user.type(screen.getByPlaceholderText(/canis/), 'lio')
    await user.click(await screen.findByRole('button', { name: /Lion/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer l.annotation/ }))
    await waitFor(() => expect(loads).toBe(2))
  })
})
