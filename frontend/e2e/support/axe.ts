import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Assert that the page has no WCAG 2.0/2.1 A or AA axe violation (colour contrast included).
 * `include` limits the check to the given selectors, for the legacy screens whose older parts
 * still have known violations: only the P0-5a UI is checked there.
 */
export async function expectNoAxeViolations(page: Page, include: string[] = []): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  for (const selector of include) builder.include(selector)
  const results = await builder.analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}
