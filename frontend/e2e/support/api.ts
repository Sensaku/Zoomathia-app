import { expect, type APIRequestContext } from '@playwright/test'
import { account, type AccountKey } from './accounts'
import { corpus } from './corpus'

/** A concept of the TheZoo thesaurus (fictional ids: OpenTheso is not simulated). */
export interface TestConcept {
  uri: string
  label: string
}

/** A concept to annotate with; `n` makes the IRI unique. */
export function concept(n: number, label: string): TestConcept {
  return { uri: `https://opentheso.huma-num.fr/?idc=${2000000 + n}&idt=th310`, label }
}

/** A contribution as the API returns it (the fields the journeys read). */
export interface Contribution {
  id: number
  version: number
  status: 'pending' | 'validated' | 'rejected'
}

async function json<T>(response: Awaited<ReturnType<APIRequestContext['get']>>, status: number): Promise<T> {
  expect(response.status(), await response.text()).toBe(status)
  return (await response.json()) as T
}

/**
 * Sign in as a test account on `request` (its cookie jar keeps the session) and return the CSRF token.
 * Use a separate `request` context per account.
 */
export async function signIn(request: APIRequestContext, key: AccountKey): Promise<string> {
  const { email, password } = account(key)
  const response = await request.post('/api/auth/login', { data: { email, password } })
  return (await json<{ csrf_token: string }>(response, 200)).csrf_token
}

/** Create a pending annotation on `word` of a fixture paragraph (the first one by default). */
export async function createAnnotation(
  request: APIRequestContext,
  csrfToken: string,
  options: { paragraph?: number; word: string; concept: TestConcept; justification?: string },
): Promise<Contribution> {
  const { iri, text } = corpus.paragraphs[options.paragraph ?? 0]
  const start = text.indexOf(options.word)
  expect(start, `"${options.word}" is not in the paragraph`).toBeGreaterThanOrEqual(0)
  const response = await request.post('/api/annotations', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: {
      paragraph_uri: iri,
      target_text: options.word,
      start_offset: start,
      end_offset: start + options.word.length,
      concept_uri: options.concept.uri,
      concept_label: options.concept.label,
      justification: options.justification ?? null,
    },
  })
  return json<Contribution>(response, 201)
}

/** Create a pending term proposal. */
export async function createProposal(
  request: APIRequestContext,
  csrfToken: string,
  prefLabel: string,
  definition?: string,
): Promise<Contribution> {
  const response = await request.post('/api/thesaurus/proposals', {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { pref_label: prefLabel, language: 'la', definition: definition ?? null },
  })
  return json<Contribution>(response, 201)
}

/** Review an annotation (`kind: 'annotations'`) or a term proposal (`'thesaurus/proposals'`). */
export async function reviewContribution(
  request: APIRequestContext,
  csrfToken: string,
  kind: 'annotations' | 'thesaurus/proposals',
  contribution: Contribution,
  decision: { decision: 'validated' } | { decision: 'rejected'; reason: string },
): Promise<Contribution> {
  const response = await request.post(`/api/${kind}/${contribution.id}/review`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { version: contribution.version, ...decision },
  })
  return json<Contribution>(response, 200)
}

/** As admin, find the id of an account by its email (`GET /api/admin/users`). */
export async function findUserId(request: APIRequestContext, email: string): Promise<number> {
  const page = await json<{ items: { id: number; email: string }[] }>(
    await request.get('/api/admin/users?limit=100'),
    200,
  )
  const user = page.items.find((item) => item.email === email)
  expect(user, `no account with the email ${email}`).toBeDefined()
  return user!.id
}

/** As admin, issue a password reset token for the account `userId`. */
export async function issueResetToken(request: APIRequestContext, csrfToken: string, userId: number): Promise<string> {
  const response = await request.post(`/api/admin/users/${userId}/password-reset`, {
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return (await json<{ token: string }>(response, 201)).token
}

/** The fields of a term proposal that an edit may change (`PATCH /api/thesaurus/proposals/{id}`). */
export interface ProposalEdit {
  pref_label?: string
  definition?: string | null
}

/** Edit a pending term proposal (RM-CTB-05); the `version` is the one the editor loaded. */
export async function editProposal(
  request: APIRequestContext,
  csrfToken: string,
  contribution: Contribution,
  changes: ProposalEdit,
): Promise<Contribution> {
  const response = await request.patch(`/api/thesaurus/proposals/${contribution.id}`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { version: contribution.version, ...changes },
  })
  return json<Contribution>(response, 200)
}

/** Edit the justification of a pending annotation (RM-CTB-05). */
export async function editAnnotation(
  request: APIRequestContext,
  csrfToken: string,
  contribution: Contribution,
  justification: string | null,
): Promise<Contribution> {
  const response = await request.patch(`/api/annotations/${contribution.id}`, {
    headers: { 'X-CSRF-Token': csrfToken },
    data: { version: contribution.version, justification },
  })
  return json<Contribution>(response, 200)
}
