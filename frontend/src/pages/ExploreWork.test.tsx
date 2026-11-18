import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { LocationProbe, SESSION, renderWithProviders } from '../features/accounts/components/testSupport'
import { server } from '../test/server'
import type { Paragraph, SectionAnnotationsResponse, SummaryNode, Work } from '../types'
import { ExploreWork } from './ExploreWork'

const WORK = 'http://z/work1'
const OTHER_WORK = 'http://z/work2'
const CHAPTER = `${WORK}/book1/ch1`
const P1 = `${CHAPTER}/p1`
const P2 = `${CHAPTER}/p2`

const works: Work[] = [
  { uri: WORK, title: 'Historia naturalis', author: 'Pline', language: 'la' },
  { uri: OTHER_WORK, title: 'Physiologus', author: 'Anonyme', language: 'la' },
]
const summary: SummaryNode[] = [
  {
    uri: `${WORK}/book1`,
    id: '1',
    title: 'Livre un',
    type: 'book',
    children: [{ uri: CHAPTER, id: '1', title: 'Chapitre un', type: 'chapter', children: [] }],
  },
]
const paragraphs: Paragraph[] = [
  { uri: P1, id: '1', text: 'Le lion rugit dans la savane.' },
  { uri: P2, id: '2', text: 'Le loup hurle.' },
]
const sectionAnnotations: SectionAnnotationsResponse = {
  section_uri: CHAPTER,
  paragraph_count: 2,
  reference_annotations: {
    [P1]: {
      lion: {
        concept: 'http://thezoo/lion',
        label: 'LION',
        type: 'http://www.w3.org/ns/oa#Annotation',
        offset: [{ start: 3, end: 7 }],
      },
    },
  },
  staged_annotations: [],
}

/** Answers the catalogue and the structure of one work; each part can be replaced by a test. */
function mockReader(
  overrides: {
    section?: () => Response | Promise<Response>
    paragraphs?: () => Response
    resolve?: () => Response | Promise<Response>
  } = {},
) {
  server.use(
    http.get(`${BASE_URL}/getWorks`, () => HttpResponse.json(works)),
    http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([{ name: 'Pline' }, { name: 'Anonyme' }])),
    http.get(
      `${BASE_URL}/resolveUri`,
      () =>
        overrides.resolve?.() ?? HttpResponse.json({ type: 'paragraph', work: WORK, section: CHAPTER, paragraph: P1 }),
    ),
    http.get(`${BASE_URL}/getSummary`, () => HttpResponse.json(summary)),
    http.get(`${BASE_URL}/getTranslation`, () => HttpResponse.json(null)),
    http.get(`${BASE_URL}/getParagraphs`, () => overrides.paragraphs?.() ?? HttpResponse.json(paragraphs)),
    http.get(`${BASE_URL}/annotations/section`, () => overrides.section?.() ?? HttpResponse.json(sectionAnnotations)),
  )
}

/** A stand-in for the browser Back button. */
function BackButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      test-back
    </button>
  )
}

function setup(route: string) {
  return renderWithProviders(
    <>
      <ExploreWork />
      <LocationProbe />
      <BackButton />
    </>,
    { route, session: SESSION },
  )
}

