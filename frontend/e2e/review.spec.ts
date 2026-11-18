import { expect, test, type Page } from '@playwright/test'
import { account } from './support/accounts'
import { createProposal, editProposal } from './support/api'
import { expectNoAxeViolations } from './support/axe'
import { openPerson } from './support/session'
import { actionName, unique } from './support/unique'

const alice = account('alice')
const bruno = account('bruno')

/** URL of the proposals list on one tab, narrowed to one term so the journeys do not see each other's data. */
const proposalsUrl = (status: 'pending' | 'validated' | 'rejected', term: string) =>
  `/thesaurus-proposals?status=${status}&q=${encodeURIComponent(term)}`

/** The card of the proposal `term` in the list. */
const cardOf = (page: Page, term: string) =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: term }) })

test.describe('Peer review of a term proposal', () => {
  test('a proposal made through the form is validated by a second account (RM-MOD-01)', async ({ browser }) => {
    const term = unique('Leo fictivus')
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')

    // Alice proposes through the form.
    await author.page.goto('/thesaurus-proposals')
    await author.page.getByLabel(/^Terme préférentiel/).fill(term)
    await author.page.getByRole('button', { name: 'Soumettre la proposition' }).click()
    await expect(
      author.page.getByText("Proposition enregistrée. Elle attend la relecture d'un autre compte."),
    ).toBeVisible()

    // She cannot review her own proposal.
    await author.page.goto(proposalsUrl('pending', term))
    await expect(author.page.getByRole('heading', { level: 3, name: term })).toBeVisible()
    await expect(author.page.getByRole('button', { name: actionName('Valider', term) })).toHaveCount(0)
    await expect(author.page.getByRole('button', { name: actionName('Rejeter', term) })).toHaveCount(0)

    // Bruno opens the pending tab and validates after the confirmation.
    await reviewer.page.goto(proposalsUrl('pending', term))
    await expect(reviewer.page.getByRole('heading', { level: 3, name: term })).toBeVisible()
    await expectNoAxeViolations(reviewer.page)
    await reviewer.page.getByRole('button', { name: actionName('Valider', term) }).click()
    const dialog = reviewer.page.getByRole('dialog', { name: `Valider « ${term} » ?` })
    await expect(dialog).toBeVisible()
    await expectNoAxeViolations(reviewer.page)
    await dialog.getByRole('button', { name: 'Valider', exact: true }).click()
    await expect(dialog).toBeHidden()

    // The validated tab shows the status and the reviewer.
    await reviewer.page.goto(proposalsUrl('validated', term))
    const card = cardOf(reviewer.page, term)
    await expect(card.getByText('Validé', { exact: true })).toBeVisible()
    await expect(card.getByText(`Validé par ${bruno.displayName} (${bruno.affiliation})`)).toBeVisible()
    await expect(card.getByText(`Par ${alice.displayName} (${alice.affiliation})`)).toBeVisible()

    await author.context.close()
    await reviewer.context.close()
  })

  test('a rejection carries a public reason that a visitor can read (RM-MOD-03, RM-ACC-04)', async ({ browser }) => {
    const term = unique('Lupus fictivus')
    const reason = unique('Terme déjà couvert, voir la notice')
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')
    await createProposal(author.context.request, author.csrf, term, 'Une définition de test.')

    await reviewer.page.goto(proposalsUrl('pending', term))
    await reviewer.page.getByRole('button', { name: actionName('Rejeter', term) }).click()
    const dialog = reviewer.page.getByRole('dialog', { name: `Rejeter « ${term} »` })
    await expect(dialog.getByText('Le motif sera public : il sera affiché avec la contribution.')).toBeVisible()
    await expectNoAxeViolations(reviewer.page)

    // A rejection without a reason is refused before any request.
    await dialog.getByRole('button', { name: 'Rejeter', exact: true }).click()
    await expect(dialog.getByText('Indiquez le motif du rejet.').first()).toBeVisible()
    await dialog.getByLabel(/^Motif du rejet/).fill(reason)
    await dialog.getByRole('button', { name: 'Rejeter', exact: true }).click()
    await expect(dialog).toBeHidden()

    // A visitor reads the reason in the rejected tab.
    const visitor = await openPerson(browser)
    await visitor.page.goto(proposalsUrl('rejected', term))
    const card = cardOf(visitor.page, term)
    await expect(card.getByText('Rejeté', { exact: true })).toBeVisible()
    await expect(card.getByText(`Motif du rejet : ${reason}`)).toBeVisible()
    await expect(card.getByText(`Rejeté par ${bruno.displayName} (${bruno.affiliation})`)).toBeVisible()
    // A visitor gets no action button.
    await expect(card.getByRole('button')).toHaveCount(0)

    await author.context.close()
    await reviewer.context.close()
    await visitor.context.close()
  })

  test('a review of a stale version shows the conflict and the reloaded content (RM-CTB-05)', async ({ browser }) => {
    const term = unique('Aquila fictiva')
    const changedDefinition = unique('Définition révisée')
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')
    const proposal = await createProposal(author.context.request, author.csrf, term, 'Première définition.')

    // Bruno loads the review screen, then Alice edits the proposal behind his back.
    await reviewer.page.goto(proposalsUrl('pending', term))
    await expect(reviewer.page.getByText('Première définition.')).toBeVisible()
    await editProposal(author.context.request, author.csrf, proposal, { definition: changedDefinition })

    await reviewer.page.getByRole('button', { name: actionName('Valider', term) }).click()
    const dialog = reviewer.page.getByRole('dialog', { name: `Valider « ${term} » ?` })
    await dialog.getByRole('button', { name: 'Valider', exact: true }).click()

    // The confirm dialog is replaced by the conflict dialog, which only offers to close.
    const conflict = reviewer.page.getByRole('dialog', { name: 'Action non effectuée' })
    await expect(conflict).toBeVisible()
    await expect(conflict.getByText("Cette contribution a changé depuis que vous l'avez chargée.")).toBeVisible()
    await expect(conflict.getByText('Fermez cette fenêtre pour recharger la liste.')).toBeVisible()
    await expect(conflict.getByRole('button', { name: 'Fermer', exact: true })).toBeVisible()
    await expect(conflict.getByRole('button', { name: 'Annuler' })).toHaveCount(0)
    // The list reloads only after the dialog is closed.
    await expect(reviewer.page.getByText('Première définition.')).toBeVisible()
    await conflict.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(conflict).toBeHidden()

    // Alice's change shows and the proposal is still pending.
    await expect(reviewer.page.getByText(changedDefinition)).toBeVisible()
    const card = cardOf(reviewer.page, term)
    await expect(card.getByText('Non relu', { exact: true })).toBeVisible()

    // A second click opens a fresh confirm dialog, on the reloaded version.
    await card.getByRole('button', { name: actionName('Valider', term) }).click()
    await expect(reviewer.page.getByRole('dialog', { name: `Valider « ${term} » ?` })).toBeVisible()

    await author.context.close()
    await reviewer.context.close()
  })
})
