/**
 * Entités du graphe de connaissances Zoomathia et typage des flux API.
 * Conçu pour un usage pérenne par l'équipe de recherche I3S / Wimmics.
 */

export interface Author {
  name: string;
}

export interface Work {
  uri: string;
  title: string;
  author: string;
  language?: string | null;
  file?: string | null;
}

export interface WorkMetadata {
  author?: string;
  editor?: string;
  date?: string;
  file?: string;
}

export interface SummaryNode {
  uri: string;
  id: string;
  title: string;
  type: string;
  author?: string;
  children: SummaryNode[];
}

export interface AnnotationOffset {
  start: number;
  end: number;
}

export type ConceptCategory = 'animal' | 'behavior' | 'anatomy' | 'place' | 'person' | 'general';

export interface AnnotationItem {
  concept: string;
  label: string;
  type: string;
  category?: ConceptCategory;
  collection?: string | null;
  offset: AnnotationOffset[];
}

export type AnnotationMap = Record<string, AnnotationItem>;

export interface Paragraph {
  uri: string;
  id: string;
  title?: string;
  text: string;
  author?: string;
  bookUri?: string;
  bookId?: string;
}

export interface TargetParagraphDetail {
  uri: string;
  id: string;
  text: string;
}

export interface ResolvedUri {
  type: 'work' | 'section' | 'paragraph' | 'unknown';
  work: string | null;
  section: string | null;
  paragraph: string | null;
}

export interface Concept {
  label: string;
  value: string;
  type?: string;
  category?: ConceptCategory;
  collection?: string | null;
}

export interface CompetencyQuestion {
  id: number;
  file: string;
  title: string;
  title_fr?: string;
  category?: 'ethology' | 'human_animal' | 'transmission_history' | 'geography_environment' | string;
  vizuTitle: string;
  goal: string;
}

export interface QCResultTable {
  columns: string[];
  data: string[][];
}

export interface QCResponse {
  query: string;
  results: {
    head: { vars: string[] };
    results: { bindings: Record<string, { value: string }>[] };
  };
  titleVizu: string;
  spo: string;
  table: QCResultTable;
}

export interface ConceptCriterion {
  uri: string;
  label?: string;
  type?: string;
  category?: ConceptCategory;
  collection?: string | null;
  include_subconcepts: boolean;
  polarity: 'include' | 'exclude';
}

export interface CollectionCriterion {
  uri: string;
  label?: string;
  polarity: 'include' | 'exclude';
}

export interface ThesaurusCollection {
  uri: string;
  label: string;
  memberCount: number;
}

export interface CustomSearchParams {
  author?: string[];
  work?: string[];
  excluded_works?: string[];
  concepts?: Array<{ uri: string; type?: string }>;
  concept_criteria?: ConceptCriterion[];
  collection_criteria?: CollectionCriterion[];
  checked?: boolean;
  collectionMembers?: boolean;
  subConcepts?: boolean;
  match_mode?: 'AND' | 'OR';
}

// --- Phase 4 : Annotations W3C, OpenTheso et SPARQL Playground ---

export type AnnotationScopeType = 'word' | 'word_sequence' | 'sentence' | 'paragraph' | 'multi_paragraph';

export type AnnotationStatus = 'En attente de validation' | 'Validé' | 'Rejeté';

export interface StagedAnnotation {
  id: number;
  paragraph_uri: string;
  target_text: string;
  start_offset: number;
  end_offset: number;
  concept_uri: string;
  concept_label: string;
  concept_type: string;
  annotator_name: string;
  justification?: string | null;
  scope_type: AnnotationScopeType;
  end_paragraph_uri?: string | null;
  target_paragraphs: string[];
  status: AnnotationStatus;
  created_at: string;
}

export interface CreateAnnotationInput {
  paragraph_uri: string;
  target_text: string;
  start_offset: number;
  end_offset: number;
  concept_uri: string;
  concept_label: string;
  concept_type?: string;
  annotator_name?: string;
  justification?: string;
  scope_type?: AnnotationScopeType;
  end_paragraph_uri?: string;
  target_paragraphs?: string[];
  status?: AnnotationStatus;
}

export interface SectionAnnotationsResponse {
  section_uri: string;
  paragraph_count: number;
  reference_annotations: Record<string, AnnotationMap>;
  staged_annotations: StagedAnnotation[];
}

export interface OpenThesoAutocompleteItem {
  label: string;
  uri: string;
  identifier: string;
}

export interface ThesaurusProposal {
  id: number;
  pref_label: string;
  language: string;
  alt_labels: string[];
  broader_concept_uri?: string;
  broader_concept_label?: string;
  definition?: string;
  contributor_name: string;
  status: string;
  created_at: string;
}

export interface CreateThesaurusProposalInput {
  pref_label: string;
  language: string;
  alt_labels?: string[];
  broader_concept_uri?: string;
  broader_concept_label?: string;
  definition?: string;
  contributor_name?: string;
}

export interface SparqlQueryResult {
  head: { vars: string[] };
  results: { bindings: Record<string, { value: string; type?: string }>[] };
  count: number;
  spoReady: boolean;
}

export interface SavedSparqlQuery {
  id: number;
  title: string;
  description?: string;
  query_text: string;
  query_spo_text?: string;
  category: string;
  author_name: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSavedQueryInput {
  title: string;
  description?: string;
  query_text: string;
  query_spo_text?: string;
  category?: string;
  author_name?: string;
}

export interface UpdateSavedQueryInput {
  title?: string;
  description?: string;
  query_text?: string;
  query_spo_text?: string;
  category?: string;
  author_name?: string;
}


