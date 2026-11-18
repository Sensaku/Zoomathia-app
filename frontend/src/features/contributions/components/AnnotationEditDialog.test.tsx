import { useQuery } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../../../api/client'
import { expectNoAxeViolations } from '../../../test/axe'
import { server } from '../../../test/server'
import { contributionKeys } from '../queryKeys'
import { AnnotationEditDialog } from './AnnotationEditDialog'
import { renderWithProviders } from './renderWithProviders'

const annotation = {
  id: 7,
  version: 3,
  concept_uri: 'http://thezoo/lion',
  concept_label: 'Lion',
  justification: 'Texte clair',
}

/** Records the body of every PATCH on the annotation; answers 200 or the given failure. */
function mockPatch(failure?: { status: number; code: string; detail: string }) {
  const seen: { bodies: unknown[] } = { bodies: [] }
  server.use(
    http.patch(`${BASE_URL}/annotations/7`, async ({ request }) => {
      seen.bodies.push(await request.json())
      if (failure) return HttpResponse.json({ detail: failure.detail, code: failure.code }, { status: failure.status })
      return HttpResponse.json({ id: 7 })
    }),
  )
  return seen
}

function setup(onClose = vi.fn()) {
  const view = renderWithProviders(<AnnotationEditDialog annotation={annotation} onClose={onClose} />)
  return { onClose, ...view }
}

describe('AnnotationEditDialog', () => {
  it('RM-CTB-05: a justification-only edit sends the version and the justification, nothing else', async () => {
    const user = userEvent.setup()
    const seen = mockPatch()
    const { onClose } = setup()
    const field = screen.getByRole('textbox', { name: /Justification/ })
    expect(field).toHaveValue('Texte clair')
    expect(field).toHaveAttribute('maxlength', '5000')
    await user.clear(field)
    await user.type(field, 'Nouvelle')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(seen.bodies).toEqual([{ version: 3, justification: 'Nouvelle' }])
  })

  it('clearing the justification sends null', async () => {
    const user = userEvent.setup()
    const seen = mockPatch()
    setup()
    await user.clear(screen.getByRole('textbox', { name: /Justification/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(seen.bodies).toHaveLength(1))
    expect(seen.bodies[0]).toEqual({ version: 3, justification: null })
  })

  it('RM-CTB-05: a new concept sends its URI and its label together, without the justification', async () => {
    const user = userEvent.setup()
    const seen = mockPatch()
    server.use(
      http.get(`${BASE_URL}/thesaurus/autocomplete`, () =>
        HttpResponse.json([{ label: 'Lionne', uri: 'http://thezoo/lionne', identifier: 'lionne' }]),
      ),
    )
    setup()
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un concept' }), 'lio')
    await user.click(await screen.findByRole('button', { name: 'Lionne' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(seen.bodies).toHaveLength(1))
    expect(seen.bodies[0]).toEqual({
      version: 3,
      concept_uri: 'http://thezoo/lionne',
      concept_label: 'Lionne',
    })
  })

  it('sends no request and says so when nothing changed', async () => {
    const user = userEvent.setup()
    const seen = mockPatch()
    const { onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByText(/Rien n.a changé/)).toBeInTheDocument()
    expect(seen.bodies).toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('RM-CTB-05: a version conflict shows its message with "Fermer" only; closing reloads the lists', async () => {
    const user = userEvent.setup()
    mockPatch({ status: 409, code: 'version_conflict', detail: 'Version conflict' })
    let loads = 0
    function List() {
      useQuery({
        queryKey: contributionKeys.annotationPage({}),
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
        <AnnotationEditDialog annotation={annotation} onClose={onClose} />
      </>,
    )
    await waitFor(() => expect(loads).toBe(1))
    await user.type(screen.getByRole('textbox', { name: /Justification/ }), ' encore')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('Version conflict')
    expect(alert).toHaveTextContent(/a changé depuis/)
    expect(alert).toHaveTextContent('Fermez cette fenêtre pour recharger la liste.')
    // The focused submit button is gone: the focus must land on the new button (RGAA).
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus()
    // No retry on content the user has not read, and no reload before the user closes it.
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(loads).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(loads).toBe(2))
  })

  it('RM-CTB-05: sends the version and compares with the values of the moment the dialog opened', async () => {
    const user = userEvent.setup()
    const seen = mockPatch()
    let reload: (next: typeof annotation) => void = () => undefined
    function Host() {
      const [current, setCurrent] = useState(annotation)
      reload = setCurrent
      return <AnnotationEditDialog annotation={current} onClose={() => undefined} />
    }
    renderWithProviders(<Host />)
    // Another tab changed the concept and the list reloaded while this dialog was open.
    act(() => reload({ ...annotation, version: 4, concept_uri: 'http://thezoo/tigre', concept_label: 'Tigre' }))
    await user.type(screen.getByRole('textbox', { name: /Justification/ }), ' encore')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(seen.bodies).toHaveLength(1))
    // The old version (so the server answers with a conflict) and no concept: nothing reverts Tigre.
    expect(seen.bodies[0]).toEqual({ version: 3, justification: 'Texte clair encore' })
  })

  it('has no accessibility violation', async () => {
    setup()
    await expectNoAxeViolations(document.body)
  })
})
