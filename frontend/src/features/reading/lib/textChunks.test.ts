import { describe, expect, it } from 'vite-plus/test'
import type { ReadingSpan } from '../../../components/reading'
import { fr } from '../../../i18n/fr'
import type { ContributionStatus } from '../../../types'
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
        buildTextChunks(TEXT, spans, fr)
          .map((c) => c.text)
          .join(''),
      ).toBe(TEXT)
    }
  })

  it('the chunks follow the text in order and each covers the spans that contain it', () => {
    const chunks = buildTextChunks(TEXT, [span(3, 9, 'a'), span(6, 12, 'b')], fr)
    expect(chunks.map((c) => [c.start, c.end, c.matching.map((s) => s.concept)])).toEqual([
      [0, 3, []],
      [3, 6, ['a']],
      [6, 9, ['a', 'b']],
      [9, 12, ['b']],
      [12, 20, []],
    ])
  })

  it('flags exactly one chunk at the end of each overlap run', () => {
    const one = buildTextChunks(TEXT, [span(3, 9, 'a'), span(6, 12, 'b')], fr)
    expect(one.filter((c) => c.isEndOfOverlap).map((c) => c.start)).toEqual([6])

    const two = buildTextChunks(TEXT, [span(0, 4, 'a'), span(2, 6, 'b'), span(10, 15, 'c'), span(12, 18, 'd')], fr)
    expect(two.filter((c) => c.isEndOfOverlap).map((c) => c.start)).toEqual([2, 12])
  })

  it('a nested span gives each coverage level its own counter, with the right count', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 12, 'a'), span(2, 10, 'b'), span(5, 7, 'c')], fr)
    const flagged = chunks.filter((c) => c.isEndOfOverlap).map((c) => [c.start, c.matching.length])
    expect(flagged).toEqual([
      [2, 2],
      [5, 3],
      [7, 2],
    ])
  })

  it('adjacent spans do not overlap: no counter, one concept per chunk', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 4, 'a'), span(4, 8, 'b')], fr)
    expect(chunks.some((c) => c.isEndOfOverlap)).toBe(false)
    expect(chunks.filter((c) => c.matching.length > 0).map((c) => c.matching.map((s) => s.concept))).toEqual([
      ['a'],
      ['b'],
    ])
  })

  it('the marker status is pending when a pending and a validated contribution overlap', () => {
    // The validated span comes first: "first staged status" would wrongly hide the pending one.
    const chunks = buildTextChunks(TEXT, [span(0, 8, 'a', 'validated'), span(4, 12, 'b', 'pending')], fr)
    const overlap = chunks.find((c) => c.matching.length === 2)
    expect(overlap?.stagedStatus).toBe('pending')
    expect(chunks.find((c) => c.start === 0)?.stagedStatus).toBe('validated')
  })

  it('a reference annotation alone has no contribution marker, and plain text has none either', () => {
    const chunks = buildTextChunks(TEXT, [span(2, 6, 'a')], fr)
    expect(chunks.map((c) => c.stagedStatus)).toEqual([null, null, null])
  })

  it('RM-ACC-03: the overlap tooltip counts the concepts and names the review status', () => {
    const chunks = buildTextChunks(TEXT, [span(0, 8, 'a', 'pending'), span(4, 12, 'b')], fr)
    const overlap = chunks.find((c) => c.matching.length === 2)
    expect(overlap?.baseTooltip.startsWith('2 concepts superposés :\n')).toBe(true)
    expect(overlap?.baseTooltip).toContain(`${fr.contributions.status.pending}]`)
  })

  it('returns no chunk without spans', () => {
    expect(buildTextChunks(TEXT, [], fr)).toEqual([])
  })
})
