/**
 * Entités du graphe de connaissances Zoomathia et typage des flux API.
 * Conçu pour un usage pérenne par l'équipe de recherche I3S / Wimmics.
 */

export interface Author {
  name: string
}

export interface Work {
  uri: string
  title: string
  author: string
  language?: string | null
  file?: string | null
}

export interface WorkMetadata {
  author?: string
  editor?: string
  date?: string
  file?: string
}

export interface SummaryNode {
  uri: string
  id: string
  title: string
  type: string
  author?: string
  children: SummaryNode[]
}

export interface AnnotationOffset {
  start: number
  end: number
}

export type ConceptCategory = 'animal' | 'behavior' | 'anatomy' | 'place' | 'person' | 'general'

/**
 * A TheZoo (OpenTheso) collection a concept belongs to (RM-CON-02). Labels come from the SKOS
 * data, by language; a language can be missing.
 */
export interface ConceptCollection {
  iri: string
  labels: { fr?: string; en?: string }
}

/** A category and the collections that give it, as listed by `GET /thesaurus/categories`. */
export interface CategoryCollections {
  category: ConceptCategory
  collections: ConceptCollection[]
}

export interface AnnotationItem {
  concept: string
  label: string
  type: string
  category?: ConceptCategory
  collections?: ConceptCollection[]
  offset: AnnotationOffset[]
}

export type AnnotationMap = Record<string, AnnotationItem>

export interface Paragraph {
  uri: string
  id: string
  title?: string
  text: string
  author?: string
  bookUri?: string
  bookId?: string
}

export interface TargetParagraphDetail {
  uri: string
  id: string
  text: string
}

export interface ResolvedUri {
  type: 'work' | 'section' | 'paragraph' | 'unknown'
  work: string | null
  section: string | null
  paragraph: string | null
}

export interface Concept {
  label: string
  value: string
  type?: string
  category?: ConceptCategory
  collections?: ConceptCollection[]
}

export interface CompetencyQuestion {
  id: number
  file: string
  title: string
  title_fr?: string
  category?: 'ethology' | 'human_animal' | 'transmission_history' | 'geography_environment' | string
  vizuTitle: string
  goal: string
}

export interface QCResultTable {
  columns: string[]
  data: string[][]
}

export interface QCResponse {
  query: string
  results: {
    head: { vars: string[] }
    results: { bindings: Record<string, { value: string }>[] }
  }
  titleVizu: string
  spo: string
  table: QCResultTable
}

export interface ConceptCriterion {
  uri: string
  label?: string
  type?: string
  category?: ConceptCategory
  collections?: ConceptCollection[]
  include_subconcepts: boolean
  polarity: 'include' | 'exclude'
}

export interface CollectionCriterion {
  uri: string
  label?: string
  polarity: 'include' | 'exclude'
}

export interface ThesaurusCollection {
  uri: string
  label: string
  memberCount: number
}

export interface CustomSearchParams {
  author?: string[]
  work?: string[]
  excluded_works?: string[]
  concepts?: Array<{ uri: string; type?: string }>
  concept_criteria?: ConceptCriterion[]
  collection_criteria?: CollectionCriterion[]
  checked?: boolean
  collectionMembers?: boolean
  subConcepts?: boolean
  match_mode?: 'AND' | 'OR'
}

// --- Accounts and sessions (P0-5a) ---

/** Role of an account. */
export type AccountRole = 'contributor' | 'admin'

/** Life cycle of an account (RM-CPT-02, RM-CPT-03). */
export type AccountStatus = 'pending' | 'active' | 'deactivated'

/** The logged-in account, as returned by `/auth/me` and `/auth/login`. The email is for the owner only (RM-CPT-05). */
export interface SessionUser {
  id: number
  email: string
  display_name: string
  affiliation: string
  role: AccountRole
  status: AccountStatus
  created_at: string
  activated_at: string | null
}

/** The logged-in account and the CSRF token to send on unsafe requests. Lives in the React Query cache only. */
export interface Session {
  user: SessionUser
  csrf_token: string
}

/** What the public sees of an account (RM-CPT-05): never the email. */
export interface PublicIdentity {
  id: number
  display_name: string
  affiliation: string
}

/** One page of a list, and the total under the same filters. */
export interface Page<T> {
  items: T[]
  total: number
}

// --- Contributions: annotations, term proposals, saved queries ---

/** Review status of a contribution (RM-MOD-01). Labels come from i18n `contributions.status.*`. */
export type ContributionStatus = 'pending' | 'validated' | 'rejected'

/** What the backend policy lets the viewer do with a contribution. Never recomputed in the browser. */
export type ContributionAction = 'edit' | 'delete' | 'review'

/** What the backend policy lets the viewer do with a saved query. */
export type SavedQueryAction = 'edit' | 'delete'

export type AnnotationScopeType = 'word' | 'word_sequence' | 'sentence' | 'paragraph' | 'multi_paragraph'

/**
 * An annotation of the staging area. `author` is null for a historical annotation (RM-CTB-06):
 * `author_label` then holds the name typed at the time.
 */
