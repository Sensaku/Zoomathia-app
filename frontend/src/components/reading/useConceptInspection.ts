import { useState, useMemo, useCallback } from 'react'
import { ConceptCategory, StagedAnnotation } from '../../types'
import { ReadingParagraph, ConceptInspectionState } from './readingTypes'
import { getConceptCategoryInfo } from '../ConceptCategoryBadge'

export interface UseConceptInspectionOptions {
  referenceAnnotations?: Record<string, Record<string, any>>
  stagedAnnotations?: StagedAnnotation[]
  paragraphs?: ReadingParagraph[]
  setActiveParagraphUri?: (uri: string) => void
}

export function useConceptInspection({
  referenceAnnotations = {},
  stagedAnnotations = [],
  paragraphs = [],
  setActiveParagraphUri
}: UseConceptInspectionOptions): ConceptInspectionState {
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null)
  const [pinnedConcept, setPinnedConcept] = useState<string | null>(null)

  // Le survol dynamique prend la priorité immédiate (live preview), avec repli sur le concept épinglé
  const activeInspectionConcept = hoveredConcept || pinnedConcept || null

  const {
    activeInspectionParagraphUris,
    activeInspectionLabel,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList
  } = useMemo(() => {
    if (!activeInspectionConcept && !pinnedConcept) {
      return {
        activeInspectionParagraphUris: new Set<string>(),
        activeInspectionLabel: null,
        activeInspectionCategory: 'general' as ConceptCategory,
        pinnedConceptLabel: null,
        pinnedConceptCategory: 'general' as ConceptCategory,
        pinnedParagraphsList: []
      }
    }

    const set = new Set<string>()
    let activeLabel: string | null = null
    let activeCat: ConceptCategory = 'general'
    let pinnedLabel: string | null = null
    let pinnedCat: ConceptCategory = 'general'

    // 1. Références Corese
    for (const [pUri, annotMap] of Object.entries(referenceAnnotations)) {
      for (const item of Object.values(annotMap || {})) {
        if (activeInspectionConcept && item.concept === activeInspectionConcept) {
          set.add(pUri)
          if (!activeLabel) activeLabel = item.label
          activeCat = getConceptCategoryInfo(item.category, item.collection, item.label, item.concept).category
        }
        if (pinnedConcept && item.concept === pinnedConcept) {
          if (!pinnedLabel) pinnedLabel = item.label
          pinnedCat = getConceptCategoryInfo(item.category, item.collection, item.label, item.concept).category
        }
      }
    }

    // 2. Propositions Staging
    for (const s of stagedAnnotations) {
      if (activeInspectionConcept && s.concept_uri === activeInspectionConcept) {
        set.add(s.paragraph_uri)
        if (s.target_paragraphs && s.target_paragraphs.length > 0) {
          for (const tUri of s.target_paragraphs) {
            set.add(tUri)
          }
        }
        if (s.end_paragraph_uri) {
          set.add(s.end_paragraph_uri)
        }
        if (!activeLabel) activeLabel = s.concept_label
        activeCat = getConceptCategoryInfo((s as any).category, (s as any).collection, s.concept_label, s.concept_uri).category
      }

      if (pinnedConcept && s.concept_uri === pinnedConcept) {
        if (!pinnedLabel) pinnedLabel = s.concept_label
        pinnedCat = getConceptCategoryInfo((s as any).category, (s as any).collection, s.concept_label, s.concept_uri).category
      }
    }

    const pList = pinnedConcept
      ? paragraphs.filter((p) => {
          // Un paragraphe fait partie des passages couverts s'il est dans le set associé au concept épinglé
          let hasPinned = false
          const pMap = referenceAnnotations[p.uri] || {}
          if (Object.values(pMap).some((a) => a.concept === pinnedConcept)) hasPinned = true
          if (stagedAnnotations.some((s) => s.concept_uri === pinnedConcept && (s.paragraph_uri === p.uri || (s.target_paragraphs && s.target_paragraphs.includes(p.uri)) || s.end_paragraph_uri === p.uri))) {
            hasPinned = true
          }
          return hasPinned
        })
      : []

    return {
      activeInspectionParagraphUris: set,
      activeInspectionLabel: activeLabel,
      activeInspectionCategory: activeCat,
      pinnedConceptLabel: pinnedLabel,
      pinnedConceptCategory: pinnedCat,
      pinnedParagraphsList: pList
    }
  }, [activeInspectionConcept, pinnedConcept, referenceAnnotations, stagedAnnotations, paragraphs])

  // Navigation fluide avec focus centré sur le paragraphe
  const handleFocusParagraph = useCallback(
    (paraUri: string) => {
      if (setActiveParagraphUri) {
        setActiveParagraphUri(paraUri)
      }
      setTimeout(() => {
        const el =
          document.getElementById(paraUri) ||
          document.querySelector(`[data-para-uri="${CSS.escape(paraUri)}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          if (el instanceof HTMLElement) {
            el.focus({ preventScroll: true })
          }
        }
      }, 40)
    },
    [setActiveParagraphUri]
  )

  return {
    hoveredConcept,
    setHoveredConcept,
    pinnedConcept,
    setPinnedConcept,
    activeInspectionConcept,
    activeInspectionParagraphUris,
    activeInspectionLabel,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList,
    handleFocusParagraph
  }
}
