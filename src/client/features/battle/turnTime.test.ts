import { describe, expect, it } from 'vitest'
import { formatDuration } from './turnTime'

describe('a turn time', () => {
  it('reads as minutes and seconds under an hour', () => {
    expect(formatDuration(12 * 60_000 + 4_999)).toBe('12:04')
  })

  it('pads single-digit seconds', () => {
    expect(formatDuration(5_000)).toBe('0:05')
  })

  it('adds hours once a stretch passes one', () => {
    expect(formatDuration(3_600_000 + 3 * 60_000 + 7_000)).toBe('1:03:07')
  })
})
