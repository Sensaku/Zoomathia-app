import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { I18nProvider } from '../../i18n'
import type { StagedAnnotation } from '../../types'
import { AnnotatedAncientText } from './AnnotatedAncientText'

const staged = (status: StagedAnnotation['status']): StagedAnnotation => ({
  id: 1,
  paragraph_uri: 'p1',
  target_text: 'lion',
  start_offset: 3,
  end_offset: 7,
  concept_uri: 'http://thezoo/lion',
  concept_label: 'lion',
  concept_type: 'concept',
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

beforeEach(() => localStorage.setItem('zoomathia_lang', 'fr'))

describe('AnnotatedAncientText', () => {
  it('RM-ACC-03: the tooltip of a pending annotation names its status, not "Staging"', () => {
    render(
      <I18nProvider>
        <AnnotatedAncientText p={{ uri: 'p1', id: '1', text: 'le lion rugit' }} stagedList={[staged('pending')]} />
      </I18nProvider>,
    )
    const marked = screen.getAllByTitle(/lion/).find((el) => el.getAttribute('title')?.includes('[Non relu]'))
    expect(marked).toBeDefined()
    expect(document.body.innerHTML).not.toContain('Staging')
  })
})
