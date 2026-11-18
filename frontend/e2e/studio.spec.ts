import { expect, test } from '@playwright/test'
import { account } from './support/accounts'
import { concept, createAnnotation, reviewContribution } from './support/api'
import { expectNoAxeViolations } from './support/axe'
import { corpus, studioUrl } from './support/corpus'
import { openPerson } from './support/session'
import { unique } from './support/unique'

const bruno = account('bruno')

test.describe('Annotation studio', () => {
  test('a visitor reads the rejected and the unreviewed annotations of a paragraph (RM-ACC-03, RM-ACC-04)', async ({
    browser,
  }) => {
    const rejectedLabel = unique('Vulpes')
    const pendingLabel = unique('Ovis')
    const reason = unique('Concept trop général pour ce passage')
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')

    // Alice annotates the second paragraph twice; Bruno rejects one with a public reason.
    const toReject = await createAnnotation(author.context.request, author.csrf, {
      paragraph: 1,
      word: 'Lupus',
      concept: concept(201, rejectedLabel),
      justification: 'À rejeter.',
    })
    await reviewContribution(reviewer.context.request, reviewer.csrf, 'annotations', toReject, {
      decision: 'rejected',
      reason,
    })
    await createAnnotation(author.context.request, author.csrf, {
      paragraph: 1,
      word: 'ovium',
      concept: concept(202, pendingLabel),
    })

    // A visitor opens the studio, the chapter, then the paragraph.
    const visitor = await openPerson(browser)
    const { page } = visitor
    await page.goto(studioUrl)
    await page.getByRole('button', { name: corpus.chapterTitle }).click()
    await page.getByRole('button', { name: /^§ 2/ }).click()

    // The rejected tab lists the rejected annotation with its reason and its reviewer (RM-ACC-04).
    await page.getByRole('button', { name: 'Rejetées', exact: true }).click()
    const rejected = page.getByRole('article').filter({ hasText: rejectedLabel })
    await expect(rejected).toBeVisible()
    await expect(rejected.getByText('Rejeté', { exact: true })).toBeVisible()
    await expect(rejected.getByText(`Motif du rejet : ${reason}`)).toBeVisible()
    await expect(rejected.getByText(`Rejeté par ${bruno.displayName} (${bruno.affiliation})`)).toBeVisible()
    // A rejected annotation is not followed in the text, and the unreviewed one is hidden.
    await expect(rejected.getByRole('button', { name: rejectedLabel })).toHaveCount(0)
    await expect(page.getByText(pendingLabel)).toHaveCount(0)

    // The unreviewed tab ("Non relues") turns the filter on and shows the pending annotation (RM-ACC-03).
    await page.getByRole('button', { name: 'Non relues', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: 'Afficher les contributions non relues' })).toBeChecked()
    await expect(page).toHaveURL(/pending=1/)
    const pending = page.getByRole('article').filter({ has: page.getByRole('button', { name: pendingLabel }) })
    await expect(pending).toBeVisible()
    await expect(pending.getByText('Non relu', { exact: true })).toBeVisible()
    await expectNoAxeViolations(page)

    await author.context.close()
    await reviewer.context.close()
    await visitor.context.close()
  })
})
