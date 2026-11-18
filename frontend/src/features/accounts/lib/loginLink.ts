/** The part of a router location that the sign-in link needs. */
interface LocationLike {
  pathname: string
  search: string
  hash: string
}

/**
 * Link to the login page that brings the user back here afterwards. On the login page itself
 * the plain path is returned (`safeNextPath` would refuse `next=/login` anyway). The fragment
 * is kept only when `withHash` is set: the navbar link leaves it out, the other callers need it.
 * The fragment of `/reset-password` is never kept: it holds the reset token.
 */
export function loginLink(location: LocationLike, withHash = true): string {
  if (location.pathname === '/login') return '/login'
  const keepHash = withHash && location.pathname !== '/reset-password'
  const next = location.pathname + location.search + (keepHash ? location.hash : '')
  return `/login?next=${encodeURIComponent(next)}`
}
