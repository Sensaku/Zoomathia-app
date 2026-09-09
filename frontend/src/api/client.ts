/**
 * Client API HTTP typé pour l'application Zoomathia.
 * Toutes les requêtes transitent par le proxy Vite (/api) vers le backend FastAPI.
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
  OpenThesoAutocompleteItem,
  ThesaurusProposal,
  CreateThesaurusProposalInput,
  SparqlQueryResult,
  SavedSparqlQuery,
  CreateSavedQueryInput,
  UpdateSavedQueryInput,
  ThesaurusCollection,
  ConceptCategory,
  SectionAnnotationsResponse
} from '../types'

export const BASE_URL = import.meta.env.VITE_API_URL || '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    throw new Error(`Erreur API [${res.status}] ${res.statusText}: ${errorBody}`)
  }
  return res.json() as Promise<T>
}

// --- Auteurs & Œuvres ---

export async function fetchAuthors(): Promise<Author[]> {
  return fetchJson<Author[]>(`${BASE_URL}/getAuthors`)
}

export async function fetchWorks(): Promise<Work[]> {
  return fetchJson<Work[]>(`${BASE_URL}/getWorks`)
}

export async function fetchWorksFromAuthor(author: string): Promise<Work[]> {
  const params = new URLSearchParams({ author })
  return fetchJson<Work[]>(`${BASE_URL}/getWorksFromAuthors?${params.toString()}`)
}

export async function fetchWorkMetadata(uri: string): Promise<WorkMetadata> {
  const params = new URLSearchParams({ uri })
  return fetchJson<WorkMetadata>(`${BASE_URL}/getMetadata?${params.toString()}`)
}

export async function fetchWorkParts(titleUri: string): Promise<any[]> {
  const params = new URLSearchParams({ title: titleUri })
  return fetchJson<any[]>(`${BASE_URL}/getWorkPart?${params.toString()}`)
}

export async function fetchTranslation(uri: string): Promise<{ uri: string; title: string } | null> {
  const params = new URLSearchParams({ uri })
  return fetchJson<{ uri: string; title: string } | null>(`${BASE_URL}/getTranslation?${params.toString()}`)
}

// --- Textes & Structure ---

export async function fetchSummary(uri: string): Promise<SummaryNode[]> {
  const params = new URLSearchParams({ uri })
  return fetchJson<SummaryNode[]>(`${BASE_URL}/getSummary?${params.toString()}`)
}

export async function fetchParagraphs(uri: string): Promise<Paragraph[]> {
  const params = new URLSearchParams({ uri })
  return fetchJson<Paragraph[]>(`${BASE_URL}/getParagraphs?${params.toString()}`)
}

export async function resolveUri(uri: string): Promise<ResolvedUri> {
  const params = new URLSearchParams({ uri })
  return fetchJson<ResolvedUri>(`${BASE_URL}/resolveUri?${params.toString()}`)
}

// --- Annotations & Thésaurus ---

export async function fetchConcepts(uri: string, lang = 'en'): Promise<AnnotationMap> {
  const params = new URLSearchParams({ uri, lang })
  return fetchJson<AnnotationMap>(`${BASE_URL}/getConcepts?${params.toString()}`)
}

export async function fetchThesaurus(lang = 'en'): Promise<Concept[]> {
  const params = new URLSearchParams({ lang })
  return fetchJson<Concept[]>(`${BASE_URL}/getTheso?${params.toString()}`)
}

export async function searchConcepts(
  input: string,
  lang = 'en',
  limit = 60
): Promise<Array<{ uri: string; label: string; type?: string; category?: ConceptCategory; collection?: string | null }>> {
  const params = new URLSearchParams({ input, lang, limit: limit.toString() })
  return fetchJson<Array<{ uri: string; label: string; type?: string; category?: ConceptCategory; collection?: string | null }>>(`${BASE_URL}/searchConcepts?${params.toString()}`)
}

export async function fetchCollections(lang = 'fr'): Promise<ThesaurusCollection[]> {
  const params = new URLSearchParams({ lang })
  return fetchJson<ThesaurusCollection[]>(`${BASE_URL}/getCollections?${params.toString()}`)
}

// --- Questions de Compétence (CQs) ---

export async function fetchQCList(): Promise<CompetencyQuestion[]> {
  return fetchJson<CompetencyQuestion[]>(`${BASE_URL}/qcList`)
}

export async function fetchQC(id: number): Promise<QCResponse> {
  return fetchJson<QCResponse>(`${BASE_URL}/getQC?id=${id}`)
}

export async function fetchQCSpo(id: number): Promise<any> {
  return fetchJson<any>(`${BASE_URL}/getQCspo?id=${id}`)
}

// --- Recherche personnalisée ---

export async function postCustomSearch(payload: CustomSearchParams): Promise<{ sparql: string; tree: SummaryNode[] }> {
  return fetchJson<{ sparql: string; tree: SummaryNode[] }>(`${BASE_URL}/customSearch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

// --- Phase 4 : Thésaurus OpenTheso, Annotations W3C et SPARQL Playground ---

export async function fetchThesaurusAutocomplete(q: string): Promise<OpenThesoAutocompleteItem[]> {
  const params = new URLSearchParams({ q })
  return fetchJson<OpenThesoAutocompleteItem[]>(`${BASE_URL}/thesaurus/autocomplete?${params.toString()}`)
}

export async function createAnnotation(payload: CreateAnnotationInput): Promise<StagedAnnotation> {
  return fetchJson<StagedAnnotation>(`${BASE_URL}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchAnnotations(paragraphUri?: string): Promise<StagedAnnotation[]> {
  const url = paragraphUri
    ? `${BASE_URL}/annotations?paragraph_uri=${encodeURIComponent(paragraphUri)}`
    : `${BASE_URL}/annotations`
  return fetchJson<StagedAnnotation[]>(url)
}

export async function updateAnnotationStatus(id: number, status: string): Promise<StagedAnnotation> {
  return fetchJson<StagedAnnotation>(`${BASE_URL}/annotations/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
}

export async function fetchSectionAnnotations(sectionUri: string, lang = 'en'): Promise<SectionAnnotationsResponse> {
  const params = new URLSearchParams({ section_uri: sectionUri, lang })
  return fetchJson<SectionAnnotationsResponse>(`${BASE_URL}/annotations/section?${params.toString()}`)
}

export async function deleteAnnotation(id: number): Promise<{ message: string; id: number }> {
  return fetchJson<{ message: string; id: number }>(`${BASE_URL}/annotations/${id}`, {
    method: 'DELETE'
  })
}

export async function createThesaurusProposal(payload: CreateThesaurusProposalInput): Promise<ThesaurusProposal> {
  return fetchJson<ThesaurusProposal>(`${BASE_URL}/thesaurus/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchThesaurusProposals(status?: string, q?: string): Promise<ThesaurusProposal[]> {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  if (q) params.append('q', q)
  const qs = params.toString()
  return fetchJson<ThesaurusProposal[]>(`${BASE_URL}/thesaurus/proposals${qs ? `?${qs}` : ''}`)
}

export async function updateThesaurusProposalStatus(id: number, status: string): Promise<ThesaurusProposal> {
  return fetchJson<ThesaurusProposal>(`${BASE_URL}/thesaurus/proposals/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
}

export async function deleteThesaurusProposal(id: number): Promise<{ success: boolean; deleted_id: number }> {
  return fetchJson<{ success: boolean; deleted_id: number }>(`${BASE_URL}/thesaurus/proposals/${id}`, {
    method: 'DELETE'
  })
}

export async function executeSparqlQuery(query: string): Promise<SparqlQueryResult> {
  return fetchJson<SparqlQueryResult>(`${BASE_URL}/sparql/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
}

// --- Système de Stockage et Gestion des Requêtes SPARQL ---

export async function fetchSavedQueries(category?: string, search?: string): Promise<SavedSparqlQuery[]> {
  const params = new URLSearchParams()
  if (category) params.append('category', category)
  if (search) params.append('search', search)
  const qs = params.toString()
  return fetchJson<SavedSparqlQuery[]>(`${BASE_URL}/queries${qs ? `?${qs}` : ''}`)
}

export async function fetchSavedQuery(id: number): Promise<SavedSparqlQuery> {
  return fetchJson<SavedSparqlQuery>(`${BASE_URL}/queries/${id}`)
}

export async function createSavedQuery(payload: CreateSavedQueryInput): Promise<SavedSparqlQuery> {
  return fetchJson<SavedSparqlQuery>(`${BASE_URL}/queries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function updateSavedQuery(id: number, payload: UpdateSavedQueryInput): Promise<SavedSparqlQuery> {
  return fetchJson<SavedSparqlQuery>(`${BASE_URL}/queries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function deleteSavedQuery(id: number): Promise<{ message: string; id: number }> {
  return fetchJson<{ message: string; id: number }>(`${BASE_URL}/queries/${id}`, {
    method: 'DELETE'
  })
}

export async function executeSavedQueryById(id: number, useSpo = false): Promise<any> {
  return fetchJson<any>(`${BASE_URL}/queries/${id}/execute?use_spo=${useSpo}`, {
    method: 'POST'
  })
}

