import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import type { StagedAnnotation } from '../../types'
import type { ReadingParagraph } from './readingTypes'
import { useConceptInspection } from './useConceptInspection'

const P1: ReadingParagraph = { uri: 'p1', id: '1', text: 'leo rugit' }
const P2: ReadingParagraph = { uri: 'p2', id: '2', text: 'lupus errat' }

const reference = (concept: string, label: string, category?: string) => ({
  [label]: { concept, label, type: 'oa', category, collections: [], offset: [{ start: 0, end: 3 }] },
})

const staged = (concept_uri: string, concept_label: string, category: StagedAnnotation['category']) =>
  ({
    id: 1,
    paragraph_uri: 'p2',
    end_paragraph_uri: null,
    target_paragraphs: [],
    concept_uri,
    concept_label,
    category,
    collections: [],
    status: 'pending',
  }) as unknown as StagedAnnotation

describe('useConceptInspection', () => {
  it('RM-CON-02: the pinned category of a reference annotation is the one of the data', () => {
    const { result } = renderHook(() =>
      useConceptInspection({
        referenceAnnotations: { p1: reference('c-rugir', 'rugir', 'behavior') },
        paragraphs: [P1, P2],
      }),
    )
    act(() => result.current.setPinnedConcept('c-rugir'))
    expect(result.current.pinnedConceptCategory).toBe('behavior')
    expect(result.current.pinnedParagraphsList.map((p) => p.uri)).toEqual(['p1'])
  })

  it('RM-CON-02: a pending staged annotation gives its category, and the hover wins while it lasts', () => {
    const { result } = renderHook(() =>
      useConceptInspection({
        referenceAnnotations: { p1: reference('c-lion', 'lion', 'animal') },
        stagedAnnotations: [staged('c-queue', 'queue', 'anatomy')],
        paragraphs: [P1, P2],
      }),
    )
    act(() => result.current.setPinnedConcept('c-lion'))
    act(() => result.current.setHoveredConcept('c-queue'))
    expect(result.current.pinnedConceptCategory).toBe('animal')
    expect(result.current.activeInspectionCategory).toBe('anatomy')
    expect(result.current.activeInspectionLabel).toBe('queue')
  })

  it('RM-CON-02: nothing is detected from the label or the IRI of a general concept', () => {
    // The old code read "animal domestique" and the root animal identifiers as animals.
    const { result } = renderHook(() =>
      useConceptInspection({
        referenceAnnotations: {
          p1: reference('https://opentheso.huma-num.fr/?idc=4988&idt=th310', 'animal domestique', 'general'),
        },
        stagedAnnotations: [staged('https://opentheso.huma-num.fr/?idc=106004&idt=th310', 'sauvage', 'general')],
        paragraphs: [P1, P2],
      }),
    )
    act(() => result.current.setPinnedConcept('https://opentheso.huma-num.fr/?idc=4988&idt=th310'))
    expect(result.current.pinnedConceptCategory).toBe('general')
    act(() => result.current.setPinnedConcept('https://opentheso.huma-num.fr/?idc=106004&idt=th310'))
    expect(result.current.pinnedConceptCategory).toBe('general')
  })

  it('a reference annotation without a category reads as general', () => {
    const { result } = renderHook(() =>
      useConceptInspection({ referenceAnnotations: { p1: reference('c1', 'lion') }, paragraphs: [P1] }),
    )
    act(() => result.current.setPinnedConcept('c1'))
    expect(result.current.pinnedConceptCategory).toBe('general')
  })
})
