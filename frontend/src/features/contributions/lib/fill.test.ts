import { describe, expect, it } from 'vite-plus/test'
import { fill } from './fill'

describe('fill', () => {
  it('replaces each placeholder once, in one pass', () => {
    expect(fill('{a} then {b}', { a: '{b}', b: 'B' })).toBe('{b} then B')
  })

  it('inserts values literally, even with replacement patterns', () => {
    expect(fill('By {a}', { a: "O$&'Neil" })).toBe("By O$&'Neil")
  })

  it('keeps an unknown placeholder visible', () => {
    expect(fill('{x}', {})).toBe('{x}')
  })
})
