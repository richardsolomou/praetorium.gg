import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  available: false,
  installed: true,
  listener: undefined as ((event: { available: boolean }) => void) | undefined,
  remove: vi.fn(),
}))
vi.mock('expo', () => ({
  requireOptionalNativeModule: () =>
    state.installed
      ? {
          isAvailable: () => state.available,
          addListener: (_name: string, listener: typeof state.listener) => {
            state.listener = listener
            return { remove: state.remove }
          },
        }
      : null,
}))

afterEach(() => {
  state.available = false
  state.installed = true
  state.listener = undefined
  vi.clearAllMocks()
  vi.resetModules()
})

it('reports unavailable when the native module is absent', async () => {
  state.installed = false
  const { isWatchCompanionAvailable } = await import('./watchCompanion')
  expect(isWatchCompanionAvailable()).toBe(false)
})

it('reads current availability after subscribing and follows watch installation changes', async () => {
  const { subscribeWatchAvailability } = await import('./watchCompanion')
  const updates: boolean[] = []
  const stop = subscribeWatchAvailability((available) => updates.push(available))
  state.listener?.({ available: true })
  state.listener?.({ available: false })
  stop()
  expect({ updates, stopped: state.remove.mock.calls.length }).toEqual({ updates: [false, true, false], stopped: 1 })
})
