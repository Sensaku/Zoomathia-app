import React from 'react'
import { StagedAnnotation } from '../../types'
import { ReadingParagraph, ConceptInspectionState } from './readingTypes'
import { AnnotatedAncientText } from './AnnotatedAncientText'
import {
  CATEGORY_PARA_PINNED,
  CATEGORY_PARA_HOVER,
  CATEGORY_BADGE_PINNED,
  CATEGORY_BADGE_HOVER,
  CATEGORY_TAG_PINNED,
  CATEGORY_TAG_HOVER
} from '../ConceptCategoryBadge'
import { Sparkles, PlusCircle, Layers } from 'lucide-react'

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
    setHoveredConcept,
    setPinnedConcept
  } = inspectionState

  const hasInspectedConcept =
    activeInspectionConcept !== null && activeInspectionParagraphUris.has(p.uri)
  const isHovering = hoveredConcept !== null
  const isHoveredSpanPara = isHovering && hasInspectedConcept
  const isPinnedSpanPara = !isHovering && !!pinnedConcept && hasInspectedConcept

  const paraBorderClass = isCurrentPara
    ? hasInspectedConcept
      ? isHoveredSpanPara
        ? `${CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general} ring-2 ring-offset-1`
        : `${CATEGORY_PARA_PINNED[activeInspectionCategory] || CATEGORY_PARA_PINNED.general} ring-2 ring-offset-1`
      : 'border-[#9A6530] border-l-4 bg-[#fffdfb] shadow-md ring-2 ring-[#9A6530]/40 ring-offset-1'
    : isPinnedSpanPara
      ? (CATEGORY_PARA_PINNED[activeInspectionCategory] || CATEGORY_PARA_PINNED.general)
      : isHoveredSpanPara
        ? (CATEGORY_PARA_HOVER[activeInspectionCategory] || CATEGORY_PARA_HOVER.general)
        : 'border-[#ede4d4] bg-[#fcfaf7]/70 hover:bg-white hover:border-[#cfc3af] hover:shadow-2xs'

  return (
    <article
      id={p.uri}
      data-para-uri={p.uri}
      tabIndex={isCurrentPara ? 0 : -1}
      onClick={onClick}
      className={`p-4 sm:p-5 rounded-none border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9A6530] ${paraBorderClass}`}
    >
      {/* En-tête du paragraphe */}
      <div className="flex items-start justify-between mb-2.5 select-none gap-2">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-none border inline-flex items-center justify-center text-center leading-none select-none ${
              isCurrentPara
                ? 'bg-[#9A6530] text-white border-[#855424]'
                : isPinnedSpanPara
                  ? (CATEGORY_BADGE_PINNED[activeInspectionCategory] || CATEGORY_BADGE_PINNED.general)
                  : isHoveredSpanPara
                    ? (CATEGORY_BADGE_HOVER[activeInspectionCategory] || CATEGORY_BADGE_HOVER.general)
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

          {annotationCount > 0 && !hasInspectedConcept && !isCurrentPara && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-[#855424] border border-amber-200/80">
              {annotationCount} annot{annotationCount > 1 ? 's' : ''}
            </span>
          )}

          {hasInspectedConcept && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full select-none flex items-center flex-wrap gap-x-1 min-w-0 ${
                isHoveredSpanPara
                  ? (CATEGORY_TAG_HOVER[activeInspectionCategory] || CATEGORY_TAG_HOVER.general)
                  : (CATEGORY_TAG_PINNED[activeInspectionCategory] || CATEGORY_TAG_PINNED.general)
              }`}
            >
              {isHoveredSpanPara ? <Layers className="w-2.5 h-2.5 shrink-0" /> : <span className="shrink-0">📌</span>}
              <span className="whitespace-normal break-words">
                {isCurrentPara
                  ? `${presentHereTagText} ${activeInspectionLabel ? `(« ${activeInspectionLabel} »)` : ''}`
                  : isHoveredSpanPara
                    ? `${associatedTagText} ${activeInspectionLabel ? `(« ${activeInspectionLabel} »)` : ''}`
                    : `${pinnedTagText} ${activeInspectionLabel ? `(« ${activeInspectionLabel} »)` : ''}`}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isCurrentPara && selectedSnippet && onAnnotateSnippet && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onAnnotateSnippet()
              }}
              className="inline-flex items-center space-x-1 text-[11px] font-semibold bg-[#9A6530] text-white px-2.5 py-1 rounded-none shadow hover:bg-[#855424] transition-all animate-pulse"
              title="Cliquer pour annoter ce mot ou passage"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>
                {annotateButtonText} « {selectedSnippet.slice(0, 15)}{selectedSnippet.length > 15 ? '...' : ''} »
              </span>
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
        ) : hasInspectedConcept ? (
          <AnnotatedAncientText
            p={p}
            referenceMap={referenceMap}
            stagedList={stagedList}
            filterConceptUri={activeInspectionConcept}
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
