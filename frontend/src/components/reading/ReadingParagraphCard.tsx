import React, { useMemo } from 'react'
import { StagedAnnotation } from '../../types'
import { ReadingParagraph, ConceptInspectionState } from './readingTypes'
import { AnnotatedAncientText } from './AnnotatedAncientText'
import {
  CATEGORY_PARA_PINNED,
  CATEGORY_PARA_HOVER,
  CATEGORY_BADGE_PINNED,
  CATEGORY_BADGE_HOVER,
  CATEGORY_TAG_PINNED
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

export const ReadingParagraphCard: React.FC<ReadingParagraphCardProps> = React.memo(({
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
  annotateButtonText = 'Annoter'
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
    setPinnedConcept
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
      ? (CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general)
      : hasPinnedConcept
        ? (CATEGORY_PARA_PINNED[pinnedConceptCategory] || CATEGORY_PARA_PINNED.general)
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
      className={`p-4 sm:p-5 rounded-none border border-l-4 transition-colors duration-75 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9A6530] ${paraBorderClass}`}
    >
      {/* En-tête du paragraphe */}
      <div className="flex items-start justify-between mb-2.5 select-none gap-2 min-h-[26px]">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-none border inline-flex items-center justify-center text-center leading-none select-none ${
              isCurrentPara
                ? 'bg-[#9A6530] text-white border-[#855424]'
                : hasHoveredConcept
                  ? (CATEGORY_BADGE_HOVER[activeInspectionCategory] || CATEGORY_BADGE_HOVER.general)
                  : hasPinnedConcept
                    ? (CATEGORY_BADGE_PINNED[pinnedConceptCategory] || CATEGORY_BADGE_PINNED.general)
                    : 'bg-[#f4ede2] text-[#6d4c24] border-[#ded5c6]'
            }`}
          >
            § {p.id}
          </span>

          {p.sectionTitle && (
            <span className="text-xs text-[#736a5f] font-medium truncate max-w-[200px]">
              {p.sectionTitle}
            </span>
          )}

          {annotationCount > 0 && !isCurrentPara && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-[#855424] border border-amber-200/80 shrink-0">
              {annotationCount} annot{annotationCount > 1 ? 's' : ''}
            </span>
          )}

          {hasPinnedConcept && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full select-none inline-flex items-center space-x-1 shrink-0 max-w-[200px] truncate ${
                CATEGORY_TAG_PINNED[pinnedConceptCategory] || CATEGORY_TAG_PINNED.general
              }`}
              title={`${pinnedTagText} : ${pinnedConceptLabel || ''}`}
            >
              <span className="shrink-0">📌</span>
              <span className="truncate">
                {pinnedConceptLabel || pinnedTagText}
              </span>
            </span>
          )}
        </div>

        {/* Tag Paragraphe Actif ou Bouton d'Annotation */}
        <div className="flex items-center space-x-2 shrink-0">
          {isCurrentPara && selectedSnippet && onAnnotateSnippet && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAnnotateSnippet()
              }}
              className="inline-flex items-center justify-center text-center leading-none space-x-1 text-xs bg-[#9A6530] hover:bg-[#855424] text-white font-medium px-2.5 py-1 rounded-none shadow-xs transition-colors cursor-pointer"
              title="Annoter le passage sélectionné"
            >
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{annotateButtonText}</span>
            </button>
          )}

          {isCurrentPara && (
            <span className="inline-flex items-center justify-center text-center leading-none space-x-1 text-[11px] text-[#9A6530] font-medium bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3 shrink-0" />
              <span>{activeParagraphText}</span>
            </span>
          )}
        </div>
      </div>

      {/* Corps de texte ancien */}
      <div
        data-para-uri={p.uri}
        className={`ancient-text select-text transition-all text-[#201c18] leading-relaxed ${
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
          className={`mt-3.5 pt-3 border-t border-[#ede4d4] text-[#5c544a] italic leading-relaxed transition-all select-none ${
            textSize === 'normal'
              ? 'text-sm md:text-base'
              : textSize === 'xlarge'
                ? 'text-lg md:text-xl'
                : 'text-base md:text-lg'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase not-italic text-[#8c8275] mr-1.5 select-none">
            {translationTagText}
          </span>
          {translationP.text}
        </div>
      )}
    </article>
  )
})

ReadingParagraphCard.displayName = 'ReadingParagraphCard'
