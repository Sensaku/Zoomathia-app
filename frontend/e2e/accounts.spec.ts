import { expect, test } from '@playwright/test'
import { account } from './support/accounts'
import { findUserId, issueResetToken, signIn } from './support/api'
import { expectNoAxeViolations } from './support/axe'

const alice = account('alice')

test.describe('Sign-in', () => {
  test('a visitor signs in from the navbar, lands back, reads the profile and signs out', async ({ page }) => {
    await page.goto('/about')
    await page.getByRole('link', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/login\?next=%2Fabout/)
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible()
    await expectNoAxeViolations(page)

    // A wrong password shows the error and keeps the visitor on the form.
    await page.getByLabel(/^Adresse e-mail/).fill(alice.email)
    await page.getByLabel(/^Mot de passe/).fill('not-the-password-0000')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)

    // The right password goes back to the page the visitor came from.
    await page.getByLabel(/^Mot de passe/).fill(alice.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/about$/)

    // The account menu shows the display name, and "Mon compte" the profile (RM-CPT-05).
    await page.getByRole('button', { name: alice.displayName }).click()
    await page.getByRole('link', { name: 'Mon compte' }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: alice.email })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: alice.displayName })).toBeVisible()
    await expect(page.getByRole('definition').filter({ hasText: alice.affiliation })).toBeVisible()
    await expectNoAxeViolations(page)

    // Signing out brings the sign-in link back; the account page is not for visitors.
    await page.getByRole('button', { name: alice.displayName }).click()
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible()
    await expect(page.getByRole('button', { name: alice.displayName })).toHaveCount(0)
  })
})

test.describe('Password reset', () => {
  test('an administrator issues a link and the account owner sets a new password', async ({ page, playwright }) => {
    const carol = account('carol')
    const newPassword = `Reset-${Date.now().toString(36)}-e2e-Zq7`

    const adminApi = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:4173' })
    const csrf = await signIn(adminApi, 'admin')
    const token = await issueResetToken(adminApi, csrf, await findUserId(adminApi, carol.email))
    await adminApi.dispose()

    await page.goto(`/reset-password#token=${token}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Nouveau mot de passe' })).toBeVisible()
    // The token is read once, then removed from the address bar.
    await expect(page).toHaveURL(/\/reset-password$/)
    expect(await page.evaluate(() => window.location.hash)).toBe('')
    await expectNoAxeViolations(page)

    await page.getByLabel(/^Nouveau mot de passe/).fill(newPassword)
    await page.getByLabel(/^Confirmation du nouveau mot de passe/).fill(newPassword)
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
    await expect(page.getByText('Mot de passe modifié. Vous pouvez vous connecter.')).toBeVisible()

    await page.getByRole('link', { name: 'Aller à la connexion' }).click()
    await page.getByLabel(/^Adresse e-mail/).fill(carol.email)
    await page.getByLabel(/^Mot de passe/).fill(newPassword)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('button', { name: carol.displayName })).toBeVisible()
  })
})
