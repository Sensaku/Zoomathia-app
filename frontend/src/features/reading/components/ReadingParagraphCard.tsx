import React, { useCallback, useId, useMemo } from 'react'
import { PlusCircle, Pin, Sparkles } from 'lucide-react'
import {
  CATEGORY_PARA_HOVER,
  CATEGORY_PARA_PINNED,
  CATEGORY_TAG_HOVER,
  CATEGORY_TAG_PINNED,
} from '../../../components/ConceptCategoryBadge'
import type { ConceptInspectionState, ReadingParagraph } from '../../../components/reading'
import { useI18n } from '../../../i18n'
import type { StagedAnnotation } from '../../../types'
import { AnnotatedAncientText } from './AnnotatedAncientText'
import type { TextSize } from './TextSizeToggle'

/** Props of {@link ReadingParagraphCard}. */
export interface ReadingParagraphCardProps {
  p: ReadingParagraph
  isCurrentPara: boolean
  /** Reference annotations of the paragraph. */
  referenceMap?: Record<string, any>
  /** Contributions of the work. */
  stagedList?: StagedAnnotation[]
  inspectionState: ConceptInspectionState
  textSize: TextSize
  showTranslation?: boolean
  translationP?: ReadingParagraph
  /** Number of annotations, shown on a paragraph that is not the active one. */
  annotationCount?: number
  /** A click anywhere on the card makes the paragraph active. */
  onActivate: () => void
  /** Called on mouse up in the text: the page reads the selection. */
  onTextSelection?: (p: ReadingParagraph) => void
  selectedSnippet?: string | null
  onAnnotateSnippet?: () => void
}

const NO_REFERENCES: Record<string, any> = {}
const NO_STAGED: StagedAnnotation[] = []

