import { expect, test, type Page } from '@playwright/test'
import { concept, createAnnotation, reviewContribution } from './support/api'
import { expectNoAxeViolations } from './support/axe'
import { corpus, readerParagraphUrl } from './support/corpus'
import { openPerson } from './support/session'
import { actionName, unique } from './support/unique'

/** The card of the annotation on `label` in the annotation panel. */
const cardOf = (page: Page, label: string) =>
  page.getByRole('article').filter({ has: page.getByRole('button', { name: label }) })

test.describe('Annotations in the reader', () => {
  test('the author edits the justification of a pending annotation (RM-CTB-05)', async ({ browser }) => {
    const label = unique('Aquila')
    const newJustification = unique('Justification révisée')
    const author = await openPerson(browser, 'alice')
    await createAnnotation(author.context.request, author.csrf, {
      paragraph: 2,
      word: 'Aquila',
      concept: concept(101, label),
      justification: 'Justification initiale.',
    })

    // The unreviewed filter is on, so the pending annotation shows (RM-ACC-03).
    await author.page.goto(`${readerParagraphUrl(corpus.paragraphs[2].iri)}&pending=1`)
    const card = cardOf(author.page, label)
    await expect(card.getByText('Justification initiale.')).toBeVisible()
    await card.getByRole('button', { name: actionName('Modifier', label) }).click()

    // Only the justification changes: the concept search is not used.
    const dialog = author.page.getByRole('dialog', { name: `Modifier « ${label} »` })
    await expect(dialog).toBeVisible()
    await expectNoAxeViolations(author.page)
    await dialog.getByLabel(/^Justification/).fill(newJustification)
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()
    await expect(card.getByText(newJustification)).toBeVisible()
    await expect(card.getByText('Justification initiale.')).toHaveCount(0)

    await author.context.close()
  })

  test('pending annotations are hidden until the filter is turned on (RM-ACC-03)', async ({ browser }) => {
    const pendingLabel = unique('Noctu')
    const validatedLabel = unique('Lupus')
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')
    await createAnnotation(author.context.request, author.csrf, {
      paragraph: 1,
      word: 'noctu',
      concept: concept(102, pendingLabel),
    })
    const toValidate = await createAnnotation(author.context.request, author.csrf, {
      paragraph: 1,
      word: 'Lupus',
      concept: concept(103, validatedLabel),
    })
    await reviewContribution(reviewer.context.request, reviewer.csrf, 'annotations', toValidate, {
      decision: 'validated',
    })

    // A visitor sees the validated annotation only.
    const visitor = await openPerson(browser)
    await visitor.page.goto(readerParagraphUrl(corpus.paragraphs[1].iri))
    const validated = cardOf(visitor.page, validatedLabel)
    await expect(validated).toBeVisible()
    await expect(validated.getByText('Validé', { exact: true })).toBeVisible()
    await expect(visitor.page.getByRole('button', { name: pendingLabel })).toHaveCount(0)

    // The filter shows the pending one, marked "Non relu".
    const toggle = visitor.page.getByRole('checkbox', { name: 'Afficher les contributions non relues' })
    await toggle.check()
    await expect(visitor.page).toHaveURL(/pending=1/)
    const pending = cardOf(visitor.page, pendingLabel)
    await expect(pending).toBeVisible()
    await expect(pending.getByText('Non relu', { exact: true })).toBeVisible()
    await expectNoAxeViolations(visitor.page)

    await author.context.close()
    await reviewer.context.close()
    await visitor.context.close()
  })

  test('a visitor follows a reference concept with the keyboard', async ({ browser }) => {
    const visitor = await openPerson(browser)
    const { page } = visitor
    await page.goto(readerParagraphUrl(corpus.paragraphs[0].iri))

    // The Corese annotation of the first paragraph is a card whose concept is a toggle button.
    const follow = page.getByRole('article').getByRole('button', { name: corpus.referenceAnnotation.label })
    await expect(follow).toHaveAttribute('aria-pressed', 'false')
    await follow.focus()
    await page.keyboard.press('Enter')
    await expect(follow).toHaveAttribute('aria-pressed', 'true')
    await expectNoAxeViolations(page)

    await visitor.context.close()
  })
})
