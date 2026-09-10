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

const EMPTY_SET = new Set<string>()

export function useConceptInspection({
  referenceAnnotations = {},
  stagedAnnotations = [],
  paragraphs = [],
  setActiveParagraphUri
}: UseConceptInspectionOptions): ConceptInspectionState {
  const [hoveredConcept, setHoveredConcept] = useState<string | null>(null)
  const [pinnedConcept, setPinnedConcept] = useState<string | null>(null)

  // Indexation O(1) de tous les concepts vers leurs paragraphes et métadonnées
  // Ne s'exécute qu'à l'arrivée de nouvelles annotations, jamais au survol !
  const { conceptToParas, conceptToMeta } = useMemo(() => {
    const parasMap = new Map<string, Set<string>>()
    const metaMap = new Map<string, { label: string; category: ConceptCategory }>()

    // 1. Références Corese
    for (const [pUri, annotMap] of Object.entries(referenceAnnotations)) {
      for (const item of Object.values(annotMap || {})) {
        if (!item.concept) continue
        let set = parasMap.get(item.concept)
        if (!set) {
          set = new Set<string>()
          parasMap.set(item.concept, set)
        }
        set.add(pUri)

        if (!metaMap.has(item.concept)) {
          const catInfo = getConceptCategoryInfo(item.category, item.collection, item.label, item.concept)
          metaMap.set(item.concept, { label: item.label, category: catInfo.category })
        }
      }
    }

    // 2. Propositions Staging
    for (const s of stagedAnnotations) {
      if (!s.concept_uri) continue
      let set = parasMap.get(s.concept_uri)
      if (!set) {
        set = new Set<string>()
        parasMap.set(s.concept_uri, set)
      }

      const touchesParas =
        s.target_paragraphs && s.target_paragraphs.length > 0
          ? s.target_paragraphs
          : ([s.paragraph_uri, s.end_paragraph_uri].filter(Boolean) as string[])

      for (const tUri of touchesParas) set.add(tUri)

      if (!metaMap.has(s.concept_uri)) {
        const catInfo = getConceptCategoryInfo((s as any).category, (s as any).collection, s.concept_label, s.concept_uri)
        metaMap.set(s.concept_uri, { label: s.concept_label, category: catInfo.category })
      }
    }

    return { conceptToParas: parasMap, conceptToMeta: metaMap }
  }, [referenceAnnotations, stagedAnnotations])

  // Le survol dynamique prend la priorité immédiate (live preview), avec repli sur le concept épinglé
  const activeInspectionConcept = hoveredConcept || pinnedConcept || null

  const {
    activeInspectionParagraphUris,
    activeInspectionLabel,
    activeInspectionCategory,
    pinnedConceptLabel,
    pinnedConceptCategory,
    pinnedParagraphsList,
    pinnedParagraphUris,
    hoveredParagraphUris
  } = useMemo(() => {
    const pinnedSet = (pinnedConcept && conceptToParas.get(pinnedConcept)) || EMPTY_SET
    const hoveredSet = (hoveredConcept && conceptToParas.get(hoveredConcept)) || EMPTY_SET

    const activeConcept = hoveredConcept || pinnedConcept
    const activeMeta = activeConcept ? conceptToMeta.get(activeConcept) : null
    const pinnedMeta = pinnedConcept ? conceptToMeta.get(pinnedConcept) : null

    const pList = pinnedConcept
      ? paragraphs.filter((p) => pinnedSet.has(p.uri))
      : []

    return {
      activeInspectionParagraphUris: hoveredConcept ? hoveredSet : pinnedSet,
      activeInspectionLabel: activeMeta?.label || null,
      activeInspectionCategory: activeMeta?.category || 'general',
      pinnedConceptLabel: pinnedMeta?.label || null,
      pinnedConceptCategory: pinnedMeta?.category || 'general',
      pinnedParagraphsList: pList,
      pinnedParagraphUris: pinnedSet,
      hoveredParagraphUris: hoveredSet
    }
  }, [conceptToParas, conceptToMeta, hoveredConcept, pinnedConcept, paragraphs])

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

  return useMemo(
    () => ({
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
      pinnedParagraphUris,
      hoveredParagraphUris,
      handleFocusParagraph
    }),
    [
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
      pinnedParagraphUris,
      hoveredParagraphUris,
      handleFocusParagraph
    ]
  )
}
