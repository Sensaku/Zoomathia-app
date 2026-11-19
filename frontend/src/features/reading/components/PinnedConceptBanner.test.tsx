import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { ReadingParagraph } from '../../../components/reading'
import { expectNoAxeViolations } from '../../../test/axe'
import { renderWithProviders } from '../../accounts/components/testSupport'
import { PinnedConceptBanner, type PinnedConceptBannerProps } from './PinnedConceptBanner'

const P1: ReadingParagraph = { uri: 'p1', id: '1', text: 'le lion rugit' }
const P3: ReadingParagraph = { uri: 'p3', id: '3', text: 'un lion dort' }

function renderBanner(props: Partial<PinnedConceptBannerProps> = {}) {
  const onFocusParagraph = vi.fn()
  const onUnpin = vi.fn()
  const utils = renderWithProviders(
    <PinnedConceptBanner
      pinnedConcept="http://thezoo/lion"
      pinnedConceptLabel="lion"
      pinnedConceptCategory="animal"
      pinnedParagraphsList={[P1, P3]}
      activeParagraphUri="p1"
      onFocusParagraph={onFocusParagraph}
      onUnpin={onUnpin}
      {...props}
    />,
  )
  return { ...utils, onFocusParagraph, onUnpin }
}

beforeEach(() => localStorage.setItem('zoomathia_lang', 'fr'))

describe('PinnedConceptBanner', () => {
  it('renders nothing without a pinned concept', () => {
    const { container } = renderBanner({ pinnedConcept: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the covered paragraphs in a named region and jumps with the keyboard', async () => {
    const user = userEvent.setup()
    const { onFocusParagraph } = renderBanner()

    const region = screen.getByRole('region', { name: 'Annotation épinglée : lion' })
    expect(within(region).getByText('Présent dans 2 paragraphe(s)')).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: '§ 1' })).toHaveAttribute('aria-current', 'true')
    const third = within(region).getByRole('button', { name: '§ 3' })
    expect(third).not.toHaveAttribute('aria-current')
    expect(third).toHaveAttribute('title', 'Aller au paragraphe § 3')

    third.focus()
    await user.keyboard('{Enter}')
    expect(onFocusParagraph).toHaveBeenCalledExactlyOnceWith('p3')
  })

  it('says "Présent dans 0 paragraphe(s)" when the section has no paragraph (the pin survives a change of section)', () => {
    renderBanner({ pinnedParagraphsList: [] })
    expect(screen.getByText('Présent dans 0 paragraphe(s)')).toBeInTheDocument()
    expect(screen.queryByText('Passages couverts :')).not.toBeInTheDocument()
  })

  it('names the unpin button and calls onUnpin; no accessibility violation', async () => {
    const user = userEvent.setup()
    const { container, onUnpin } = renderBanner()
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: "Désépingler l'annotation" }))
    expect(onUnpin).toHaveBeenCalledOnce()
  })

  it('falls back to "Concept" when the concept has no label', () => {
    renderBanner({ pinnedConceptLabel: null })
    expect(screen.getByRole('region', { name: 'Annotation épinglée : Concept' })).toBeInTheDocument()
  })
})
