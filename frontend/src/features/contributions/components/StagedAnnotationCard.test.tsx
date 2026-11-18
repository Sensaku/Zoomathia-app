import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'
import { expectNoAxeViolations } from '../../../test/axe'
import type { StagedAnnotation } from '../../../types'
import { renderWithProviders } from './renderWithProviders'
import { StagedAnnotationCard } from './StagedAnnotationCard'

const annotation: StagedAnnotation = {
  id: 7,
  paragraph_uri: 'p1',
  target_text: 'le lion rugit',
  start_offset: 3,
  end_offset: 16,
  concept_uri: 'http://thezoo/lion',
  concept_label: 'Lion',
  concept_type: 'concept',
  justification: 'Texte clair',
  scope_type: 'word_sequence',
  end_paragraph_uri: null,
  target_paragraphs: [],
  status: 'pending',
  author: { id: 2, display_name: 'Ada Lovelace', affiliation: 'I3S' },
  author_label: null,
  reviewer: null,
  reviewed_at: null,
  rejection_reason: null,
  created_at: '2026-03-01T10:00:00Z',
  updated_at: null,
  version: 1,
  allowed_actions: [],
}

function setup(overrides: Partial<StagedAnnotation> = {}, props: { isPinned?: boolean; canPin?: boolean } = {}) {
  const onTogglePin = vi.fn()
  const view = renderWithProviders(
    <StagedAnnotationCard
      annotation={{ ...annotation, ...overrides }}
      isPinned={props.isPinned ?? false}
      canPin={props.canPin}
      onTogglePin={onTogglePin}
    />,
  )
  return { onTogglePin, ...view }
}

describe('StagedAnnotationCard', () => {
  it('RM-ACC-03: a pending annotation reads "Non relu" and shows its excerpt, justification and author', async () => {
    const { container } = setup()
    expect(screen.getByText('Non relu')).toBeInTheDocument()
    expect(screen.getByText(/le lion rugit/)).toBeInTheDocument()
    expect(screen.getByText('Texte clair')).toBeInTheDocument()
    expect(screen.getByText(/Par Ada Lovelace \(I3S\)/)).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('RM-ACC-04: a rejected annotation shows the reviewer and the public reason', () => {
    setup({
      status: 'rejected',
      reviewer: { id: 3, display_name: 'Grace Hopper', affiliation: 'MIT' },
      reviewed_at: '2026-03-02T10:00:00Z',
      rejection_reason: 'Hors sujet',
    })
    expect(screen.getByText('Rejeté')).toBeInTheDocument()
    expect(screen.getByText(/Rejeté par Grace Hopper \(MIT\)/)).toBeInTheDocument()
    expect(screen.getByText(/Hors sujet/)).toBeInTheDocument()
  })

  it('RM-CTB-05, RM-MOD-01: the buttons follow allowed_actions', () => {
    const first = setup({ allowed_actions: ['edit', 'delete'] })
    expect(screen.getByRole('button', { name: 'Modifier: Lion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Supprimer: Lion' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Valider/ })).toBeNull()
    first.unmount()
    setup({ allowed_actions: ['review'] })
    expect(screen.getByRole('button', { name: 'Valider: Lion' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifier|Supprimer/ })).toBeNull()
  })

  it('opens the edit dialog from the edit button', async () => {
    const user = userEvent.setup()
    setup({ allowed_actions: ['edit'] })
    await user.click(screen.getByRole('button', { name: 'Modifier: Lion' }))
    expect(screen.getByRole('dialog', { name: /Modifier.+Lion/ })).toBeInTheDocument()
  })

  it('pinning is a toggle button that reports its state', async () => {
    const user = userEvent.setup()
    const { onTogglePin, unmount } = setup()
    await user.click(screen.getByRole('button', { name: /Lion/, pressed: false }))
    expect(onTogglePin).toHaveBeenCalledTimes(1)
    unmount()
    setup({}, { isPinned: true })
    expect(screen.getByRole('button', { name: /Lion/, pressed: true })).toBeInTheDocument()
  })

  it('RM-ACC-04: a rejected annotation has no pin toggle, so it is never followed in the text', () => {
    setup({ status: 'rejected' }, { canPin: false })
    expect(screen.queryByRole('button', { name: /Lion/, pressed: false })).toBeNull()
    expect(screen.getByText('Lion')).toBeInTheDocument()
  })
})
