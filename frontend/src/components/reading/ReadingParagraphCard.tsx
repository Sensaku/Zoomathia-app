import React, { useMemo } from 'react'
import { StagedAnnotation } from '../../types'
import { ReadingParagraph, ConceptInspectionState } from './readingTypes'
import { AnnotatedAncientText } from './AnnotatedAncientText'
import {
  CATEGORY_PARA_PINNED,
  CATEGORY_PARA_HOVER,
  CATEGORY_BADGE_PINNED,
  CATEGORY_BADGE_HOVER,
  CATEGORY_TAG_PINNED,
} from '../ConceptCategoryBadge'
import { Sparkles, PlusCircle } from 'lucide-react'

export interface ReadingParagraphCardProps {
  p: ReadingParagraph
  idx: number
  isCurrentPara: boolean
  referenceMap?: Record<string, any>
  stagedList?: StagedAnnotation[]
  inspectionState: ConceptInspectionState
  textSize: 'normal' | 'large' | 'xlarge'
  showTranslation?: boolean
  translationP?: ReadingParagraph
  annotationCount?: number
  onClick: () => void
  onTextSelection?: (p: ReadingParagraph) => void
  selectedSnippet?: string | null
  onAnnotateSnippet?: () => void
  translationTagText?: string
  activeParagraphText?: string
  associatedTagText?: string
  pinnedTagText?: string
  presentHereTagText?: string
  annotateButtonText?: string
}

