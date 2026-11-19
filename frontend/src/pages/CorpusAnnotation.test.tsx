import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { BASE_URL } from '../api/client'
import { LocationProbe, SESSION, renderWithProviders } from '../features/accounts/components/testSupport'
import { server } from '../test/server'
import type { Paragraph, SectionAnnotationsResponse, SummaryNode, Work } from '../types'
import { CorpusAnnotation } from './CorpusAnnotation'

const PLINE = 'http://z/pline'
const PHYSIOLOGUS = 'http://z/physiologus'
const PLINE_2 = 'http://z/pline2'
const CHAPTER = `${PLINE}/book1/ch1`
const CHAPTER_2 = `${PLINE}/book1/ch2`
const P1 = `${CHAPTER}/p1`
const P2 = `${CHAPTER}/p2`

// The first work is not the default one: the default is found by its title or author.
const works: Work[] = [
  { uri: PHYSIOLOGUS, title: 'Physiologus', author: 'Anonyme', language: 'la' },
  { uri: PLINE, title: 'Historia naturalis', author: 'Pline', language: 'la' },
  { uri: PLINE_2, title: 'Autre livre', author: 'Pline', language: 'la' },
]
const summary: SummaryNode[] = [
  {
    uri: `${PLINE}/book1`,
    id: '1',
    title: 'Livre un',
    type: 'book',
    children: [
      { uri: CHAPTER, id: '1', title: 'Chapitre un', type: 'chapter', children: [] },
      { uri: CHAPTER_2, id: '2', title: 'Chapitre deux', type: 'chapter', children: [] },
    ],
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
        category: 'animal',
        collections: [
          { iri: 'https://opentheso.huma-num.fr/?idg=MT_7&idt=th310', labels: { fr: 'Zoonyme', en: 'Zoonyms' } },
        ],
        offset: [{ start: 3, end: 7 }],
      },
    },
  },
  staged_annotations: [],
}

/** Answers the catalogue and the structure of two works; each part can be replaced by a test. */
function mockStudio(overrides: { section?: () => Response; paragraphs?: () => Response } = {}) {
  server.use(
    http.get(`${BASE_URL}/getWorks`, () => HttpResponse.json(works)),
    http.get(`${BASE_URL}/getAuthors`, () => HttpResponse.json([{ name: 'Pline' }, { name: 'Anonyme' }])),
    http.get(`${BASE_URL}/getSummary`, ({ request }) => {
      const work = new URL(request.url).searchParams.get('uri')
      return HttpResponse.json(work === PLINE ? summary : [])
    }),
    http.get(`${BASE_URL}/getTranslation`, () => HttpResponse.json(null)),
    http.get(`${BASE_URL}/getParagraphs`, ({ request }) => {
      const section = new URL(request.url).searchParams.get('uri')
      if (section === CHAPTER_2)
        return HttpResponse.json([{ uri: `${CHAPTER_2}/p1`, id: '9', text: 'Autre chapitre.' }])
      return overrides.paragraphs?.() ?? HttpResponse.json(paragraphs)
    }),
    http.get(`${BASE_URL}/annotations/section`, () => overrides.section?.() ?? HttpResponse.json(sectionAnnotations)),
  )
}

function setup(route = '/annotate') {
  return renderWithProviders(
    <>
      <CorpusAnnotation />
      <LocationProbe />
    </>,
    { route, session: SESSION },
  )
}

