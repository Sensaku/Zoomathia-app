/**
 * Typed HTTP client of the Zoomathia application, and the only module that calls the backend.
 * Requests go through the Vite proxy (`/api`) to the FastAPI backend, on the shared request
 * core of `http.ts` (JSON, cookies, CSRF header, error mapping).
 */

import {
  Author,
  Work,
  WorkMetadata,
  SummaryNode,
  Paragraph,
  ResolvedUri,
  AnnotationMap,
  Concept,
  CompetencyQuestion,
  QCResponse,
  CustomSearchParams,
  StagedAnnotation,
  CreateAnnotationInput,
  AnnotationListParams,
  AnnotationUpdateInput,
  ReviewInput,
  OpenThesoAutocompleteItem,
  ThesaurusProposal,
  CreateThesaurusProposalInput,
  ProposalListParams,
  ProposalUpdateInput,
  SparqlQueryResult,
  SavedSparqlQuery,
  SavedQueryExecution,
  SavedQueryListParams,
  CreateSavedQueryInput,
  UpdateSavedQueryInput,
  ThesaurusCollection,
  ConceptCategory,
  SectionAnnotationsResponse,
  Page,
  Session,
} from '../types'
import { ApiError } from './errors'
import { BASE_URL, buildQuery, connectSession, requestBlob, requestJson } from './http'
import type { CsrfCredential, SessionBridge } from './http'

export { ApiError, BASE_URL, connectSession }
export type { CsrfCredential, SessionBridge }

// --- Authors and works ---

// `fetchAuthors`, `fetchWorks` and `fetchQCList` take no argument and have no `signal`: pages pass
// them directly as `queryFn`, and React Query would hand them its context object as the first argument.
export async function fetchAuthors(): Promise<Author[]> {
  return requestJson<Author[]>('/getAuthors')
}

export async function fetchWorks(): Promise<Work[]> {
  return requestJson<Work[]>('/getWorks')
}

export async function fetchWorksFromAuthor(author: string, signal?: AbortSignal): Promise<Work[]> {
  return requestJson<Work[]>(`/getWorksFromAuthors${buildQuery({ author })}`, { signal })
}

export async function fetchWorkMetadata(uri: string, signal?: AbortSignal): Promise<WorkMetadata> {
  return requestJson<WorkMetadata>(`/getMetadata${buildQuery({ uri })}`, { signal })
}

export async function fetchWorkParts(titleUri: string, signal?: AbortSignal): Promise<any[]> {
  return requestJson<any[]>(`/getWorkPart${buildQuery({ title: titleUri })}`, { signal })
}

export async function fetchTranslation(
  uri: string,
  signal?: AbortSignal,
): Promise<{ uri: string; title: string } | null> {
  return requestJson<{ uri: string; title: string } | null>(`/getTranslation${buildQuery({ uri })}`, { signal })
}

// --- Texts and structure ---

export async function fetchSummary(uri: string, signal?: AbortSignal): Promise<SummaryNode[]> {
  return requestJson<SummaryNode[]>(`/getSummary${buildQuery({ uri })}`, { signal })
}

export async function fetchParagraphs(uri: string, signal?: AbortSignal): Promise<Paragraph[]> {
  return requestJson<Paragraph[]>(`/getParagraphs${buildQuery({ uri })}`, { signal })
}

export async function resolveUri(uri: string, signal?: AbortSignal): Promise<ResolvedUri> {
  return requestJson<ResolvedUri>(`/resolveUri${buildQuery({ uri })}`, { signal })
}

// --- Concepts and thesaurus ---

export async function fetchConcepts(uri: string, lang = 'en', signal?: AbortSignal): Promise<AnnotationMap> {
  return requestJson<AnnotationMap>(`/getConcepts${buildQuery({ uri, lang })}`, { signal })
}

export async function fetchThesaurus(lang = 'en', signal?: AbortSignal): Promise<Concept[]> {
  return requestJson<Concept[]>(`/getTheso${buildQuery({ lang })}`, { signal })
}

type ConceptSearchHit = {
  uri: string
  label: string
  type?: string
  category?: ConceptCategory
  collection?: string | null
}

export async function searchConcepts(
  input: string,
  lang = 'en',
  limit = 60,
  signal?: AbortSignal,
): Promise<ConceptSearchHit[]> {
  return requestJson<ConceptSearchHit[]>(`/searchConcepts${buildQuery({ input, lang, limit })}`, { signal })
}

export async function fetchCollections(lang = 'fr', signal?: AbortSignal): Promise<ThesaurusCollection[]> {
  return requestJson<ThesaurusCollection[]>(`/getCollections${buildQuery({ lang })}`, { signal })
}

