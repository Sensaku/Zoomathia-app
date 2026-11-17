import React, { useMemo } from 'react'
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
  CATEGORY_ACTIVE_DELIMITER_RIGHT,
} from '../ConceptCategoryBadge'
import { Tag } from 'lucide-react'

export interface AnnotatedAncientTextProps {
  p: ReadingParagraph
  referenceMap?: Record<string, any>
  stagedList?: StagedAnnotation[]
  filterConceptUri?: string | string[] | null
  hoveredConcept?: string | null
  pinnedConcept?: string | null
  onHoverConcept?: (uri: string | null) => void
  onPinConcept?: (uri: string) => void
  globalThemesTitle?: string
}

export const AnnotatedAncientText: React.FC<AnnotatedAncientTextProps> = React.memo(
  ({
    p,
    referenceMap = {},
    stagedList = [],
    filterConceptUri,
    hoveredConcept,
    pinnedConcept,
    onHoverConcept,
    onPinConcept,
    globalThemesTitle = 'Thèmes du passage',
  }) => {
    // Clé sérialisée stable pour le filtre de concepts
    const filterKey = Array.isArray(filterConceptUri) ? filterConceptUri.join('||') : filterConceptUri || ''

    // Pré-calcul mémoisé de la résolution des spans et du découpage en intervalles
    // Cette étape lourde ne s'exécute QUE si le texte ou les annotations du paragraphe changent, jamais au simple survol.
    const { specificSpans, globalThemes, chunkData } = useMemo(() => {
      const { specificSpans, globalThemes } = resolveParagraphSpans(p, referenceMap, stagedList, filterConceptUri)

      if (specificSpans.length === 0) {
        return { specificSpans, globalThemes, chunkData: [] }
      }

      const boundarySet = new Set<number>([0, p.text.length])
      specificSpans.forEach((s) => {
        boundarySet.add(s.start)
        boundarySet.add(s.end)
      })
      const boundaries = Array.from(boundarySet).sort((a, b) => a - b)

      const chunkData: Array<{
        bStart: number
        bEnd: number
        chunk: string
        matching: ReadingSpan[]
        startingSpans: ReadingSpan[]
        endingSpans: ReadingSpan[]
        isEndOfOverlap: boolean
        primaryMatch: ReadingSpan | null
        catInfo: ReturnType<typeof getConceptCategoryInfo> | null
        baseTooltip: string
        hasStaged: boolean
      }> = []

      for (let i = 0; i < boundaries.length - 1; i++) {
        const bStart = boundaries[i]
        const bEnd = boundaries[i + 1]
        const chunk = p.text.slice(bStart, bEnd)
        if (!chunk) continue

        const matching = specificSpans.filter((s) => s.start <= bStart && s.end >= bEnd)
        if (matching.length === 0) {
          chunkData.push({
            bStart,
            bEnd,
            chunk,
            matching: [],
            startingSpans: [],
            endingSpans: [],
            isEndOfOverlap: false,
            primaryMatch: null,
            catInfo: null,
            baseTooltip: '',
            hasStaged: false,
          })
        } else {
          const startingSpans = specificSpans.filter((s) => s.start === bStart)
          const endingSpans = specificSpans.filter((s) => s.end === bEnd)
          const isSpanEnd = endingSpans.length > 0
          const isOverlap = matching.length > 1
          const primaryMatch = matching[0]
          const catInfo = getConceptCategoryInfo(
            primaryMatch.category,
            primaryMatch.collection,
            primaryMatch.label,
            primaryMatch.concept,
          )
          const hasStaged = matching.some((s) => s.isStaged)

          const nextMatchingCount =
            i < boundaries.length - 2
              ? specificSpans.filter((s) => s.start <= boundaries[i + 1] && s.end >= boundaries[i + 2]).length
              : 0
          const isEndOfOverlap = isOverlap && (nextMatchingCount !== matching.length || isSpanEnd)

          const baseTooltip = isOverlap
            ? `${matching.length} concepts superposés :\n${matching
                .map((s) => {
                  const cInfo = getConceptCategoryInfo(s.category, s.collection, s.label, s.concept)
                  return `• [${cInfo.label}] ${s.label}${s.isStaged ? ' [Staging]' : ''}`
                })
                .join('\n')}`
            : `[${catInfo.label}] ${primaryMatch.label}${primaryMatch.isStaged ? ' [Staging]' : ''}`

          chunkData.push({
            bStart,
            bEnd,
            chunk,
            matching,
            startingSpans,
            endingSpans,
            isEndOfOverlap,
            primaryMatch,
            catInfo,
            baseTooltip,
            hasStaged,
          })
        }
      }

      return { specificSpans, globalThemes, chunkData }
    }, [p, referenceMap, stagedList, filterKey])

    const renderGlobalThemes = () => {
      if (globalThemes.length === 0) return null

      return (
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[#eee5d6] pb-3 select-none">
          <span className="mr-1 flex items-center space-x-1.5 text-xs font-bold tracking-wider text-[#63503d] uppercase sm:text-sm">
            <Tag className="h-4 w-4 shrink-0 text-[#9A6530]" />
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
                className={`inline-flex cursor-pointer items-center space-x-1.5 rounded-none border px-3 py-1 text-xs font-semibold sm:text-sm ${
                  isPin
                    ? 'border-[#855424] bg-[#9A6530] text-white shadow-sm ring-2 ring-amber-500'
                    : isHov
                      ? 'border-[#9A6530] bg-[#9A6530] text-white shadow-sm ring-2 ring-[#9A6530]/30'
                      : 'border-[#ded4c5] bg-[#f7f2eb] text-[#4d3a28] shadow-2xs hover:border-[#9A6530] hover:bg-[#ede3d4]'
                }`}
                title={`${sp.label} (${sp.concept})`}
              >
                <ConceptCategoryIcon
                  label={sp.label}
                  uri={sp.concept}
                  category={sp.category}
                  collection={sp.collection}
                  className="h-3.5 w-3.5 shrink-0"
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

    const elements = chunkData.map((item) => {
      const {
        bStart,
        bEnd,
        chunk,
        matching,
        startingSpans,
        endingSpans,
        isEndOfOverlap,
        primaryMatch,
        catInfo,
        baseTooltip,
        hasStaged,
      } = item

      if (matching.length === 0 || !primaryMatch || !catInfo) {
        return <span key={`txt-${bStart}-${bEnd}`}>{chunk}</span>
      }

      const hoveredMatch = hoveredConcept ? matching.find((s) => s.concept === hoveredConcept) : null
      const pinnedMatch = pinnedConcept ? matching.find((s) => s.concept === pinnedConcept) : null
      const isPinned = !!pinnedMatch
      const isHovered = !!hoveredMatch
      const isOverlap = matching.length > 1

      // Repères verticaux
      let borderDelimiters = ''
      if (startingSpans.length > 0) {
        const activeStart =
          startingSpans.find((s) => s.concept === hoveredConcept || s.concept === pinnedConcept) || startingSpans[0]
        const startCat = getConceptCategoryInfo(
          activeStart.category,
          activeStart.collection,
          activeStart.label,
          activeStart.concept,
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
          endingSpans.find((s) => s.concept === hoveredConcept || s.concept === pinnedConcept) || endingSpans[0]
        const endCat = getConceptCategoryInfo(
          activeEnd.category,
          activeEnd.collection,
          activeEnd.label,
          activeEnd.concept,
        ).category
        const isAct = activeEnd.concept === hoveredConcept || activeEnd.concept === pinnedConcept
        borderDelimiters += ` ${
          isAct
            ? CATEGORY_ACTIVE_DELIMITER_RIGHT[endCat] || CATEGORY_ACTIVE_DELIMITER_RIGHT.general
            : CATEGORY_DELIMITER_RIGHT[endCat] || CATEGORY_DELIMITER_RIGHT.general
        }`
      }

      // Détermination de la classe de surlignage
      let badgeClass = ''
      if (isHovered && hoveredMatch) {
        const hCat = getConceptCategoryInfo(
          hoveredMatch.category,
          hoveredMatch.collection,
          hoveredMatch.label,
          hoveredMatch.concept,
        ).category
        badgeClass =
          (CATEGORY_HOVER_STYLES[hCat] || CATEGORY_HOVER_STYLES.general) + (isOverlap ? ' border-double' : '')
      } else if (isPinned && pinnedMatch) {
        const pCat = getConceptCategoryInfo(
          pinnedMatch.category,
          pinnedMatch.collection,
          pinnedMatch.label,
          pinnedMatch.concept,
        ).category
        badgeClass =
          (CATEGORY_PINNED_STYLES[pCat] || CATEGORY_PINNED_STYLES.general) + (isOverlap ? ' border-double' : '')
      } else if (isOverlap) {
        badgeClass = CATEGORY_OVERLAP_STYLES[catInfo.category] || CATEGORY_OVERLAP_STYLES.general
      } else {
        badgeClass = CATEGORY_STYLES[catInfo.category] || CATEGORY_STYLES.general
      }

      const pinHint = isPinned ? ' • Cliquer pour désépingler' : ' • Cliquer pour épingler'
      const tooltip = `${baseTooltip}${pinHint}`

      const hasActiveInspection = !!(hoveredConcept || pinnedConcept)
      const isInspected = isHovered || isPinned
      const dimClass = hasActiveInspection && !isInspected ? ' opacity-40 hover:opacity-100' : ''

      return (
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
          className={`cursor-pointer rounded-none px-0.5 py-0 ${badgeClass} ${borderDelimiters}${dimClass}`}
          title={tooltip}
        >
          {chunk}
          {isEndOfOverlap && (
            <span
              className="ml-0.5 inline-flex items-center rounded-none border border-[#9A6530]/30 bg-[#9A6530]/15 px-1 py-0 align-super font-mono text-[9px] font-bold text-[#6e461f] shadow-2xs select-none"
              title={tooltip}
            >
              {matching.length}
            </span>
          )}
          {hasStaged && (
            <span className="py-0.2 ml-0.5 inline-block rounded-none bg-emerald-700 px-1 font-mono text-[9px] text-white uppercase">
              stg
            </span>
          )}
        </mark>
      )
    })

    return (
      <div>
        {renderGlobalThemes()}
        <span>{elements}</span>
      </div>
    )
  },
)
