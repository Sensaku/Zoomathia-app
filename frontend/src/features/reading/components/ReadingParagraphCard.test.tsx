import { render, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useConceptInspection, type ReadingParagraph } from '../../../components/reading'
import { I18nProvider } from '../../../i18n'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { ReadingParagraphCard } from './ReadingParagraphCard'

const LION = 'http://thezoo/lion'
const P1: ReadingParagraph = { uri: 'p1', id: '1', text: 'le lion rugit', sectionTitle: 'Livre I' }
const P3: ReadingParagraph = { uri: 'p3', id: '3', text: 'un lion dort' }

const lion = (start: number, end: number) => ({
  lion: { concept: LION, label: 'lion', category: 'animal', offset: [{ start, end }] },
})
const REFERENCES = { p1: lion(3, 7), p3: lion(3, 7) }

interface HarnessProps {
  current?: string
  onActivate?: (uri: string) => void
  onTextSelection?: (p: ReadingParagraph) => void
  onAnnotateSnippet?: () => void
  selectedSnippet?: string | null
  annotationCount?: number
  showTranslation?: boolean
}

/** Two paragraphs on the real inspection hook, as the pages wire them. */
function Harness({
  current = 'p1',
  onActivate,
  onTextSelection,
  onAnnotateSnippet,
  selectedSnippet,
  ...rest
}: HarnessProps) {
  const inspectionState = useConceptInspection({ referenceAnnotations: REFERENCES, paragraphs: [P1, P3] })
  return (
    <>
      {[P1, P3].map((p) => (
        <ReadingParagraphCard
          key={p.uri}
          p={p}
          isCurrentPara={p.uri === current}
          referenceMap={REFERENCES[p.uri as 'p1' | 'p3']}
          inspectionState={inspectionState}
          textSize="normal"
          translationP={{ ...p, text: `the ${p.text}` }}
          onActivate={() => onActivate?.(p.uri)}
          onTextSelection={onTextSelection}
          selectedSnippet={p.uri === current ? selectedSnippet : null}
          onAnnotateSnippet={onAnnotateSnippet}
          {...rest}
        />
      ))}
    </>
  )
}

beforeEach(() => localStorage.setItem('zoomathia_lang', 'fr'))

describe('ReadingParagraphCard', () => {
  it('RM-ANN-01: a selection boundary resolves to the text container, the content wrapper or nothing, as before', () => {
    const onTextSelection = vi.fn()
    renderWithProviders(<Harness onTextSelection={onTextSelection} />)

    const article = screen.getByRole('article', { name: '§ 1' })
    const word = within(article).getByText('lion')
    fireEvent.mouseUp(word)
    expect(onTextSelection).toHaveBeenCalledExactlyOnceWith(P1)

    // The pages resolve a selection with closest('[data-para-uri]') from the container of a boundary.
    const resolve = (node: Node) => node.parentElement?.closest('[data-para-uri]') ?? null

    // A text node of a word: the text container, which holds the paragraph text only.
    const container = resolve(word.firstChild as Node)
    expect(container?.getAttribute('data-para-uri')).toBe('p1')
    expect(container?.classList.contains('ancient-text')).toBe(true)
    expect(container?.textContent).toBe(P1.text)

    // A text node of the header: the content wrapper, which holds the whole card content.
    const content = resolve(within(article).getByText('Livre I').firstChild as Node)
    expect(content?.getAttribute('data-para-uri')).toBe('p1')
    expect(content).not.toBe(container)
    expect(content?.contains(container)).toBe(true)

    // A boundary on the content element or on the article finds nothing: the page falls back to the paragraph.
    expect(content?.parentElement?.closest('[data-para-uri]')).toBeNull()
    expect(article.getAttribute('data-para-uri')).toBeNull()
    expect(article.getAttribute('id')).toBe('p1')
    expect(article.querySelectorAll('[data-para-uri]')).toHaveLength(2)
  })

  it('a click on the text makes the paragraph active, a click on the annotate button does not', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    const onAnnotateSnippet = vi.fn()
    renderWithProviders(
      <Harness current="p3" selectedSnippet="lion" onActivate={onActivate} onAnnotateSnippet={onAnnotateSnippet} />,
    )

    await user.click(screen.getByText('le lion rugit'))
    expect(onActivate).toHaveBeenCalledExactlyOnceWith('p1')

    onActivate.mockClear()
    await user.click(screen.getByRole('button', { name: 'Annoter' }))
    expect(onAnnotateSnippet).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('the article is named by its number and the active one has aria-current', () => {
    renderWithProviders(<Harness current="p3" />)
    expect(screen.getByRole('article', { name: '§ 3' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('article', { name: '§ 1' })).not.toHaveAttribute('aria-current')
    // Out of the tab order, still focusable by script (handleFocusParagraph).
    expect(screen.getByRole('article', { name: '§ 1' })).toHaveAttribute('tabindex', '-1')
  })

  it('a pinned concept tags the other paragraphs of the section: "Passage épinglé : lion"', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    renderWithProviders(<Harness current="p1" onActivate={onActivate} />)

    await user.click(within(screen.getByRole('article', { name: '§ 1' })).getByText('lion'))
    const other = screen.getByRole('article', { name: '§ 3' })
    expect(within(other).getByText('Passage épinglé : lion')).toBeInTheDocument()
    // The click on a word pins and stops there: it does not also activate the paragraph.
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('shows the translation, the count and the active chip in French', () => {
    renderWithProviders(<Harness current="p1" showTranslation annotationCount={2} />)
    const first = screen.getByRole('article', { name: '§ 1' })
    expect(within(first).getByText('Paragraphe actif')).toBeInTheDocument()
    expect(within(first).getByText('the le lion rugit', { exact: false })).toBeInTheDocument()
    expect(within(first).getByText('Livre I')).toBeInTheDocument()
    // The count is for the paragraphs that are not active.
    expect(within(screen.getByRole('article', { name: '§ 3' })).getByText('2 annotation(s)')).toBeInTheDocument()
    expect(within(first).queryByText('2 annotation(s)')).not.toBeInTheDocument()
  })

  it('shows English texts only when the language is English', () => {
    localStorage.setItem('zoomathia_lang', 'en')
    render(
      <I18nProvider>
        <Harness current="p1" showTranslation annotationCount={2} selectedSnippet="lion" onAnnotateSnippet={() => {}} />
      </I18nProvider>,
    )
    const first = screen.getByRole('article', { name: '§ 1' })
    expect(within(first).getByText('Active paragraph')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Annotate' })).toHaveAttribute(
      'title',
      'Annotate the selected passage',
    )
    expect(within(first).getByText('[English Transl.]')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '§ 3' })).getByText('2 annotation(s)')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Paragraphe actif|Annoter|Trad\. Anglaise|épinglé/)
  })

  it('has no accessibility violation, with a pinned concept and a selection', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(
      <Harness current="p1" showTranslation annotationCount={1} selectedSnippet="lion" onAnnotateSnippet={() => {}} />,
    )
    await user.click(within(screen.getByRole('article', { name: '§ 1' })).getByText('lion'))
    await expectNoAxeViolations(container)
  })
})