export async function fetchThesaurusAutocomplete(
  q: string,
  signal?: AbortSignal,
): Promise<OpenThesoAutocompleteItem[]> {
  return requestJson<OpenThesoAutocompleteItem[]>(`/thesaurus/autocomplete${buildQuery({ q })}`, { signal })
}

// --- Competency questions ---

export async function fetchQCList(): Promise<CompetencyQuestion[]> {
  return requestJson<CompetencyQuestion[]>('/qcList')
}

export async function fetchQC(id: number, signal?: AbortSignal): Promise<QCResponse> {
  return requestJson<QCResponse>(`/getQC${buildQuery({ id })}`, { signal })
}

export async function fetchQCSpo(id: number, signal?: AbortSignal): Promise<any> {
  return requestJson<any>(`/getQCspo${buildQuery({ id })}`, { signal })
}

export type QCExportFormat = 'json' | 'csv'

/** Exports the results of a competency question (GET route of the backend, `id` as parameter). */
export async function downloadQC(id: number, format: QCExportFormat): Promise<Blob> {
  return requestBlob(`/download-qc-${format}${buildQuery({ id })}`)
}

// --- Custom search and SPARQL playground ---

export async function postCustomSearch(payload: CustomSearchParams): Promise<{ sparql: string; tree: SummaryNode[] }> {
  return requestJson<{ sparql: string; tree: SummaryNode[] }>('/customSearch', { method: 'POST', body: payload })
}

export type CustomSearchExportFormat = 'json' | 'csv'

/**
 * Exports the custom search (RM-EXP-01): the server rebuilds the query from the criteria, the
 * client never sends SPARQL. Returns the file as a Blob.
 */
export async function downloadCustomSearch(
  payload: CustomSearchParams,
  format: CustomSearchExportFormat,
): Promise<Blob> {
  return requestBlob(`/download-custom-search-${format}`, { method: 'POST', body: payload })
}

export async function executeSparqlQuery(query: string, signal?: AbortSignal): Promise<SparqlQueryResult> {
  return requestJson<SparqlQueryResult>('/sparql/execute', { method: 'POST', body: { query }, signal })
}

// --- Accounts and session (RM-CPT-*) ---

/**
 * The logged-in account and its CSRF token, or `null` for a visitor (401). Any other failure
 * is thrown: a server error is not a visitor (AGENTS.md rule 9).
 */
