/**
 * Where to go after login: the `next` parameter comes from the address bar, so anyone can
 * craft it. Only a path of this site is followed (open redirect protection).
 */

const FALLBACK = '/'
const LOGIN_PATH = '/login'
// A placeholder origin to resolve the path: a value that leaves this origin is refused.
const BASE = 'http://site.invalid'

/**
 * Whether `value` holds a C0 or C1 control character. Browsers drop tab and newline inside a
 * URL, so `/<tab>/evil` would become `//evil`. Char codes avoid a regex of control characters.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/**
 * A safe in-app destination from a raw `next` value, or `/` when the value is not safe.
 *
 * Accepted: a path that starts with one `/`, with no backslash and no control character, that
 * stays on this origin once resolved. The result keeps the path, the query and the fragment.
 * Refused (`/`): empty or missing values, `//host`, `/\host`, absolute URLs (`https:`,
 * `javascript:`), and the login page itself (it would loop).
 *
 * @param raw - The `next` value, as read from the address bar.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '') return FALLBACK
  if (!raw.startsWith('/') || raw.startsWith('//')) return FALLBACK
  if (raw.includes('\\') || hasControlCharacter(raw)) return FALLBACK
  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return FALLBACK
  }
  if (url.origin !== BASE) return FALLBACK
  // Dot segments can rebuild a `//host` prefix once resolved (`/a/..//evil.example`).
  if (url.pathname.startsWith('//')) return FALLBACK
  if (url.pathname === LOGIN_PATH || url.pathname === `${LOGIN_PATH}/`) return FALLBACK
  return `${url.pathname}${url.search}${url.hash}`
}
