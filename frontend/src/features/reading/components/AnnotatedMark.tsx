import type { MouseEvent } from 'react'
import {
  CATEGORY_ACTIVE_DELIMITER_LEFT,
  CATEGORY_ACTIVE_DELIMITER_RIGHT,
  CATEGORY_DELIMITER_LEFT,
  CATEGORY_DELIMITER_RIGHT,
  CATEGORY_HOVER_STYLES,
  CATEGORY_OVERLAP_STYLES,
  CATEGORY_PINNED_STYLES,
  CATEGORY_STYLES,
  getConceptCategoryInfo,
} from '../../../components/ConceptCategoryBadge'
import type { ReadingSpan } from '../../../components/reading'
import { useI18n } from '../../../i18n'
import { StatusIcon } from '../../contributions'
import type { TextChunk } from '../lib/textChunks'

/**
 * Another concept is inspected: the mark loses its colours but keeps its widths (the delimiters
 * stay, transparent), so dimming never moves the text. The underline is a text decoration, which
 * takes no space and does not clash with the delimiter borders.
 */
const DIMMED = 'bg-transparent text-ink underline decoration-dotted decoration-ink-faint underline-offset-4'

function categoryOf(s: ReadingSpan) {
  return getConceptCategoryInfo(s.category, s.collection, s.label, s.concept).category
}

/** The vertical marker of the edge of a span: darker when its concept is the inspected one. */
function delimiter(
  spans: ReadingSpan[],
  inspected: (string | null | undefined)[],
  normal: Record<string, string>,
  active: Record<string, string>,
) {
  if (spans.length === 0) return ''
  const isActive = (s: ReadingSpan) => inspected.includes(s.concept)
  const span = spans.find(isActive) || spans[0]
  const cat = categoryOf(span)
  const table = isActive(span) ? active : normal
  return ` ${table[cat] || table.general}`
}

/** The delimiter widths of a dimmed mark, in a transparent colour. */
function dimmedDelimiters(chunk: TextChunk) {
  const left = chunk.startingSpans.length > 0 ? ' border-l-2 border-l-transparent pl-0.5' : ''
  const right = chunk.endingSpans.length > 0 ? ' border-r-2 border-r-transparent pr-0.5' : ''
  return left + right
}

function highlightClass(chunk: TextChunk, hovered?: ReadingSpan, pinned?: ReadingSpan) {
  const isOverlap = chunk.matching.length > 1
  const doubled = isOverlap ? ' border-double' : ''
  if (hovered) return (CATEGORY_HOVER_STYLES[categoryOf(hovered)] || CATEGORY_HOVER_STYLES.general) + doubled
  if (pinned) return (CATEGORY_PINNED_STYLES[categoryOf(pinned)] || CATEGORY_PINNED_STYLES.general) + doubled
  const cat = chunk.catInfo?.category ?? 'general'
  if (isOverlap) return CATEGORY_OVERLAP_STYLES[cat] || CATEGORY_OVERLAP_STYLES.general
  return CATEGORY_STYLES[cat] || CATEGORY_STYLES.general
}

/** Props of {@link AnnotatedMark}. */
export interface AnnotatedMarkProps {
  /** A chunk covered by at least one span. */
  chunk: TextChunk
  hoveredConcept?: string | null
  pinnedConcept?: string | null
  onHoverConcept?: (uri: string | null) => void
  onPinConcept?: (uri: string) => void
}

/**
 * A highlighted run of the ancient text (RM-ANN-01: it adds no text to the text flow, only
 * the chunk itself). The pointer shortcuts sit on a presentation wrapper: hovering previews the
 * concept and a click pins it. The keyboard does the same with the toggles of the annotation
 * panel and the passage themes.
 */
export function AnnotatedMark({
  chunk,
  hoveredConcept,
  pinnedConcept,
  onHoverConcept,
  onPinConcept,
}: AnnotatedMarkProps) {
  const { t } = useI18n()
  const { matching, primaryMatch } = chunk
  if (!primaryMatch) return <span>{chunk.text}</span>

  const hoveredMatch = hoveredConcept ? matching.find((s) => s.concept === hoveredConcept) : undefined
  const pinnedMatch = pinnedConcept ? matching.find((s) => s.concept === pinnedConcept) : undefined
  const inspected = [hoveredConcept, pinnedConcept]
  const isDimmed = !!(hoveredConcept || pinnedConcept) && !hoveredMatch && !pinnedMatch

  const delimiters = isDimmed
    ? dimmedDelimiters(chunk)
    : delimiter(chunk.startingSpans, inspected, CATEGORY_DELIMITER_LEFT, CATEGORY_ACTIVE_DELIMITER_LEFT) +
      delimiter(chunk.endingSpans, inspected, CATEGORY_DELIMITER_RIGHT, CATEGORY_ACTIVE_DELIMITER_RIGHT)
  const highlight = isDimmed ? DIMMED : highlightClass(chunk, hoveredMatch, pinnedMatch)
  const pinHint = ` • ${pinnedMatch ? t.annotate.unpinAnnotationTooltip : t.annotate.pinAnnotationTooltip}`
  const tooltip = `${chunk.baseTooltip}${pinHint}`

  const handleClick = (e: MouseEvent) => {
    const sel = window.getSelection()
    // A drag that selects text must not pin.
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return
    e.stopPropagation()
    onPinConcept?.((pinnedMatch ?? primaryMatch).concept)
  }

  return (
    <span
      role="presentation"
      onMouseEnter={() => onHoverConcept?.(primaryMatch.concept)}
      onMouseLeave={() => onHoverConcept?.(null)}
      onClick={handleClick}
    >
      <mark className={`cursor-pointer rounded-none px-0.5 py-0 ${highlight} ${delimiters}`} title={tooltip}>
        {chunk.text}
        {chunk.isEndOfOverlap && (
          <span
            className="ml-0.5 inline-flex items-center rounded-none border border-accent/30 bg-accent/15 px-1 py-0 align-super font-mono text-[11px] font-bold text-accent-strong shadow-2xs select-none"
            title={tooltip}
          >
            {matching.length}
          </span>
        )}
        {chunk.stagedStatus && <StatusIcon status={chunk.stagedStatus} className="ml-0.5" />}
      </mark>
    </span>
  )
}
