import { describe, expect, it } from 'vite-plus/test'
import { loginLink } from './loginLink'

describe('loginLink', () => {
  it('keeps the path, the search and the fragment', () => {
    expect(loginLink({ pathname: '/explore-work', search: '?a=1', hash: '#p2' })).toBe(
      '/login?next=%2Fexplore-work%3Fa%3D1%23p2',
    )
  })

  it('leaves the fragment out when asked', () => {
    expect(loginLink({ pathname: '/explore-work', search: '', hash: '#p2' }, false)).toBe('/login?next=%2Fexplore-work')
  })

  it('returns the plain login path on the login page', () => {
    expect(loginLink({ pathname: '/login', search: '?next=%2Fa', hash: '' })).toBe('/login')
  })

  it('never copies the reset token of /reset-password into the link', () => {
    const link = loginLink({ pathname: '/reset-password', search: '', hash: '#token=secret' })
    expect(link).toBe('/login?next=%2Freset-password')
    expect(link).not.toContain('token')
  })
})
