import { afterEach, beforeEach, expect, it } from 'vitest'
import { anySignal } from './abortSignals'

const native = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!

beforeEach(() => {
  Object.defineProperty(AbortSignal, 'any', { ...native, value: undefined })
})

afterEach(() => {
  Object.defineProperty(AbortSignal, 'any', native)
})

it('aborts with the reason of the first input to abort when the browser lacks AbortSignal.any', () => {
  const first = new AbortController()
  const second = new AbortController()
  const signal = anySignal([first.signal, second.signal])
  second.abort('second')
  first.abort('first')
  expect([signal.aborted, signal.reason]).toEqual([true, 'second'])
})

it('starts aborted when an input has already aborted and the browser lacks AbortSignal.any', () => {
  const signal = anySignal([new AbortController().signal, AbortSignal.abort('done')])
  expect([signal.aborted, signal.reason]).toEqual([true, 'done'])
})

it('stays open until an input aborts when the browser lacks AbortSignal.any', () => {
  expect(anySignal([new AbortController().signal, new AbortController().signal]).aborted).toBe(false)
})