describe('ExploreWork', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    // jsdom has no layout: the page scrolls to the target paragraph.
    scrollIntoView.mockClear()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  it('opening a paragraph URL selects the work, the section and the paragraph', async () => {
    mockReader()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    expect(await screen.findByRole('button', { name: /^§ 1/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Chapitre un' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /^§ 2/ })).not.toHaveAttribute('aria-current')
    // The panel shows the annotations of the paragraph.
    expect(await screen.findByRole('button', { name: 'lion' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(WORK)
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Pline')
  })

  it('the author and work selects have names, and the text size buttons say which one is pressed', async () => {
    mockReader()
    setup('/explore-work')

    expect(await screen.findByRole('combobox', { name: 'Auteur' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toBeInTheDocument()
    const sizes = screen.getByRole('group', { name: 'Taille :' })
    expect(within(sizes).getByRole('button', { name: 'A+' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sizes).getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('choosing an author selects its first work, writes it in the URL, keeps pending=1 and does not apply the old link again', async () => {
    mockReader()
    const user = userEvent.setup()
    setup(`/explore-work?pending=1&uri=${encodeURIComponent(P1)}`)
    await screen.findByRole('button', { name: /^§ 1/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'Anonyme')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(encodeURIComponent(OTHER_WORK)))
    expect(screen.getByTestId('location')).toHaveTextContent('pending=1')
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(OTHER_WORK)
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Anonyme')
  })

  it('choosing an author without works clears the work', async () => {
    mockReader()
    server.use(http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([{ name: 'Pline' }, { name: 'Sans œuvre' }])))
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)
    await screen.findByRole('button', { name: /^§ 1/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'Sans œuvre')

    expect(await screen.findByText('Aucune œuvre sélectionnée')).toBeInTheDocument()
    expect(screen.getByTestId('location')).not.toHaveTextContent('uri=')
  })

  it('going back to a paragraph link scrolls to the paragraph again', async () => {
    mockReader()
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))

    // The author select moves to that author's first work (the work select lists the current author only).
    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'Anonyme')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(encodeURIComponent(OTHER_WORK)))
    await user.click(screen.getByRole('button', { name: 'test-back' }))

    expect(await screen.findByRole('button', { name: /^§ 1/ })).toHaveAttribute('aria-current', 'true')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2))
  })

  it('a link whose resolution has no section still marks the chapter of the paragraph', async () => {
    mockReader({ resolve: () => HttpResponse.json({ type: 'paragraph', work: WORK, paragraph: P1 }) })
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    expect(await screen.findByRole('button', { name: 'Chapitre un' })).toHaveAttribute('aria-current', 'true')
    expect(await screen.findByRole('button', { name: /^§ 1/ })).toHaveAttribute('aria-current', 'true')
  })

  it('before the resolution answers, the work select already shows the work of the link', async () => {
    mockReader({
      resolve: async () => {
        await delay('infinite')
        return HttpResponse.json(null)
      },
    })
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(WORK))
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Pline')
  })

  it('choosing "Tous les auteurs" with a work selected keeps the author of that work', async () => {
    mockReader()
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)
    await screen.findByRole('button', { name: /^§ 1/ })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), '')

    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Pline')
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(WORK)
  })

  it('a chapter click clears the active paragraph', async () => {
    mockReader()
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)
    expect(await screen.findByRole('button', { name: /^§ 1/ })).toHaveAttribute('aria-current', 'true')

    await user.click(screen.getByRole('button', { name: 'Chapitre un' }))

    expect(screen.getByRole('button', { name: /^§ 1/ })).not.toHaveAttribute('aria-current')
  })

  it('rule 9: a failed works list shows the alert only, not "Aucune œuvre sélectionnée"', async () => {
    mockReader()
    server.use(http.get(`${BASE_URL}/getWorks`, () => HttpResponse.json({ detail: 'down' }, { status: 502 })))
    setup('/explore-work')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucune œuvre sélectionnée')).not.toBeInTheDocument()
  })

  it('while the works list loads, the page shows the loader, not "Aucune œuvre sélectionnée"', async () => {
    mockReader()
    server.use(http.get(`${BASE_URL}/getWorks`, async () => delay('infinite')))
    setup('/explore-work')

    expect(await screen.findByText('Chargement en cours...')).toBeInTheDocument()
    expect(screen.queryByText(/Résolution sémantique/)).not.toBeInTheDocument()
    expect(screen.queryByText('Aucune œuvre sélectionnée')).not.toBeInTheDocument()
  })

  it('rule 9: a failed section shows the alert instead of the annotations, and the retry loads them', async () => {
    let failing = true
    mockReader({
      section: () =>
        failing ? HttpResponse.json({ detail: 'down' }, { status: 502 }) : HttpResponse.json(sectionAnnotations),
    })
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    const alert = await screen.findByRole('alert')
    expect(screen.queryByText('Aucune annotation de référence sur ce paragraphe.')).not.toBeInTheDocument()
    expect(screen.queryByText('0 concept(s)')).not.toBeInTheDocument()

    failing = false
    await user.click(within(alert.parentElement as HTMLElement).getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByRole('button', { name: 'lion' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rule 9: failed paragraphs show the alert, not "Aucun paragraphe"', async () => {
    mockReader({ paragraphs: () => HttpResponse.json({ detail: 'down' }, { status: 502 }) })
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Aucun paragraphe trouvé pour cette section.')).not.toBeInTheDocument()
    expect(screen.queryByText('Aucun paragraphe')).not.toBeInTheDocument()
    expect(screen.getByText('Paragraphes indisponibles.')).toBeInTheDocument()
  })

  it('following a reference annotation is a toggle that exposes aria-pressed', async () => {
    mockReader()
    const user = userEvent.setup()
    setup(`/explore-work?uri=${encodeURIComponent(P1)}`)

    const toggle = await screen.findByRole('button', { name: 'lion' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})
