import { afterEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  installed: true,
  setBackSwipe: vi.fn<(enabled: boolean) => Promise<boolean>>(),
}))
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => (state.installed ? { setBackSwipe: state.setBackSwipe } : null),
}))

afterEach(() => {
  state.installed = true
  vi.resetAllMocks()
  vi.resetModules()
})

it('cannot gate the back swipe in a build without the native module', async () => {
  state.installed = false
  const { canGateBackSwipe, setBackSwipe } = await import('./webSwipe')
  expect({ canGateBackSwipe, gated: await setBackSwipe(true) }).toEqual({ canGateBackSwipe: false, gated: false })
})

it('passes the gate to the native module and reports whether it applied', async () => {
  state.setBackSwipe.mockResolvedValue(true)
  const { setBackSwipe } = await import('./webSwipe')
  expect({ gated: await setBackSwipe(false), calls: state.setBackSwipe.mock.calls }).toEqual({ gated: true, calls: [[false]] })
})

it('reports the gate as not applied when the native module fails', async () => {
  state.setBackSwipe.mockRejectedValue(new Error('unavailable'))
  const { setBackSwipe } = await import('./webSwipe')
  expect(await setBackSwipe(true)).toBe(false)
})
