/**
 * Accessibility helper over axe-core for component tests (RGAA, WCAG 2.0/2.1 A and AA).
 */
import axe from 'axe-core'

/**
 * Fails when axe-core finds a WCAG 2.0/2.1 A or AA violation in `container`.
 *
 * The failure message lists each rule id with its target selectors. The `color-contrast` rule
 * is disabled because jsdom has no layout engine to compute it; the Playwright journeys check
 * contrast in a real browser.
 *
 * @param container - The element to audit, for example the `container` returned by `render`.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  if (results.violations.length > 0) {
    const report = results.violations
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
      .join('\n')
    throw new Error(`Accessibility violations:\n${report}`)
  }
}
