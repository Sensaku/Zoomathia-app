import type { TranslationDictionary } from '../../../i18n/types'

/** Errors of a "new password and its confirmation" pair; a missing key means the field is fine. */
export interface NewPasswordErrors {
  newPassword?: string
  confirm?: string
}

/**
 * Checks what the browser could not: both fields filled and equal. The length rules stay with
 * the server (`invalid_password`), so they exist in one place only.
 */
export function validateNewPassword(t: TranslationDictionary, newPassword: string, confirm: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {}
  if (newPassword === '') errors.newPassword = t.auth.newPasswordRequired
  if (confirm === '') errors.confirm = t.auth.confirmRequired
  else if (confirm !== newPassword) errors.confirm = t.auth.confirmMismatch
  return errors
}