export interface StagedAnnotation {
  id: number
  paragraph_uri: string
  target_text: string
  start_offset: number
  end_offset: number
  concept_uri: string
  concept_label: string
  concept_type: string
  /** Computed by the server from the TheZoo collections of the concept (RM-CON-01, RM-CON-02). */
  category: ConceptCategory
  collections: ConceptCollection[]
  justification: string | null
  scope_type: AnnotationScopeType
  end_paragraph_uri: string | null
  target_paragraphs: string[]
  status: ContributionStatus
  author: PublicIdentity | null
  author_label: string | null
  reviewer: PublicIdentity | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string | null
  /** Sent back with every edit and review: a 409 `version_conflict` means it changed since. */
  version: number
  allowed_actions: ContributionAction[]
}

/** Creation of an annotation. No author and no status: the server decides both (RM-CTB-03, RM-CTB-04). */
export interface CreateAnnotationInput {
  paragraph_uri: string
  target_text: string
  start_offset: number
  end_offset: number
  concept_uri: string
  concept_label: string
  concept_type?: string
  justification?: string
  scope_type?: AnnotationScopeType
  end_paragraph_uri?: string
  target_paragraphs?: string[]
}

/**
 * Edit of a pending annotation (RM-CTB-05): the concept and the justification only. The concept
 * moves as a whole (`concept_uri` and `concept_label` together); `justification: null` clears it.
 */
export interface AnnotationUpdateInput {
  version: number
  concept_uri?: string
  concept_label?: string
  concept_type?: string
  justification?: string | null
}

/** A peer review (RM-MOD-01, RM-MOD-03): a validation has no reason, a rejection needs one (1 to 2,000 characters). */
export type ReviewInput =
  | { version: number; decision: 'validated' }
  | { version: number; decision: 'rejected'; reason: string }

/** Query parameters of `GET /annotations`. */
export interface AnnotationListParams {
  /** 1 to 200, default 50. */
  limit?: number
  offset?: number
  /** Only the annotations of the logged-in account. */
  mine?: boolean
  status?: ContributionStatus
  paragraph_uri?: string
}

/** Answer of `GET /annotations/section`: reference annotations (Corese) and staged ones (RM-ACC-03). */
export interface SectionAnnotationsResponse {
  section_uri: string
  paragraph_count: number
  reference_annotations: Record<string, AnnotationMap>
  staged_annotations: StagedAnnotation[]
}

export interface OpenThesoAutocompleteItem {
  label: string
  uri: string
  identifier: string
}

/** A term proposed for the TheZoo thesaurus. Same author and review fields as an annotation. */
export interface ThesaurusProposal {
  id: number
  pref_label: string
  language: string
  alt_labels: string[]
  broader_concept_uri: string | null
  broader_concept_label: string | null
  definition: string | null
  status: ContributionStatus
  author: PublicIdentity | null
  author_label: string | null
  reviewer: PublicIdentity | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string | null
  version: number
  allowed_actions: ContributionAction[]
}

/** Creation of a term proposal. No author and no status (RM-CTB-03, RM-CTB-04). */
export interface CreateThesaurusProposalInput {
  pref_label: string
  language: string
  alt_labels?: string[]
  broader_concept_uri?: string
  broader_concept_label?: string
  definition?: string
}

/** Edit of a pending proposal (RM-CTB-05): every field; a field that is not sent is kept. */
export interface ProposalUpdateInput {
  version: number
  pref_label?: string
  language?: string
  alt_labels?: string[]
  broader_concept_uri?: string | null
  broader_concept_label?: string | null
  definition?: string | null
}

/** Query parameters of `GET /thesaurus/proposals`. */
export interface ProposalListParams {
  /** 1 to 200, default 50. */
  limit?: number
  offset?: number
  mine?: boolean
  status?: ContributionStatus
  /** Free text, up to 200 characters. */
  q?: string
}

export interface SparqlQueryResult {
  head: { vars: string[] }
  results: { bindings: Record<string, { value: string; type?: string }>[] }
  count: number
  spoReady: boolean
}

/** A saved SPARQL query. `author` is null for a native question or a historical query. */
export interface SavedSparqlQuery {
  id: number
  title: string
  description: string | null
  query_text: string
  query_spo_text: string | null
  category: string
  author: PublicIdentity | null
  author_label: string | null
  is_builtin: boolean
  created_at: string
  updated_at: string
  allowed_actions: SavedQueryAction[]
}

/** Creation of a saved query. No author: it is the logged-in account (RM-QC-06). */
export interface CreateSavedQueryInput {
  title: string
  description?: string
  query_text: string
  query_spo_text?: string
  category?: string
}

/** Update of a saved query: a field that is not sent is kept. */
export interface UpdateSavedQueryInput {
  title?: string
  description?: string
  query_text?: string
  query_spo_text?: string
  category?: string
}

/** Query parameters of `GET /queries`. */
export interface SavedQueryListParams {
  /** 1 to 500, default 200. */
  limit?: number
  offset?: number
  mine?: boolean
  category?: string
  search?: string
}

/** Answer of `POST /queries/{id}/execute`. */
export interface SavedQueryExecution extends SparqlQueryResult {
  id: number
  title: string
}
