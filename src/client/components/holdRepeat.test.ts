import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { HOLD_DELAY, HOLD_INTERVAL, holdPress, holdRepeat } from './holdRepeat'

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

const pointer = (type: string, pointerId: number) => Object.assign(new Event(type), { pointerId })

function heldPress(steps = Infinity) {
  const events = new EventTarget()
  let left = steps
  const step = vi.fn(() => left-- > 0)
  const press = holdPress()
  press.press(1, events, step)
  return { events, step, press }
}

test('the click a held press ends with does not step again', () => {
  const { events, press } = heldPress()
  vi.advanceTimersByTime(HOLD_DELAY)
  events.dispatchEvent(pointer('pointerup', 1))
  expect(press.click(1)).toBe(false)
})

test('the click a short press ends with steps', () => {
  const { events, press } = heldPress()
  events.dispatchEvent(pointer('pointerup', 1))
  expect(press.click(1)).toBe(true)
})

test('an assistive technology click after a hold to the limit steps', () => {
  const { events, press } = heldPress(1)
  vi.advanceTimersByTime(HOLD_DELAY + HOLD_INTERVAL)
  events.dispatchEvent(pointer('pointerup', 1))
  vi.advanceTimersByTime(0)
  expect(press.click(0)).toBe(true)
})

test('a pointer click on a later tick after a hold steps', () => {
  const { events, press } = heldPress()
  vi.advanceTimersByTime(HOLD_DELAY)
  events.dispatchEvent(pointer('pointercancel', 1))
  vi.advanceTimersByTime(0)
  expect(press.click(1)).toBe(true)
})

test('another pointer lifting does not end the hold', () => {
  const { events, step } = heldPress()
  events.dispatchEvent(pointer('pointerup', 2))
  vi.advanceTimersByTime(HOLD_DELAY + HOLD_INTERVAL)
  expect(step).toHaveBeenCalledTimes(2)
})

test('releasing stops listening to the window', () => {
  const { events, step, press } = heldPress()
  press.release()
  const add = vi.spyOn(events, 'addEventListener')
  press.press(1, events, step)
  const signals = add.mock.calls.map(([, , options]) => (options as AddEventListenerOptions).signal)
  press.release()
  expect(signals.every((signal) => signal?.aborted)).toBe(true)
})

test('an assistive technology click straight after a hold steps', () => {
  const { events, press } = heldPress()
  vi.advanceTimersByTime(HOLD_DELAY)
  events.dispatchEvent(pointer('pointerup', 1))
  expect(press.click(0)).toBe(true)
})
