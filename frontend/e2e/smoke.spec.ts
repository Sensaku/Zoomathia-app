import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Smoke journeys: the pages that do not need the backend. Every API call is answered by an
// immediate 503, so that no backend is needed and none is reached.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, body: 'backend not available in e2e' }))
})

const pages = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about' },
]

for (const { name, path } of pages) {
  test.describe(name, () => {
    test('renders its main heading', async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })

    // Axe runs in a real browser here, so colour contrast is checked too (jsdom cannot).
    test('has no WCAG 2.1 A/AA axe violation', async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map((v) => v.id)).toEqual([])
    })
  })
}