const TEXT_SIZES: Record<TextSize, string> = {
  normal: 'text-base md:text-lg',
  large: 'text-lg md:text-xl',
  xlarge: 'text-xl md:text-2xl',
}
const TRANSLATION_SIZES: Record<TextSize, string> = {
  normal: 'text-sm md:text-base',
  large: 'text-base md:text-lg',
  xlarge: 'text-lg md:text-xl',
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

/**
 * A paragraph of the reader and the studio: its header, its text with the annotations
 * highlighted, and the aligned translation.
 *
 * A click anywhere on the card makes the paragraph active; the keyboard does it with the
 * paragraph buttons of the table of contents. RM-ANN-01: the pages resolve a free text selection
 * with `closest('[data-para-uri]')`. The attribute is on the text container and on the content
 * wrapper (header, text, translation), never on the article, so a boundary on the article or on
 * the wrapper itself resolves to nothing and falls back to the paragraph, as before the wrapper existed.
 * The children of the text container must stay as they are.
 */
export const ReadingParagraphCard: React.FC<ReadingParagraphCardProps> = React.memo(
  ({
    p,
    isCurrentPara,
    referenceMap = NO_REFERENCES,
    stagedList = NO_STAGED,
    inspectionState,
    textSize,
    showTranslation = false,
    translationP,
    annotationCount = 0,
    onActivate,
    onTextSelection,
    selectedSnippet,
    onAnnotateSnippet,
  }) => {
    const { t } = useI18n()
    const numberId = useId()
    const {
      activeInspectionCategory,
      hoveredConcept,
      pinnedConcept,
      pinnedConceptLabel,
      pinnedConceptCategory,
      pinnedParagraphUris,
      hoveredParagraphUris,
      setHoveredConcept,
      setPinnedConcept,
    } = inspectionState

    const hasPinnedConcept = !!pinnedConcept && (pinnedParagraphUris?.has(p.uri) ?? false)
    const hasHoveredConcept = !!hoveredConcept && (hoveredParagraphUris?.has(p.uri) ?? false)
    const hoverCategory = CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general
    const pinCategory = CATEGORY_PARA_PINNED[pinnedConceptCategory] || CATEGORY_PARA_PINNED.general

    let state: string
    if (hasHoveredConcept) state = hoverCategory
    else if (hasPinnedConcept) state = pinCategory
    else if (isCurrentPara) state = 'border-accent bg-paper-raised shadow-md ring-2 ring-accent/40 ring-offset-1'
    else state = 'border-rule bg-paper hover:bg-white hover:shadow-2xs'
    if (isCurrentPara && (hasHoveredConcept || hasPinnedConcept)) state += ' ring-2 ring-offset-1'

    // The concepts to show in a paragraph that is not active. Built from primitives, so the
    // array keeps its reference while the hover concerns other paragraphs and the text does not recompute.
    const hoverFilter = hasHoveredConcept ? hoveredConcept : null
    const pinFilter = hasPinnedConcept ? pinnedConcept : null
    const activeFilters = useMemo(() => {
      if (isCurrentPara) return null
      const list = [hoverFilter, pinFilter].filter(
        (concept, i, all): concept is string => concept !== null && all.indexOf(concept) === i,
      )
      return list.length > 0 ? list : null
    }, [isCurrentPara, hoverFilter, pinFilter])

    const togglePin = useCallback(
      (concept: string) => setPinnedConcept((prev) => (prev === concept ? null : concept)),
      [setPinnedConcept],
    )

    let badge = 'border-rule bg-paper-sunken text-accent-strong'
    if (isCurrentPara) badge = 'border-accent-strong bg-accent text-white'
    else if (hasHoveredConcept) badge = CATEGORY_TAG_HOVER[activeInspectionCategory] || CATEGORY_TAG_HOVER.general
    else if (hasPinnedConcept) badge = CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general

    const annotatedText = (filterConceptUri?: string[]) => (
      <AnnotatedAncientText
        p={p}
        referenceMap={referenceMap}
        stagedList={stagedList}
        filterConceptUri={filterConceptUri}
        hoveredConcept={hoveredConcept}
        pinnedConcept={pinnedConcept}
        onHoverConcept={setHoveredConcept}
        onPinConcept={togglePin}
      />
    )

    return (
      <article
        id={p.uri}
        tabIndex={-1}
        aria-labelledby={numberId}
        aria-current={isCurrentPara ? 'true' : undefined}
        className={`rounded-none border border-l-4 transition-colors duration-75 ${FOCUS_RING} ${state}`}
      >
        {/* Pointer shortcut: a click anywhere makes the paragraph active; the table of contents does it with the keyboard. */}
        <div role="presentation" data-para-uri={p.uri} onClick={onActivate} className="cursor-pointer p-4 sm:p-5">
          <div className="mb-2.5 flex min-h-6 items-start justify-between gap-2 select-none">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                id={numberId}
                className={`inline-flex items-center justify-center rounded-none border px-2 py-0.5 text-center font-mono text-xs leading-none font-bold ${badge}`}
              >
                § {p.id}
              </span>

              {p.sectionTitle && (
                <span className="max-w-48 truncate text-xs font-medium text-ink-subtle">{p.sectionTitle}</span>
              )}

              {annotationCount > 0 && !isCurrentPara && (
                <span className="shrink-0 rounded-full border border-rule bg-paper-sunken px-2 py-0.5 text-[11px] font-semibold text-accent-strong">
                  {t.annotate.annotationCount.replace('{count}', String(annotationCount))}
                </span>
              )}

              {hasPinnedConcept && (
                <span
                  title={pinnedConceptLabel || undefined}
                  className={`inline-flex max-w-48 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
                  }`}
                >
                  <Pin aria-hidden="true" className="h-3 w-3 shrink-0" />
                  {pinnedConceptLabel ? (
                    <>
                      <span aria-hidden="true" className="truncate">
                        {pinnedConceptLabel}
                      </span>
                      <span className="sr-only">
                        {t.annotate.pinnedPassageOf.replace('{label}', pinnedConceptLabel)}
                      </span>
                    </>
                  ) : (
                    <span className="truncate">{t.annotate.pinnedPassage}</span>
                  )}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isCurrentPara && selectedSnippet && onAnnotateSnippet && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAnnotateSnippet()
                  }}
                  className={`inline-flex cursor-pointer items-center justify-center gap-1 rounded-none bg-accent px-2.5 py-1 text-center text-xs leading-none font-medium text-white shadow-xs transition-colors hover:bg-accent-strong ${FOCUS_RING}`}
                  title={t.work.annotateSelectionTitle}
                >
                  <PlusCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.work.annotatePassage}</span>
                </button>
              )}

              {isCurrentPara && (
                <span className="inline-flex items-center justify-center gap-1 rounded-full border border-rule bg-paper-sunken px-2 py-0.5 text-center text-[11px] leading-none font-medium text-accent-strong">
                  <Sparkles aria-hidden="true" className="h-3 w-3 shrink-0" />
                  <span>{t.work.activeParagraph}</span>
                </span>
              )}
            </div>
          </div>

          {/* The text container: the pages read the selection from it (RM-ANN-01). */}
          <div
            role="presentation"
            data-para-uri={p.uri}
            className={`ancient-text leading-relaxed text-ink transition-all select-text ${TEXT_SIZES[textSize]}`}
            onMouseUp={() => onTextSelection?.(p)}
          >
            {isCurrentPara || activeFilters ? annotatedText(activeFilters ?? undefined) : <span>{p.text}</span>}
          </div>

          {showTranslation && translationP && (
            <div
              className={`mt-3.5 border-t border-rule pt-3 leading-relaxed text-ink-muted italic transition-all select-none ${TRANSLATION_SIZES[textSize]}`}
            >
              <span className="mr-1.5 text-[11px] font-semibold text-ink-subtle uppercase not-italic select-none">
                {t.work.translationTag}
              </span>
              {translationP.text}
            </div>
          )}
        </div>
      </article>
    )
  },
)

ReadingParagraphCard.displayName = 'ReadingParagraphCard'
