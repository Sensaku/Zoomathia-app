/**
 * Date display shared by the screens.
 */

import type { Language } from '../../i18n/types'

const LOCALES: Record<Language, string> = { fr: 'fr-FR', en: 'en-GB' }

/**
 * The day of an ISO timestamp from the API, in the reader's language, for example
 * "18 nov. 2026" or "18 Nov 2026". An unreadable value is returned as it is, never hidden.
 *
 * @param iso - Timestamp sent by the backend (UTC, with its offset).
 * @param language - Interface language.
 */
export function formatDate(iso: string, language: Language): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(LOCALES[language], { dateStyle: 'medium' }).format(date)
}
