import type { AnyRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { afterInitialScreen } from './background'
let router: Pick<AnyRouter, 'state' | 'subscribe'>
let resolved: () => void
let frame: () => void
let idle: () => void
let unsubscribe: ReturnType<typeof vi.fn<() => void>>
beforeEach(() => {
  vi.useFakeTimers()
  unsubscribe = vi.fn()
  router = {
    state: { isLoading: false } as AnyRouter['state'],
    subscribe: vi.fn((_event, callback) => {
      resolved = callback as () => void
      return unsubscribe
    }),
  }
  vi.stubGlobal('window', {
    requestIdleCallback: vi.fn((callback) => {
      idle = callback
      return 1
    }),
    cancelIdleCallback: vi.fn(),
  })
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frame = callback
      return 1
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('waits for the initial route, two frames and idle time before warming', () => {
  router.state.isLoading = true
  const work = vi.fn()
  afterInitialScreen(router, work)
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  router.state.isLoading = false
  resolved()
  frame()
  frame()
  expect(work).not.toHaveBeenCalled()
  idle()
  expect(work).toHaveBeenCalledOnce()
})
it('waits again if navigation starts before idle time', () => {
  const work = vi.fn()
  afterInitialScreen(router, work)
  frame()
  frame()
  router.state.isLoading = true
  idle()
  expect(work).not.toHaveBeenCalled()
  router.state.isLoading = false
  resolved()
  frame()
  frame()
  idle()
  expect(work).toHaveBeenCalledOnce()
})
it('cancels scheduled work after unmount', () => {
  const work = vi.fn()
  const cancel = afterInitialScreen(router, work)
  frame()
  frame()
  cancel()
  idle()
  expect(work).not.toHaveBeenCalled()
})
it('uses a timer after painting when idle callbacks are unavailable', () => {
  vi.stubGlobal('window', {})
  const work = vi.fn()
  afterInitialScreen(router, work)
  frame()
  frame()
  expect(work).not.toHaveBeenCalled()
  vi.runAllTimers()
  expect(work).toHaveBeenCalledOnce()
})
