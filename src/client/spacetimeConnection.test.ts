import { afterEach, expect, it, vi } from 'vitest'
import { maintainSpacetimeConnection } from './spacetimeConnection'

afterEach(() => {
  vi.useRealTimers()
})

it('reconnects promptly after an unexpected socket disconnect', async () => {
  vi.useFakeTimers()
  const issued = vi.fn(async () => 'ticket')
  let fail: (() => void) | undefined
  const open = vi.fn((_ticket: string, failed: () => void) => {
    fail = failed
    return { disconnect: vi.fn() }
  })
  const stop = maintainSpacetimeConnection({ issue: issued, open, inactive: vi.fn(), report: vi.fn() })
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
  fail!()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(open).toHaveBeenCalledTimes(2)
  stop()
})

it('does not retry an intentional token refresh or a stopped connection twice', async () => {
  vi.useFakeTimers()
  let fail: (() => void) | undefined
  const open = vi.fn((_ticket: string, failed: () => void) => {
    fail = failed
    return { disconnect: () => failed() }
  })
  const stop = maintainSpacetimeConnection({ issue: async () => 'ticket', open, inactive: vi.fn(), report: vi.fn() })
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1))
  await vi.advanceTimersByTimeAsync(4 * 60 * 1_000)
  expect(open).toHaveBeenCalledTimes(2)
  stop()
  fail!()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(open).toHaveBeenCalledTimes(2)
})
