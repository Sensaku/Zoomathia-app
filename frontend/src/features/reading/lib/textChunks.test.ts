import { describe, expect, it } from 'vite-plus/test'
import type { ReadingSpan } from '../../../components/reading'
import { en } from '../../../i18n/en'
import { fr } from '../../../i18n/fr'
import type { ConceptCategory, ConceptCollection, ContributionStatus } from '../../../types'
import { buildTextChunks } from './textChunks'

const TEXT = 'abcdefghijklmnopqrst'

const span = (start: number, end: number, concept: string, status?: ContributionStatus): ReadingSpan => ({
  start,
  end,
  label: concept,
  concept,
  isStaged: status !== undefined,
  status,
})

const ZOONYM: ConceptCollection = {
  iri: 'https://opentheso.huma-num.fr/?idg=MT_7&idt=th310',
  labels: { fr: 'Zoonyme', en: 'Zoonyms' },
}
const SUBJECT: ConceptCollection = {
  iri: 'https://opentheso.huma-num.fr/?idg=MT_6&idt=th310',
  labels: { fr: 'Sujet' },
}

const categorised = (
  start: number,
  end: number,
  label: string,
  category: ConceptCategory | undefined,
  collections: ConceptCollection[] = [],
): ReadingSpan => ({ start, end, label, concept: label, category, collections, isStaged: false })

