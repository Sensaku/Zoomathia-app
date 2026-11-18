import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/** Assert that the whole page has no WCAG 2.0/2.1 A or AA axe violation (colour contrast included). */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}
