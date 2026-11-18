import { readFileSync } from 'node:fs'

/** A test account of `e2e/fixtures/accounts.json`, seeded as active by the e2e stack. */
export interface TestAccount {
  email: string
  password: string
  displayName: string
  affiliation: string
  role: 'admin' | 'contributor'
}

export type AccountKey = 'admin' | 'alice' | 'bruno' | 'carol'

const accounts = JSON.parse(readFileSync(new URL('../fixtures/accounts.json', import.meta.url), 'utf-8')) as Record<
  AccountKey,
  TestAccount
>

/** The test account `key`. `carol` is reserved for the password-reset journey. */
export function account(key: AccountKey): TestAccount {
  return accounts[key]
}