export async function fetchSession(signal?: AbortSignal): Promise<Session | null> {
  try {
    return await requestJson<Session>('/auth/me', { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** Opens a session. Errors: 401 `invalid_credentials`, 403 `account_pending` or `account_deactivated`, 429. */
export async function login(credentials: { email: string; password: string }): Promise<Session> {
  return requestJson<Session>('/auth/login', { method: 'POST', body: credentials })
}

/** Ends the session on the server (204). */
export async function logout(): Promise<void> {
  return requestJson<void>('/auth/logout', { method: 'POST' })
}

/** Changes the password of the logged-in account; its other sessions are revoked. 403 `invalid_credentials`: wrong current password. */
export async function changePassword(input: { current_password: string; new_password: string }): Promise<void> {
  return requestJson<void>('/auth/password', { method: 'POST', body: input })
}

/** Sets a new password with the token an administrator handed over. 400 `invalid_reset_token`, 422 `invalid_password`. */
export async function resetPassword(input: { token: string; new_password: string }): Promise<void> {
  return requestJson<void>('/auth/password-reset', { method: 'POST', body: input })
}

// --- Annotations (RM-CTB-*, RM-MOD-*, RM-ACC-03) ---

/** Creates a pending annotation; the server sets the author and the status (RM-CTB-03, RM-CTB-04). */
export async function createAnnotation(payload: CreateAnnotationInput): Promise<StagedAnnotation> {
  return requestJson<StagedAnnotation>('/annotations', { method: 'POST', body: payload })
}

/** A page of annotations of every status, newest first. */
export async function fetchAnnotationPage(
  params: AnnotationListParams = {},
  signal?: AbortSignal,
): Promise<Page<StagedAnnotation>> {
  return requestJson<Page<StagedAnnotation>>(`/annotations${buildQuery({ ...params })}`, { signal })
}

export async function fetchAnnotation(id: number, signal?: AbortSignal): Promise<StagedAnnotation> {
  return requestJson<StagedAnnotation>(`/annotations/${id}`, { signal })
}

/** Edits the concept or the justification of a pending annotation (RM-CTB-05). 409 `version_conflict` if it changed. */
export async function updateAnnotation(id: number, input: AnnotationUpdateInput): Promise<StagedAnnotation> {
  return requestJson<StagedAnnotation>(`/annotations/${id}`, { method: 'PATCH', body: input })
}

/** Validates or rejects an annotation (RM-MOD-01 to RM-MOD-03). 409 `version_conflict` or `not_pending`. */
export async function reviewAnnotation(id: number, input: ReviewInput): Promise<StagedAnnotation> {
  return requestJson<StagedAnnotation>(`/annotations/${id}/review`, { method: 'POST', body: input })
}

export async function deleteAnnotation(id: number): Promise<void> {
  return requestJson<void>(`/annotations/${id}`, { method: 'DELETE' })
}

/**
 * Reference annotations (Corese) and staged ones of a section. Pending ones come only with
 * `includePending` (RM-ACC-03); rejected ones never do (RM-ACC-04).
 */
export async function fetchSectionAnnotations(
  sectionUri: string,
  lang = 'en',
  options: { includePending?: boolean; signal?: AbortSignal } = {},
): Promise<SectionAnnotationsResponse> {
  const query = buildQuery({ section_uri: sectionUri, lang, include_pending: options.includePending })
  return requestJson<SectionAnnotationsResponse>(`/annotations/section${query}`, { signal: options.signal })
}

// --- Term proposals ---

/** Creates a pending proposal. 409 `duplicate_proposal` when the same term already waits in this language. */
export async function createThesaurusProposal(payload: CreateThesaurusProposalInput): Promise<ThesaurusProposal> {
  return requestJson<ThesaurusProposal>('/thesaurus/proposals', { method: 'POST', body: payload })
}

/** A page of term proposals of every status, newest first. */
export async function fetchThesaurusProposalPage(
  params: ProposalListParams = {},
  signal?: AbortSignal,
): Promise<Page<ThesaurusProposal>> {
  return requestJson<Page<ThesaurusProposal>>(`/thesaurus/proposals${buildQuery({ ...params })}`, { signal })
}

export async function fetchThesaurusProposal(id: number, signal?: AbortSignal): Promise<ThesaurusProposal> {
  return requestJson<ThesaurusProposal>(`/thesaurus/proposals/${id}`, { signal })
}

/** Edits any field of a pending proposal (RM-CTB-05). 409 `version_conflict` if it changed. */
export async function updateThesaurusProposal(id: number, input: ProposalUpdateInput): Promise<ThesaurusProposal> {
  return requestJson<ThesaurusProposal>(`/thesaurus/proposals/${id}`, { method: 'PATCH', body: input })
}

/** Validates or rejects a proposal (RM-MOD-01 to RM-MOD-03). 409 `version_conflict` or `not_pending`. */
export async function reviewThesaurusProposal(id: number, input: ReviewInput): Promise<ThesaurusProposal> {
  return requestJson<ThesaurusProposal>(`/thesaurus/proposals/${id}/review`, { method: 'POST', body: input })
}

export async function deleteThesaurusProposal(id: number): Promise<void> {
  return requestJson<void>(`/thesaurus/proposals/${id}`, { method: 'DELETE' })
}

// --- Saved SPARQL queries (RM-QC-06) ---

/** A page of the query library, native questions first. */
export async function fetchSavedQueryPage(
  params: SavedQueryListParams = {},
  signal?: AbortSignal,
): Promise<Page<SavedSparqlQuery>> {
  return requestJson<Page<SavedSparqlQuery>>(`/queries${buildQuery({ ...params })}`, { signal })
}

export async function fetchSavedQuery(id: number, signal?: AbortSignal): Promise<SavedSparqlQuery> {
  return requestJson<SavedSparqlQuery>(`/queries/${id}`, { signal })
}

export async function createSavedQuery(payload: CreateSavedQueryInput): Promise<SavedSparqlQuery> {
  return requestJson<SavedSparqlQuery>('/queries', { method: 'POST', body: payload })
}

export async function updateSavedQuery(id: number, payload: UpdateSavedQueryInput): Promise<SavedSparqlQuery> {
  return requestJson<SavedSparqlQuery>(`/queries/${id}`, { method: 'PUT', body: payload })
}

/** Deletes a query (204). 403 `builtin_query` for a native question. */
export async function deleteSavedQuery(id: number): Promise<void> {
  return requestJson<void>(`/queries/${id}`, { method: 'DELETE' })
}

export async function executeSavedQueryById(id: number, useSpo = false): Promise<SavedQueryExecution> {
  return requestJson<SavedQueryExecution>(`/queries/${id}/execute${buildQuery({ use_spo: useSpo })}`, {
    method: 'POST',
  })
}
