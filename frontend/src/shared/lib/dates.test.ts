import { describe, expect, it } from 'vite-plus/test'
import { formatDate } from './dates'

describe('formatDate', () => {
  it('shows the day in the interface language', () => {
    expect(formatDate('2026-11-18T10:00:00+00:00', 'fr')).toMatch(/18 nov\.? 2026/)
    expect(formatDate('2026-11-18T10:00:00+00:00', 'en')).toMatch(/18 Nov 2026/)
  })

  it('returns an unreadable value as it is instead of "Invalid Date"', () => {
    expect(formatDate('not a date', 'fr')).toBe('not a date')
  })
})
