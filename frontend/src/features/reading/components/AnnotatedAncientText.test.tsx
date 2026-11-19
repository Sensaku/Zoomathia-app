import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { StagedAnnotation } from '../../../types'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { AnnotatedAncientText } from './AnnotatedAncientText'

const LION = 'http://thezoo/lion'
const WOLF = 'http://thezoo/wolf'

const staged = (status: StagedAnnotation['status']): StagedAnnotation => ({
  id: 1,
  paragraph_uri: 'p1',
  target_text: 'lion',
  start_offset: 3,
  end_offset: 7,
  concept_uri: LION,
  concept_label: 'lion',
  concept_type: 'concept',
  category: 'animal',
  collections: [{ iri: 'https://opentheso.huma-num.fr/?idg=MT_7&idt=th310', labels: { fr: 'Zoonyme', en: 'Zoonyms' } }],
  scope_type: 'word',
  target_paragraphs: [],
  end_paragraph_uri: null,
  justification: null,
  status,
  author: null,
  author_label: 'Ada',
  reviewer: null,
  reviewed_at: null,
  rejection_reason: null,
  created_at: '2026-01-01',
  updated_at: null,
  version: 1,
  allowed_actions: [],
})

/** A reference annotation: with offsets it highlights the text, without any it is a passage theme. */
const reference = (concept: string, label: string, offset: { start: number; end: number }[]) => ({
  [concept]: { concept, label, category: 'animal', offset },
})

afterEach(() => vi.restoreAllMocks())

describe('AnnotatedAncientText', () => {
  it('RM-ACC-03: the tooltip of a pending annotation names its status, not "Staging"', () => {
    renderWithProviders(
      <AnnotatedAncientText p={{ uri: 'p1', id: '1', text: 'le lion rugit' }} stagedList={[staged('pending')]} />,
    )
    const marked = screen.getAllByTitle(/lion/).find((el) => el.getAttribute('title')?.includes('[Non relu]'))
    expect(marked).toBeDefined()
    expect(document.body.innerHTML).not.toContain('Staging')
  })

  it('RM-ANN-01: contribution markers and highlights add no text to the paragraph', () => {
    // "stg" used to follow a pending word: a selection across it read "noctustg errat" and the offsets fell back to 0.
    const p = { uri: 'p1', id: '1', text: 'noctua lupus errat leo' }
    const { container } = renderWithProviders(
      <AnnotatedAncientText
        p={p}
        stagedList={[{ ...staged('pending'), start_offset: 7, end_offset: 12 }]}
        referenceMap={reference(WOLF, 'wolf', [{ start: 19, end: 22 }])}
      />,
    )
    expect(screen.getByText('lupus').tagName).toBe('MARK')
    expect(container.textContent).toBe(p.text)
  })

  it('RM-ANN-01: a highlighted word keeps its text node under a mark, inside the paragraph element', () => {
    const p = { uri: 'p1', id: '1', text: 'noctua lupus errat' }
    renderWithProviders(
      <div data-para-uri={p.uri}>
        <AnnotatedAncientText p={p} referenceMap={reference(WOLF, 'wolf', [{ start: 7, end: 12 }])} />
      </div>,
    )
    const word = screen.getByText('lupus')
    expect(word.tagName).toBe('MARK')
    expect(word.closest('[data-para-uri]')?.getAttribute('data-para-uri')).toBe('p1')
  })

  /** Keeps the inspection state that the card owns in the pages. */
  function ThemesHarness({ onHover }: { onHover: (uri: string | null) => void }) {
    const [hovered, setHovered] = useState<string | null>(null)
    const [pinned, setPinned] = useState<string | null>(null)
    return (
      <AnnotatedAncientText
        p={{ uri: 'p1', id: '1', text: 'le lion rugit' }}
        referenceMap={reference(LION, 'lion', [])}
        hoveredConcept={hovered}
        pinnedConcept={pinned}
        onHoverConcept={(uri) => {
          onHover(uri)
          setHovered(uri)
        }}
        onPinConcept={(uri) => setPinned((prev) => (prev === uri ? null : uri))}
      />
    )
  }

  it('a passage theme is a toggle button: focus previews, Enter pins, and axe passes', async () => {
    const user = userEvent.setup()
    const onHover = vi.fn()
    const { container } = renderWithProviders(<ThemesHarness onHover={onHover} />)

    const theme = screen.getByRole('button', { name: 'lion' })
    expect(screen.getByText('Thèmes du passage')).toBeInTheDocument()
    expect(theme).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    expect(theme).toHaveFocus()
    expect(onHover).toHaveBeenLastCalledWith(LION)
    await user.keyboard('{Enter}')
    expect(theme).toHaveAttribute('aria-pressed', 'true')
    await expectNoAxeViolations(container)
    await user.keyboard('{Enter}')
    expect(theme).toHaveAttribute('aria-pressed', 'false')
    await user.tab()
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('hovering a highlighted word previews its concept, and leaving clears it', async () => {
    const user = userEvent.setup()
    const onHoverConcept = vi.fn()
    renderWithProviders(
      <AnnotatedAncientText
        p={{ uri: 'p1', id: '1', text: 'le lion rugit' }}
        referenceMap={reference(LION, 'lion', [{ start: 3, end: 7 }])}
        onHoverConcept={onHoverConcept}
      />,
    )
    await user.hover(screen.getByText('lion'))
    expect(onHoverConcept).toHaveBeenLastCalledWith(LION)
    await user.unhover(screen.getByText('lion'))
    expect(onHoverConcept).toHaveBeenLastCalledWith(null)
  })

  it('a click on a highlighted word pins its concept and does not reach the paragraph', async () => {
    const user = userEvent.setup()
    const onPinConcept = vi.fn()
    const onParagraphClick = vi.fn()
    renderWithProviders(
      <div role="presentation" onClick={onParagraphClick}>
        <AnnotatedAncientText
          p={{ uri: 'p1', id: '1', text: 'le lion rugit' }}
          referenceMap={reference(LION, 'lion', [{ start: 3, end: 7 }])}
          onPinConcept={onPinConcept}
        />
      </div>,
    )
    await user.click(screen.getByText('lion'))
    expect(onPinConcept).toHaveBeenCalledExactlyOnceWith(LION)
    expect(onParagraphClick).not.toHaveBeenCalled()
  })

  it('a click while text is selected does not pin: the reader is selecting, not pinning', async () => {
    const user = userEvent.setup()
    const onPinConcept = vi.fn()
    renderWithProviders(
      <AnnotatedAncientText
        p={{ uri: 'p1', id: '1', text: 'le lion rugit' }}
        referenceMap={reference(LION, 'lion', [{ start: 3, end: 7 }])}
        onPinConcept={onPinConcept}
      />,
    )
    vi.spyOn(window, 'getSelection').mockReturnValue({ isCollapsed: false, toString: () => 'le lion' } as Selection)
    await user.click(screen.getByText('lion'))
    expect(onPinConcept).not.toHaveBeenCalled()
  })
})
