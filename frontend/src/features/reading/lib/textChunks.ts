import { getConceptCategoryInfo } from '../../../components/ConceptCategoryBadge'
import type { ReadingSpan } from '../../../components/reading'
import type { TranslationDictionary } from '../../../i18n/types'
import type { ContributionStatus } from '../../../types'

/** A slice of a paragraph between two annotation boundaries, with the spans that cover it. */
export interface TextChunk {
  start: number
  end: number
  text: string
  /** Every span that covers the whole chunk (empty for plain text). */
  matching: ReadingSpan[]
  startingSpans: ReadingSpan[]
  endingSpans: ReadingSpan[]
  /** The last chunk of an overlap: it carries the count of superposed concepts. */
  isEndOfOverlap: boolean
  primaryMatch: ReadingSpan | null
  catInfo: ReturnType<typeof getConceptCategoryInfo> | null
  /** The tooltip without the pin hint; empty for plain text. */
  baseTooltip: string
  /** The status shown by the contribution marker, `null` when no staged span covers the chunk. */
  stagedStatus: ContributionStatus | null
}

/** The fields of a chunk with no annotation. */
const PLAIN: Omit<TextChunk, 'start' | 'end' | 'text'> = {
  matching: [],
  startingSpans: [],
  endingSpans: [],
  isEndOfOverlap: false,
  primaryMatch: null,
  catInfo: null,
  baseTooltip: '',
  stagedStatus: null,
}

/** Pending wins: a reviewer must not miss a contribution that still waits for review. */
function stagedStatusOf(matching: ReadingSpan[]): ContributionStatus | null {
  const staged = matching.filter((s) => s.isStaged)
  if (staged.length === 0) return null
  if (staged.some((s) => s.status === 'pending')) return 'pending'
  return staged[0].status ?? 'pending'
}

/** RM-ACC-03: a staged span names its review status, such as "Non relu". */
function tooltipOf(matching: ReadingSpan[], catLabel: string, t: TranslationDictionary): string {
  const statusSuffix = (s: ReadingSpan) => (s.isStaged && s.status ? ` [${t.contributions.status[s.status]}]` : '')
  if (matching.length === 1) return `[${catLabel}] ${matching[0].label}${statusSuffix(matching[0])}`
  const lines = matching.map((s) => {
    const info = getConceptCategoryInfo(s.category, s.collection, s.label, s.concept)
    return `• [${info.label}] ${s.label}${statusSuffix(s)}`
  })
  return `${t.work.overlappingConcepts.replace('{count}', String(matching.length))}\n${lines.join('\n')}`
}

/**
 * Cuts a paragraph at every span boundary. The chunks follow the text in order and their texts
 * join back to `text` exactly (RM-ANN-01: the offsets of a free selection are read from this text).
 */
export function buildTextChunks(text: string, spans: ReadingSpan[], t: TranslationDictionary): TextChunk[] {
  if (spans.length === 0) return []

  const boundarySet = new Set<number>([0, text.length])
  for (const s of spans) {
    boundarySet.add(s.start)
    boundarySet.add(s.end)
  }
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b)

  const chunks: TextChunk[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]
    const end = boundaries[i + 1]
    const slice = text.slice(start, end)
    if (!slice) continue

    const matching = spans.filter((s) => s.start <= start && s.end >= end)
    if (matching.length === 0) {
      chunks.push({ start, end, text: slice, ...PLAIN })
      continue
    }

    const endingSpans = spans.filter((s) => s.end === end)
    const nextMatchingCount =
      i < boundaries.length - 2 ? spans.filter((s) => s.start <= end && s.end >= boundaries[i + 2]).length : 0
    const primaryMatch = matching[0]
    const catInfo = getConceptCategoryInfo(
      primaryMatch.category,
      primaryMatch.collection,
      primaryMatch.label,
      primaryMatch.concept,
    )
    chunks.push({
      start,
      end,
      text: slice,
      matching,
      startingSpans: spans.filter((s) => s.start === start),
      endingSpans,
      isEndOfOverlap: matching.length > 1 && (nextMatchingCount !== matching.length || endingSpans.length > 0),
      primaryMatch,
      catInfo,
      baseTooltip: tooltipOf(matching, catInfo.label, t),
      stagedStatus: stagedStatusOf(matching),
    })
  }
  return chunks
}
