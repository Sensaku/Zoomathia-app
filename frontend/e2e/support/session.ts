import type { Browser, BrowserContext, Page } from '@playwright/test'
import { signIn } from './api'
import type { AccountKey } from './accounts'

/** A browser context of one person, with the page and (for an account) its CSRF token for the API helpers. */
export interface Person {
  context: BrowserContext
  page: Page
  /** CSRF token of the session; empty for a visitor. */
  csrf: string
}

// `browser.newContext` ignores the `use` options of the config, so they are repeated here.
const contextOptions = { baseURL: 'http://127.0.0.1:4173', locale: 'fr-FR' }

/** A fresh context for a visitor (`key` omitted) or for an account signed in through the API. */
export async function openPerson(browser: Browser, key?: AccountKey): Promise<Person> {
  const context = await browser.newContext(contextOptions)
  const csrf = key ? await signIn(context.request, key) : ''
  return { context, page: await context.newPage(), csrf }
}
