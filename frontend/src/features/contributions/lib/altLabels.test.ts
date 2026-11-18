import { describe, expect, it } from 'vite-plus/test'
import { areAltLabelsValid, parseAltLabels } from './altLabels'

describe('alternative labels', () => {
  it('splits on commas, trims, drops empty and duplicate labels', () => {
    expect(parseAltLabels(' thos, , Loup doré,THOS ,')).toEqual(['thos', 'Loup doré'])
  })

  it('refuses more than 20 labels or a label over 200 characters', () => {
    expect(areAltLabelsValid(Array.from({ length: 20 }, (_, i) => `a${i}`))).toBe(true)
    expect(areAltLabelsValid(Array.from({ length: 21 }, (_, i) => `a${i}`))).toBe(false)
    expect(areAltLabelsValid(['x'.repeat(201)])).toBe(false)
  })
})
