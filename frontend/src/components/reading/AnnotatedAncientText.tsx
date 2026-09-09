import React from 'react'
import { StagedAnnotation } from '../../types'
import { ReadingParagraph, ReadingSpan } from './readingTypes'
import { resolveParagraphSpans } from './annotationResolver'
import {
  ConceptCategoryIcon,
  getConceptCategoryInfo,
  CATEGORY_STYLES,
  CATEGORY_HOVER_STYLES,
  CATEGORY_PINNED_STYLES,
  CATEGORY_OVERLAP_STYLES,
  CATEGORY_DELIMITER_LEFT,
  CATEGORY_DELIMITER_RIGHT,
  CATEGORY_ACTIVE_DELIMITER_LEFT,
  CATEGORY_ACTIVE_DELIMITER_RIGHT
} from '../ConceptCategoryBadge'
import { Tag } from 'lucide-react'

export interface AnnotatedAncientTextProps {
  p: ReadingParagraph
  referenceMap?: Record<string, any>
  stagedList?: StagedAnnotation[]
  filterConceptUri?: string | null
  hoveredConcept?: string | null
  pinnedConcept?: string | null
  onHoverConcept?: (uri: string | null) => void
  onPinConcept?: (uri: string) => void
  globalThemesTitle?: string
}

export const AnnotatedAncientText: React.FC<AnnotatedAncientTextProps> = ({
  p,
  referenceMap = {},
  stagedList = [],
  filterConceptUri,
  hoveredConcept,
  pinnedConcept,
  onHoverConcept,
  onPinConcept,
  globalThemesTitle = 'Thèmes du passage'
}) => {
  const { specificSpans, globalThemes } = resolveParagraphSpans(
    p,
    referenceMap,
    stagedList,
    filterConceptUri
  )

  const renderGlobalThemes = () => {
    if (globalThemes.length === 0) return null

    return (
      <div className="mb-4 pb-3 border-b border-[#eee5d6] flex flex-wrap gap-2 items-center select-none">
        <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#63503d] flex items-center space-x-1.5 mr-1">
          <Tag className="w-4 h-4 text-[#9A6530] shrink-0" />
          <span>{globalThemesTitle}</span>
        </span>
        {globalThemes.map((sp) => {
          const isHov = hoveredConcept === sp.concept
          const isPin = pinnedConcept === sp.concept

          return (
            <span
              key={`theme-${sp.concept}`}
              onMouseEnter={() => onHoverConcept?.(sp.concept)}
              onMouseLeave={() => onHoverConcept?.(null)}
              onClick={() => onPinConcept?.(sp.concept)}
              className={`cursor-pointer inline-flex items-center space-x-1.5 text-xs sm:text-sm font-semibold px-3 py-1 rounded-none border transition-all ${
                isPin
                  ? 'bg-[#9A6530] text-white border-[#855424] shadow-sm ring-2 ring-amber-500'
                  : isHov
                    ? 'bg-[#9A6530] text-white border-[#9A6530] shadow-sm ring-2 ring-[#9A6530]/30'
                    : 'bg-[#f7f2eb] text-[#4d3a28] border-[#ded4c5] hover:bg-[#ede3d4] hover:border-[#9A6530] shadow-2xs'
              }`}
              title={`${sp.label} (${sp.concept})`}
            >
              <ConceptCategoryIcon
                label={sp.label}
                uri={sp.concept}
                category={sp.category}
                collection={sp.collection}
                className="w-3.5 h-3.5 shrink-0"
              />
              <span>{sp.label}</span>
              {isPin && <span>📌</span>}
            </span>
          )
        })}
      </div>
    )
  }

  // Si aucun span spécifique dans le texte
  if (specificSpans.length === 0) {
    return (
      <div>
        {renderGlobalThemes()}
        <span>{p.text}</span>
      </div>
    )
  }

  // Interval Partitioning
  const boundarySet = new Set<number>([0, p.text.length])
  specificSpans.forEach((s) => {
    boundarySet.add(s.start)
    boundarySet.add(s.end)
  })
  const boundaries = Array.from(boundarySet).sort((a, b) => a - b)

  const elements: React.ReactNode[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const bStart = boundaries[i]
    const bEnd = boundaries[i + 1]
    const chunk = p.text.slice(bStart, bEnd)
    if (!chunk) continue

    const matching = specificSpans.filter((s) => s.start <= bStart && s.end >= bEnd)

    if (matching.length === 0) {
      elements.push(<span key={`txt-${bStart}-${bEnd}`}>{chunk}</span>)
    } else {
      const hoveredMatch = hoveredConcept ? matching.find((s) => s.concept === hoveredConcept) : null
      const pinnedMatch = pinnedConcept ? matching.find((s) => s.concept === pinnedConcept) : null
      const isPinned = !!pinnedMatch
      const isHovered = !!hoveredMatch
      const isOverlap = matching.length > 1
      const hasStaged = matching.some((s) => s.isStaged)

      // 1. Délimitation des séparations : repères verticaux de début et fin
      const startingSpans = specificSpans.filter((s) => s.start === bStart)
      const endingSpans = specificSpans.filter((s) => s.end === bEnd)
      const isSpanEnd = endingSpans.length > 0

      let borderDelimiters = ''
      if (startingSpans.length > 0) {
        const activeStart =
          startingSpans.find((s) => s.concept === hoveredConcept || s.concept === pinnedConcept) ||
          startingSpans[0]
        const startCat = getConceptCategoryInfo(
          activeStart.category,
          activeStart.collection,
          activeStart.label,
          activeStart.concept
        ).category
        const isAct = activeStart.concept === hoveredConcept || activeStart.concept === pinnedConcept
        borderDelimiters += ` ${
          isAct
            ? CATEGORY_ACTIVE_DELIMITER_LEFT[startCat] || CATEGORY_ACTIVE_DELIMITER_LEFT.general
            : CATEGORY_DELIMITER_LEFT[startCat] || CATEGORY_DELIMITER_LEFT.general
        }`
      }
      if (endingSpans.length > 0) {
        const activeEnd =
          endingSpans.find((s) => s.concept === hoveredConcept || s.concept === pinnedConcept) ||
          endingSpans[0]
        const endCat = getConceptCategoryInfo(
          activeEnd.category,
          activeEnd.collection,
          activeEnd.label,
          activeEnd.concept
        ).category
        const isAct = activeEnd.concept === hoveredConcept || activeEnd.concept === pinnedConcept
        borderDelimiters += ` ${
          isAct
            ? CATEGORY_ACTIVE_DELIMITER_RIGHT[endCat] || CATEGORY_ACTIVE_DELIMITER_RIGHT.general
            : CATEGORY_DELIMITER_RIGHT[endCat] || CATEGORY_DELIMITER_RIGHT.general
        }`
      }

      // 2. Détermination de la classe de surlignage
      const primaryMatch = matching[0]
      const catInfo = getConceptCategoryInfo(
        primaryMatch.category,
        primaryMatch.collection,
        primaryMatch.label,
        primaryMatch.concept
      )

      let badgeClass = ''
      if (isHovered && hoveredMatch) {
        // Le survol dynamique est prioritaire pour donner un retour immédiat
        const hCat = getConceptCategoryInfo(
          hoveredMatch.category,
          hoveredMatch.collection,
          hoveredMatch.label,
          hoveredMatch.concept
        ).category
        badgeClass =
          (CATEGORY_HOVER_STYLES[hCat] || CATEGORY_HOVER_STYLES.general) +
          (isOverlap ? ' border-double' : '')
      } else if (isPinned && pinnedMatch) {
        // Concept épinglé fixe
        const pCat = getConceptCategoryInfo(
          pinnedMatch.category,
          pinnedMatch.collection,
          pinnedMatch.label,
          pinnedMatch.concept
        ).category
        badgeClass =
          (CATEGORY_PINNED_STYLES[pCat] || CATEGORY_PINNED_STYLES.general) +
          (isOverlap ? ' border-double' : '')
      } else if (isOverlap) {
        badgeClass = CATEGORY_OVERLAP_STYLES[catInfo.category] || CATEGORY_OVERLAP_STYLES.general
      } else {
        badgeClass = CATEGORY_STYLES[catInfo.category] || CATEGORY_STYLES.general
      }

      // Fin de chevauchement pour le compteur numérique
      const nextMatchingCount =
        i < boundaries.length - 2
          ? specificSpans.filter((s) => s.start <= boundaries[i + 1] && s.end >= boundaries[i + 2]).length
          : 0
      const isEndOfOverlap = isOverlap && (nextMatchingCount !== matching.length || isSpanEnd)

      const pinHint = isPinned ? ' • Cliquer pour désépingler' : ' • Cliquer pour épingler'
      const tooltip =
        (isOverlap
          ? `${matching.length} concepts superposés :\n${matching
              .map((s) => {
                const cInfo = getConceptCategoryInfo(s.category, s.collection, s.label, s.concept)
                return `• [${cInfo.label}] ${s.label}${s.isStaged ? ' [Staging]' : ''}`
              })
              .join('\n')}`
          : `[${catInfo.label}] ${primaryMatch.label}${primaryMatch.isStaged ? ' [Staging]' : ''}`) + pinHint

      const hasActiveInspection = !!(hoveredConcept || pinnedConcept)
      const isInspected = isHovered || isPinned
      const dimClass = hasActiveInspection && !isInspected ? ' opacity-40 hover:opacity-100 transition-opacity' : ''

      elements.push(
        <mark
          key={`mark-${bStart}-${bEnd}`}
          onMouseEnter={() => onHoverConcept?.(primaryMatch.concept)}
          onMouseLeave={() => onHoverConcept?.(null)}
          onClick={(e) => {
            const sel = window.getSelection()
            if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
              return
            }
            e.stopPropagation()
            const clicked = (pinnedMatch ? pinnedMatch.concept : primaryMatch?.concept) || null
            if (clicked) {
              onPinConcept?.(clicked)
            }
          }}
          className={`rounded-none px-0.5 py-0 transition-colors cursor-pointer ${badgeClass} ${borderDelimiters}${dimClass}`}
          title={tooltip}
        >
          {chunk}
          {isEndOfOverlap && (
            <span
              className="inline-flex items-center text-[9px] font-mono font-bold px-1 py-0 rounded-none bg-[#9A6530]/15 text-[#6e461f] align-super select-none ml-0.5 border border-[#9A6530]/30 shadow-2xs"
              title={tooltip}
            >
              {matching.length}
            </span>
          )}
          {hasStaged && (
            <span className="ml-0.5 text-[9px] uppercase font-mono bg-emerald-700 text-white px-1 py-0.2 rounded-none inline-block">
              stg
            </span>
          )}
        </mark>
      )
    }
  }

  return (
    <div>
      {renderGlobalThemes()}
      <span>{elements}</span>
    </div>
  )
}