describe('CorpusAnnotation', () => {
  beforeEach(() => {
    // jsdom has no layout: following a paragraph scrolls to it.
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('selects the default work, its first section and its first paragraph', async () => {
    mockStudio()
    setup()

    expect(await screen.findByRole('button', { name: /^§ 1/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Chapitre un' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(PLINE)
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Pline')
  })

  it('opens the work named by the uri parameter', async () => {
    mockStudio()
    setup(`/annotate?uri=${encodeURIComponent(PHYSIOLOGUS)}`)

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(PHYSIOLOGUS))
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Anonyme')
  })

  it('an unknown uri selects nothing, as before', async () => {
    mockStudio()
    setup(`/annotate?uri=${encodeURIComponent('http://z/unknown')}`)

    await screen.findByRole('combobox', { name: 'Œuvre' })
    expect(screen.queryByRole('button', { name: 'Chapitre un' })).not.toBeInTheDocument()
  })

  it('the selects have names and the toggles say which one is pressed', async () => {
    mockStudio()
    setup()

    expect(await screen.findByRole('combobox', { name: 'Auteur' })).toBeInTheDocument()
    const sizes = screen.getByRole('group', { name: 'Taille :' })
    expect(within(sizes).getByRole('button', { name: 'A+' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sizes).getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Traduction alignée' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('button', { name: 'Paragraphe actif (§ 1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('choosing a work writes it in the URL, keeps pending=1 and shows the choice while the URL catches up', async () => {
    mockStudio()
    const user = userEvent.setup()
    setup('/annotate?pending=1')
    await screen.findByRole('button', { name: 'Chapitre un' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Œuvre' }), PLINE_2)

    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(PLINE_2)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(encodeURIComponent(PLINE_2)))
    expect(screen.getByTestId('location')).toHaveTextContent('pending=1')
    // The work was chosen, not re-read from the old URL, and its structure replaces the old one.
    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(PLINE_2)
    expect(screen.queryByRole('button', { name: 'Chapitre un' })).not.toBeInTheDocument()
  })

  it('choosing an author moves to its first work', async () => {
    mockStudio()
    const user = userEvent.setup()
    setup()
    await screen.findByRole('button', { name: 'Chapitre un' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Auteur' }), 'Anonyme')

    expect(screen.getByRole('combobox', { name: 'Œuvre' })).toHaveValue(PHYSIOLOGUS)
    expect(screen.getByRole('combobox', { name: 'Auteur' })).toHaveValue('Anonyme')
  })

  it('a chapter click selects it and resets the paragraph to the first of the chapter', async () => {
    mockStudio()
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: /^§ 2/ }))
    expect(screen.getByRole('button', { name: /^§ 2/ })).toHaveAttribute('aria-current', 'true')

    await user.click(screen.getByRole('button', { name: 'Chapitre deux' }))

    expect(await screen.findByRole('button', { name: /^§ 9/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Chapitre deux' })).toHaveAttribute('aria-current', 'true')
  })

  it('"Non relues" turns the pending filter on (RM-ACC-03)', async () => {
    mockStudio()
    const user = userEvent.setup()
    setup()
    await screen.findByRole('button', { name: 'Chapitre un' })

    await user.click(screen.getByRole('button', { name: 'Non relues' }))

    expect(screen.getByRole('button', { name: 'Non relues' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: /Afficher les contributions non relues/ })).toBeChecked()
  })

  it('rule 9: a failed section shows the alert, no 0 count and no empty state, and the retry loads the annotations', async () => {
    let failing = true
    mockStudio({
      section: () =>
        failing ? HttpResponse.json({ detail: 'down' }, { status: 502 }) : HttpResponse.json(sectionAnnotations),
    })
    const user = userEvent.setup()
    setup()

    const alert = await screen.findByRole('alert')
    expect(screen.queryByText('Aucune annotation sur ce paragraphe.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toute la section' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Toute la section \(0\)/ })).not.toBeInTheDocument()

    failing = false
    await user.click(within(alert.parentElement as HTMLElement).getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByRole('button', { name: 'lion' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rule 9: failed paragraphs show the alert, not the "select a work" message', async () => {
    mockStudio({ paragraphs: () => HttpResponse.json({ detail: 'down' }, { status: 502 }) })
    setup()

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Sélectionnez une œuvre/)).not.toBeInTheDocument()
  })

  it('rule 9: a failed works list shows the alert only, not the "select a work" message', async () => {
    mockStudio()
    server.use(http.get(`${BASE_URL}/getWorks`, () => HttpResponse.json({ detail: 'down' }, { status: 502 })))
    setup()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/Sélectionnez une œuvre/)).not.toBeInTheDocument()
  })

  it('while the works list loads, the reading pane shows the loader, not the "select a work" message', async () => {
    mockStudio()
    server.use(http.get(`${BASE_URL}/getWorks`, async () => delay('infinite')))
    setup()

    expect(await screen.findByText('Chargement du texte et des annotations...')).toBeInTheDocument()
    expect(screen.queryByText(/Sélectionnez une œuvre/)).not.toBeInTheDocument()
  })

  it('following a reference annotation is a toggle that exposes aria-pressed', async () => {
    mockStudio()
    const user = userEvent.setup()
    setup()

    const toggle = await screen.findByRole('button', { name: 'lion' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})
