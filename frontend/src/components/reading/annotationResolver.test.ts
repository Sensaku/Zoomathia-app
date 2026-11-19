import { describe, expect, it } from 'vite-plus/test'
import type { StagedAnnotation } from '../../types'
import { resolveParagraphSpans } from './annotationResolver'
import type { ReadingParagraph } from './readingTypes'

const paragraph = (uri: string, text: string): ReadingParagraph => ({ uri, id: uri, text })

const staged = (overrides: Partial<StagedAnnotation>): StagedAnnotation => ({
  id: 1,
  paragraph_uri: 'p1',
  target_text: '',
  start_offset: 0,
  end_offset: 0,
  concept_uri: 'c1',
  concept_label: 'lion',
  concept_type: 'concept',
  category: 'animal',
  collections: [{ iri: 'https://opentheso.huma-num.fr/?idg=MT_7&idt=th310', labels: { fr: 'Zoonyme', en: 'Zoonyms' } }],
  scope_type: 'word',
  target_paragraphs: [],
  end_paragraph_uri: null,
  justification: null,
  status: 'pending',
  author: null,
  author_label: null,
  reviewer: null,
  reviewed_at: null,
  rejection_reason: null,
  created_at: '2026-01-01',
  updated_at: null,
  version: 1,
  allowed_actions: [],
  ...overrides,
})

const BEHAVIOR = [{ iri: 'https://opentheso.huma-num.fr/?idg=MT_13&idt=th310', labels: { fr: 'Éthologie' } }]

describe('resolveParagraphSpans', () => {
  it('RM-CON-02: a reference span carries the category and the collections of its data', () => {
    const { specificSpans, globalThemes } = resolveParagraphSpans(
      paragraph('p1', 'leo rugit'),
      {
        a: {
          concept: 'c1',
          label: 'rugir',
          category: 'behavior',
          collections: BEHAVIOR,
          offset: [{ start: 4, end: 9 }],
        },
        b: { concept: 'c2', label: 'savane', category: 'place', collections: [], offset: [] },
      },
      [],
    )
    expect(specificSpans[0]).toMatchObject({ category: 'behavior', collections: BEHAVIOR })
    expect(globalThemes[0]).toMatchObject({ category: 'place', collections: [] })
  })

  it('RM-CON-02: a staged span carries the category and the collections, pending ones included', () => {
    const inside = staged({ id: 1, end_offset: 3, category: 'anatomy', collections: BEHAVIOR })
    // A start past the end of the text leaves no range to mark: the concept becomes a theme.
    const theme = staged({ id: 2, concept_uri: 'c2', start_offset: 99, category: 'person', collections: [] })
    const multi = staged({
      id: 3,
      concept_uri: 'c3',
      scope_type: 'multi_paragraph',
      end_paragraph_uri: 'p2',
      target_paragraphs: ['p1', 'p2'],
      start_offset: 2,
      end_offset: 3,
      category: 'place',
      collections: BEHAVIOR,
    })
    const { specificSpans, globalThemes } = resolveParagraphSpans(paragraph('p1', 'leo rugit'), {}, [
      inside,
      theme,
      multi,
    ])
    expect(specificSpans.map((s) => [s.id, s.category, s.collections])).toEqual([
      [1, 'anatomy', BEHAVIOR],
      [3, 'place', BEHAVIOR],
    ])
    expect(globalThemes.map((s) => [s.id, s.category])).toEqual([[2, 'person']])
  })

  it('keeps polytonic Greek offsets on the exact word (UTF-16 code units, no normalisation)', () => {
    const text = 'ὁ λέων ἐστὶ ζῷον'
    const start = text.indexOf('λέων')
    const spans = resolveParagraphSpans(
      paragraph('p1', text),
      { a: { concept: 'c1', label: 'lion', offset: [{ start, end: start + 'λέων'.length }] } },
      [],
    )
    expect(spans.specificSpans).toHaveLength(1)
    const { start: s, end: e } = spans.specificSpans[0]
    expect(text.slice(s, e)).toBe('λέων')
  })

  it('clamps a reference offset that overruns the paragraph instead of dropping it', () => {
    const text = 'leo rugit'
    const { specificSpans } = resolveParagraphSpans(
      paragraph('p1', text),
      { a: { concept: 'c1', label: 'lion', offset: [{ start: 4, end: 999 }] } },
      [],
    )
    expect(specificSpans).toEqual([expect.objectContaining({ start: 4, end: text.length })])
  })

  it('turns a reference annotation without a valid range into a global theme', () => {
    const { specificSpans, globalThemes } = resolveParagraphSpans(
      paragraph('p1', 'leo rugit'),
      { a: { concept: 'c1', label: 'lion', offset: [] } },
      [],
    )
    expect(specificSpans).toEqual([])
    expect(globalThemes).toHaveLength(1)
  })

  it('covers the whole middle paragraph of a multi-paragraph annotation', () => {
    const annotation = staged({
      scope_type: 'multi_paragraph',
      paragraph_uri: 'p1',
      end_paragraph_uri: 'p3',
      target_paragraphs: ['p1', 'p2', 'p3'],
      start_offset: 2,
      end_offset: 3,
    })
    const { specificSpans } = resolveParagraphSpans(paragraph('p2', 'medium'), {}, [annotation])
    expect(specificSpans).toEqual([expect.objectContaining({ start: 0, end: 6, isMulti: true })])
  })

  it('filters by concept so that an inspection shows only the inspected concept', () => {
    const annotations = [
      staged({ id: 1, concept_uri: 'c1', end_offset: 3 }),
      staged({ id: 2, concept_uri: 'c2', end_offset: 3 }),
    ]
    const { specificSpans } = resolveParagraphSpans(paragraph('p1', 'leo rugit'), {}, annotations, 'c2')
    expect(specificSpans.map((s) => s.id)).toEqual([2])
  })
})
