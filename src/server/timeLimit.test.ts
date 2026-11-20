import { expect, it } from 'vitest'
import { withinTime } from './timeLimit'

it('stops a pattern still backtracking when its time is up', () => {
  const line = `[a]${' '.repeat(2_000)}x`
  expect(() => withinTime(50, () => /^(?:\[a\]\s*)*(.+?)\s*(?:\(\d+\))?\s*:/.test(line))).toThrow(/timed out/)
})

it('answers with what the work returns', () => {
  expect(withinTime(50, () => 'read')).toBe('read')
})
