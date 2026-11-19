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

  test('a visitor follows a concept across paragraphs with the keyboard', async ({ browser }) => {
    const label = unique('Bestia')
    const bestia = concept(301, label)
    const author = await openPerson(browser, 'alice')
    const reviewer = await openPerson(browser, 'bruno')
    for (const [paragraph, word] of [
      [0, 'silva'],
      [2, 'Aquila'],
    ] as const) {
      const created = await createAnnotation(author.context.request, author.csrf, { paragraph, word, concept: bestia })
      await reviewContribution(reviewer.context.request, reviewer.csrf, 'annotations', created, {
        decision: 'validated',
      })
    }

    const visitor = await openPerson(browser)
    const { page } = visitor
    await page.goto(readerParagraphUrl(corpus.paragraphs[0].iri))
    const follow = cardOf(page, label).getByRole('button', { name: label })
    // Measure before the panel toggle takes focus: focus already previews the concept.
    const mark = page.locator('mark', { hasText: corpus.referenceAnnotation.word })
    await expect(mark).toBeVisible()
    // A web font that swaps in later changes the width of the text, so measure once the fonts are loaded.
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const before = await mark.boundingBox()
    await follow.focus()
    await page.keyboard.press('Enter')

    // The banner is a named region; the table of contents also has "§ N" buttons, so search inside it.
    const banner = page.getByRole('region', { name: /^Annotation épinglée/ })
    await expect(banner).toContainText('Présent dans 2 paragraphe(s)')
    await expect(banner.getByRole('button', { name: '§ 1' })).toHaveAttribute('aria-current', 'true')
    const third = banner.getByRole('button', { name: '§ 3' })
    await expect(third).toBeVisible()
    // Paragraph 0 is active: its reference mark is dimmed (other concept pinned): no colour, and no
    // width change, or the text would move and re-wrap on every hover.
    await expect(mark).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const after = await mark.boundingBox()
    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(after?.width).toBeCloseTo(before?.width ?? -1, 0) // within 0.5 px
    await expectNoAxeViolations(page)

    await third.focus()
    await page.keyboard.press('Enter')
    await expect(third).toHaveAttribute('aria-current', 'true')

    await banner.getByRole('button', { name: "Désépingler l'annotation" }).focus()
    await page.keyboard.press('Enter')
    await expect(banner).toHaveCount(0)

    await author.context.close()
    await reviewer.context.close()
    await visitor.context.close()
  })
})
