import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HOLD_DELAY, HOLD_INTERVAL, holdRepeat } from './holdRepeat'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('a short press repeats nothing', () => {
  const step = vi.fn(() => true)
  const stop = holdRepeat(step)
  vi.advanceTimersByTime(HOLD_DELAY - 1)
  stop()
  vi.advanceTimersByTime(HOLD_DELAY * 10)
  expect(step).not.toHaveBeenCalled()
})

test('a held press steps once the delay passes and then on every interval', () => {
  const step = vi.fn(() => true)
  holdRepeat(step)
  vi.advanceTimersByTime(HOLD_DELAY + HOLD_INTERVAL * 2)
  expect(step).toHaveBeenCalledTimes(3)
})

test('releasing stops the repeat', () => {
  const step = vi.fn(() => true)
  const stop = holdRepeat(step)
  vi.advanceTimersByTime(HOLD_DELAY)
  stop()
  vi.advanceTimersByTime(HOLD_INTERVAL * 5)
  expect(step).toHaveBeenCalledTimes(1)
})

test('a step that reaches its limit stops the repeat', () => {
  let left = 2
  const step = vi.fn(() => left-- > 0)
  holdRepeat(step)
  vi.advanceTimersByTime(HOLD_DELAY + HOLD_INTERVAL * 10)
  expect(step).toHaveBeenCalledTimes(3)
})