export const ReadingParagraphCard: React.FC<ReadingParagraphCardProps> = React.memo(
  ({
    p,
    idx,
    isCurrentPara,
    referenceMap = {},
    stagedList = [],
    inspectionState,
    textSize,
    showTranslation = false,
    translationP,
    annotationCount = 0,
    onClick,
    onTextSelection,
    selectedSnippet,
    onAnnotateSnippet,
    translationTagText = 'Traduction :',
    activeParagraphText = 'Paragraphe actif',
    associatedTagText = 'Passage associé',
    pinnedTagText = 'Passage lié',
    presentHereTagText = 'Concept présent ici',
    annotateButtonText = 'Annoter',
  }) => {
    const {
      activeInspectionConcept,
      activeInspectionParagraphUris,
      activeInspectionLabel,
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

    const paraBorderClass = isCurrentPara
      ? hasHoveredConcept
        ? `${CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general} ring-2 ring-offset-1`
        : hasPinnedConcept
          ? `${CATEGORY_PARA_PINNED[pinnedConceptCategory] || CATEGORY_PARA_PINNED.general} ring-2 ring-offset-1`
          : 'border-[#9A6530] border-l-[#9A6530] bg-[#fffdfb] shadow-md ring-2 ring-[#9A6530]/40 ring-offset-1'
      : hasHoveredConcept
        ? CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general
        : hasPinnedConcept
          ? CATEGORY_PARA_PINNED[pinnedConceptCategory] || CATEGORY_PARA_PINNED.general
          : 'border-[#ede4d4] border-l-[#ede4d4] bg-[#fcfaf7]/70 hover:bg-white hover:border-[#cfc3af] hover:border-l-[#cfc3af] hover:shadow-2xs'

    // Détermination des concepts à afficher pour ce paragraphe non actif (concept épinglé et/ou survolé)
    const activeFilters = useMemo(() => {
      if (isCurrentPara) return null
      const list: string[] = []
      if (hasHoveredConcept && hoveredConcept) {
        list.push(hoveredConcept)
      }
      if (hasPinnedConcept && pinnedConcept && !list.includes(pinnedConcept)) {
        list.push(pinnedConcept)
      }
      return list.length > 0 ? list : null
    }, [isCurrentPara, hasHoveredConcept, hoveredConcept, hasPinnedConcept, pinnedConcept])

    return (
      <article
        id={p.uri}
        data-para-uri={p.uri}
        tabIndex={isCurrentPara ? 0 : -1}
        onClick={onClick}
        className={`cursor-pointer rounded-none border border-l-4 p-4 transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9A6530] sm:p-5 ${paraBorderClass}`}
      >
        {/* En-tête du paragraphe */}
        <div className="mb-2.5 flex min-h-[26px] items-start justify-between gap-2 select-none">
          <div className="flex flex-wrap items-center space-x-2 gap-y-1">
            <span
              className={`inline-flex items-center justify-center rounded-none border px-2 py-0.5 text-center font-mono text-xs leading-none font-bold select-none ${
                isCurrentPara
                  ? 'border-[#855424] bg-[#9A6530] text-white'
                  : hasHoveredConcept
                    ? CATEGORY_BADGE_HOVER[activeInspectionCategory] || CATEGORY_BADGE_HOVER.general
                    : hasPinnedConcept
                      ? CATEGORY_BADGE_PINNED[pinnedConceptCategory] || CATEGORY_BADGE_PINNED.general
                      : 'border-[#ded5c6] bg-[#f4ede2] text-[#6d4c24]'
              }`}
            >
              § {p.id}
            </span>

            {p.sectionTitle && (
              <span className="max-w-[200px] truncate text-xs font-medium text-[#736a5f]">{p.sectionTitle}</span>
            )}

            {annotationCount > 0 && !isCurrentPara && (
              <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-[#855424]">
                {annotationCount} annot{annotationCount > 1 ? 's' : ''}
              </span>
            )}

            {hasPinnedConcept && (
              <span
                className={`inline-flex max-w-[200px] shrink-0 items-center space-x-1 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold select-none ${
                  CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
                }`}
                title={`${pinnedTagText} : ${pinnedConceptLabel || ''}`}
              >
                <span className="shrink-0">📌</span>
                <span className="truncate">{pinnedConceptLabel || pinnedTagText}</span>
              </span>
            )}
          </div>

          {/* Tag Paragraphe Actif ou Bouton d'Annotation */}
          <div className="flex shrink-0 items-center space-x-2">
            {isCurrentPara && selectedSnippet && onAnnotateSnippet && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onAnnotateSnippet()
                }}
                className="inline-flex cursor-pointer items-center justify-center space-x-1 rounded-none bg-[#9A6530] px-2.5 py-1 text-center text-xs leading-none font-medium text-white shadow-xs transition-colors hover:bg-[#855424]"
                title="Annoter le passage sélectionné"
              >
                <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{annotateButtonText}</span>
              </button>
            )}

            {isCurrentPara && (
              <span className="inline-flex items-center justify-center space-x-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-center text-[11px] leading-none font-medium text-[#9A6530]">
                <Sparkles className="h-3 w-3 shrink-0" />
                <span>{activeParagraphText}</span>
              </span>
            )}
          </div>
        </div>

        {/* Corps de texte ancien */}
        <div
          data-para-uri={p.uri}
          className={`ancient-text leading-relaxed text-[#201c18] transition-all select-text ${
            textSize === 'normal'
              ? 'text-base md:text-lg'
              : textSize === 'xlarge'
                ? 'text-xl md:text-2xl'
                : 'text-lg md:text-xl'
          }`}
          onMouseUp={() => onTextSelection?.(p)}
        >
          {isCurrentPara ? (
            <AnnotatedAncientText
              p={p}
              referenceMap={referenceMap}
              stagedList={stagedList}
              hoveredConcept={hoveredConcept}
              pinnedConcept={pinnedConcept}
              onHoverConcept={setHoveredConcept}
              onPinConcept={(c) => setPinnedConcept((prev) => (prev === c ? null : c))}
            />
          ) : activeFilters ? (
            <AnnotatedAncientText
              p={p}
              referenceMap={referenceMap}
              stagedList={stagedList}
              filterConceptUri={activeFilters}
              hoveredConcept={hoveredConcept}
              pinnedConcept={pinnedConcept}
              onHoverConcept={setHoveredConcept}
              onPinConcept={(c) => setPinnedConcept((prev) => (prev === c ? null : c))}
            />
          ) : (
            <span>{p.text}</span>
          )}
        </div>

        {/* Traduction alignée synoptique */}
        {showTranslation && translationP && (
          <div
            className={`mt-3.5 border-t border-[#ede4d4] pt-3 leading-relaxed text-[#5c544a] italic transition-all select-none ${
              textSize === 'normal'
                ? 'text-sm md:text-base'
                : textSize === 'xlarge'
                  ? 'text-lg md:text-xl'
                  : 'text-base md:text-lg'
            }`}
          >
            <span className="mr-1.5 text-[10px] font-semibold text-[#8c8275] uppercase not-italic select-none">
              {translationTagText}
            </span>
            {translationP.text}
          </div>
        )}
      </article>
    )
  },
)

ReadingParagraphCard.displayName = 'ReadingParagraphCard'
