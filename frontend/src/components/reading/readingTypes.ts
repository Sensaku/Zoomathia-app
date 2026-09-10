import { ConceptCategory, AnnotationStatus } from '../../types'

export interface ReadingParagraph {
  uri: string
  id: string
  text: string
  sectionTitle?: string
}

export interface ReadingSpan {
  start: number
  end: number
  label: string
  concept: string
  category?: ConceptCategory
  collection?: string | null
  isStaged: boolean
  status?: AnnotationStatus | string
  id?: number
  isMulti?: boolean
}

export interface ConceptInspectionState {
  hoveredConcept: string | null
  setHoveredConcept: (uri: string | null) => void
  pinnedConcept: string | null
  setPinnedConcept: React.Dispatch<React.SetStateAction<string | null>>
  activeInspectionConcept: string | null
  activeInspectionParagraphUris: Set<string>
  activeInspectionLabel: string | null
  activeInspectionCategory: ConceptCategory
  pinnedConceptLabel: string | null
  pinnedConceptCategory: ConceptCategory
  pinnedParagraphsList: ReadingParagraph[]
  pinnedParagraphUris: Set<string>
  hoveredParagraphUris: Set<string>
  handleFocusParagraph: (paraUri: string) => void
}