describe('buildTextChunks', () => {
  it('RM-ANN-01: the chunk texts join back to the paragraph, whatever the spans', () => {
    const cases: ReadingSpan[][] = [
      [span(3, 9, 'a'), span(6, 12, 'b')], // overlapping
      [span(0, 4, 'a'), span(4, 8, 'b')], // adjacent
      [span(0, 20, 'a'), span(5, 10, 'b'), span(7, 15, 'c')], // nested and overlapping, whole text
      [span(18, 20, 'a')], // ends with the text
    ]
    for (const spans of cases) {
      expect(
        buildTextChunks(TEXT, spans, fr, 'fr')
          .map((c) => c.text)
          .join(''),
      ).toBe(TEXT)
    }
  })

  it('the chunks follow the text in order and each covers the spans that contain it', () => {
    const chunks = buildTextChunks(TEXT, [span(3, 9, 'a'), span(6, 12, 'b')], fr, 'fr')
    expect(chunks.map((c) => [c.start, c.end, c.matching.map((s) => s.concept)])).toEqual([
      [0, 3, []],
      [3, 6, ['a']],
      [6, 9, ['a', 'b']],
      [9, 12, ['b']],
      [12, 20, []],
    ])
  })

  it('flags exactly one chunk at the end of each overlap run', () => {
    const one = buildTextChunks(TEXT, [span(3, 9, 'a'), span(6, 12, 'b')], fr, 'fr')
    expect(one.filter((c) => c.isEndOfOverlap).map((c) => c.start)).toEqual([6])

    const two = buildTextChunks(
      TEXT,
      [span(0, 4, 'a'), span(2, 6, 'b'), span(10, 15, 'c'), span(12, 18, 'd')],
      fr,
      'fr',
    )
    expect(two.filter((c) => c.isEndOfOverlap).map((c) => c.start)).toEqual([2, 12])
  })

  it('a nested span gives each coverage level its own counter, with the right count', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 12, 'a'), span(2, 10, 'b'), span(5, 7, 'c')], fr, 'fr')
    const flagged = chunks.filter((c) => c.isEndOfOverlap).map((c) => [c.start, c.matching.length])
    expect(flagged).toEqual([
      [2, 2],
      [5, 3],
      [7, 2],
    ])
  })

  it('adjacent spans do not overlap: no counter, one concept per chunk', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 4, 'a'), span(4, 8, 'b')], fr, 'fr')
    expect(chunks.some((c) => c.isEndOfOverlap)).toBe(false)
    expect(chunks.filter((c) => c.matching.length > 0).map((c) => c.matching.map((s) => s.concept))).toEqual([
      ['a'],
      ['b'],
    ])
  })

  it('the marker status is pending when a pending and a validated contribution overlap', () => {
    // The validated span comes first: "first staged status" would wrongly hide the pending one.
    const chunks = buildTextChunks(TEXT, [span(0, 8, 'a', 'validated'), span(4, 12, 'b', 'pending')], fr, 'fr')
    const overlap = chunks.find((c) => c.matching.length === 2)
    expect(overlap?.stagedStatus).toBe('pending')
    expect(chunks.find((c) => c.start === 0)?.stagedStatus).toBe('validated')
  })

  it('a reference annotation alone has no contribution marker, and plain text has none either', () => {
    const chunks = buildTextChunks(TEXT, [span(2, 6, 'a')], fr, 'fr')
    expect(chunks.map((c) => c.stagedStatus)).toEqual([null, null, null])
  })

  it('RM-ACC-03: the overlap tooltip counts the concepts and names the review status', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 8, 'a', 'pending'), span(4, 12, 'b')], fr, 'fr')
    const overlap = chunks.find((c) => c.matching.length === 2)
    expect(overlap?.baseTooltip.startsWith('2 concepts superposés :\n')).toBe(true)
    expect(overlap?.baseTooltip).toContain(`${fr.contributions.status.pending}]`)
  })

  it('RM-CON-02: the tooltip reads "[category] label · collection", translated in the interface language', () => {
    const spans = [categorised(2, 6, 'lion', 'animal', [ZOONYM, SUBJECT])]
    const inFrench = buildTextChunks(TEXT, spans, fr, 'fr').find((c) => c.matching.length === 1)
    expect(inFrench?.baseTooltip).toBe('[Animal] lion · Zoonyme, Sujet')
    // Subject has no English label: it falls back to its French one.
    const inEnglish = buildTextChunks(TEXT, spans, en, 'en').find((c) => c.matching.length === 1)
    expect(inEnglish?.baseTooltip).toBe('[Animal] lion · Zoonyms, Sujet')
  })

  it('RM-CON-02: a concept without a collection has no separator in its tooltip', () => {
    const chunk = buildTextChunks(TEXT, [categorised(2, 6, 'lion', 'animal')], fr, 'fr').find(
      (c) => c.matching.length === 1,
    )
    expect(chunk?.baseTooltip).toBe('[Animal] lion')
  })

  it('RM-CON-02: the category comes from the data, never from the label', () => {
    // "animal domestique" used to be read as an animal from its label: the backend said general.
    const chunks = buildTextChunks(TEXT, [categorised(2, 6, 'animal domestique', 'general', [SUBJECT])], fr, 'fr')
    const marked = chunks.find((c) => c.matching.length === 1)
    expect(marked?.category).toBe('general')
    expect(marked?.baseTooltip).toBe('[Général] animal domestique · Sujet')
  })

  it('a span without a category reads as general', () => {
    const marked = buildTextChunks(TEXT, [categorised(2, 6, 'lion', undefined)], fr, 'fr').find(
      (c) => c.matching.length === 1,
    )
    expect(marked?.category).toBe('general')
    expect(marked?.baseTooltip).toBe('[Général] lion')
  })

  it('an overlap tooltip gives each concept its own category and collections, before the review status', () => {
    const staged: ReadingSpan = { ...categorised(0, 8, 'loup', 'animal', [ZOONYM]), isStaged: true, status: 'pending' }
    const chunks = buildTextChunks(TEXT, [staged, categorised(4, 12, 'rugir', 'behavior', [SUBJECT])], fr, 'fr')
    const overlap = chunks.find((c) => c.matching.length === 2)
    expect(overlap?.baseTooltip).toBe(
      ['2 concepts superposés :', '• [Animal] loup · Zoonyme [Non relu]', '• [Comportement] rugir · Sujet'].join(
        String.fromCharCode(10),
      ),
    )
  })

  it('returns no chunk without spans', () => {
    expect(buildTextChunks(TEXT, [], fr, 'fr')).toEqual([])
  })
})
