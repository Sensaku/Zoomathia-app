import { describe, expect, it } from 'vite-plus/test'
import { safeNextPath } from './nextPath'

describe('safeNextPath (open redirect protection after login)', () => {
  it.each([
    ['/explore-work?work=x#p', '/explore-work?work=x#p'],
    ['/account', '/account'],
    ['/', '/'],
    ['/annotate?pending=1', '/annotate?pending=1'],
    ['/path%20with%20encoding', '/path%20with%20encoding'],
    ['/login-help', '/login-help'],
  ])('accepts the same-site path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it.each([
    ['a protocol-relative URL', '//evil.example'],
    ['a protocol-relative URL with a path', '//evil.example/x'],
    ['a backslash after the slash', '/\\evil.example'],
    ['a backslash later in the path', '/a\\b'],
    ['an absolute https URL', 'https://evil.example/x'],
    ['an absolute http URL', 'http://evil.example'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
    ['an empty string', ''],
    ['a path that does not start with a slash', 'evil.example'],
    ['a tab that browsers drop (/<tab>/evil)', '/\t/evil.example'],
    ['a newline', '/a\nb'],
    ['a carriage return', '/a\rb'],
    ['a null byte', '/a\u0000b'],
    ['a DEL character', '/a\u007fb'],
    ['dot segments that rebuild //host', '/a/..//evil.example'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?next=%2Faccount'],
    ['the login page with a trailing slash', '/login/'],
    ['a leading space', ' /account'],
  ])('refuses %s and falls back to /', (_label, raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })

  it.each([[null], [undefined]])('falls back to / for %s', (raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })
})
