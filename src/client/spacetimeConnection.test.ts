import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { maintainSpacetimeConnection } from './spacetimeConnection'
import { RealtimeHttpError } from './realtimeErrors'

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
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

it('backs off ticket failures to a bounded delay with jitter', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const issue = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  })
  const stop = maintainSpacetimeConnection({ issue, open: vi.fn(), inactive: vi.fn(), report: vi.fn() })
  await vi.advanceTimersByTimeAsync(0)
  const attempts = []
  for (const delay of [7_500, 15_000, 30_000, 60_000, 90_000, 90_000]) {
    await vi.advanceTimersByTimeAsync(delay - 1)
    attempts.push(issue.mock.calls.length)
    await vi.advanceTimersByTimeAsync(1)
    attempts.push(issue.mock.calls.length)
  }
  stop()
  expect(attempts).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7])
})

it('reports an unexpected failure once until the subscription has recovered', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  let fail: (error?: unknown) => void = () => {}
  let ready: () => void = () => {}
  const report = vi.fn()
  const stop = maintainSpacetimeConnection({
    issue: async () => 'ticket',
    open: (_ticket, failed, _isCurrent, connected) => {
      fail = failed
      ready = connected
      return { disconnect: vi.fn() }
    },
    inactive: vi.fn(),
    report,
  })
  await vi.advanceTimersByTimeAsync(0)
  fail(new Event('error'))
  await vi.advanceTimersByTimeAsync(5_000)
  const error = new Error('Invalid subscription')
  fail(error)
  await vi.advanceTimersByTimeAsync(10_000)
  fail(error)
  await vi.advanceTimersByTimeAsync(20_000)
  ready()
  await vi.advanceTimersByTimeAsync(30_000)
  fail(error)
  stop()
  expect(report.mock.calls).toEqual([[error], [error]])
})

it('keeps backing off when sockets open but subscriptions fail or flap', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  let fail: () => void = () => {}
  let ready: () => void = () => {}
  const issue = vi.fn(async () => 'ticket')
  const stop = maintainSpacetimeConnection({
    issue,
    open: (_ticket, failed, _isCurrent, connected) => {
      fail = failed
      ready = connected
      return { disconnect: vi.fn() }
    },
    inactive: vi.fn(),
    report: vi.fn(),
  })
  await vi.advanceTimersByTimeAsync(0)
  fail()
  await vi.advanceTimersByTimeAsync(5_000)
  ready()
  await vi.advanceTimersByTimeAsync(29_000)
  fail()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(issue).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(5_000)
  ready()
  await vi.advanceTimersByTimeAsync(30_000)
  fail()
  await vi.advanceTimersByTimeAsync(5_000)
  expect(issue).toHaveBeenCalledTimes(4)
  stop()
})

it('cancels a pending retry when stopped', async () => {
  vi.useFakeTimers()
  const issue = vi.fn(async () => {
    throw new Error('unavailable')
  })
  const stop = maintainSpacetimeConnection({ issue, open: vi.fn(), inactive: vi.fn(), report: vi.fn() })
  await vi.advanceTimersByTimeAsync(0)
  stop()
  await vi.advanceTimersByTimeAsync(120_000)
  expect(issue).toHaveBeenCalledTimes(1)
})

it('ignores a ticket that arrives after stopping', async () => {
  let resolve: (value: string) => void = () => {}
  const open = vi.fn()
  const stop = maintainSpacetimeConnection({
    issue: () =>
      new Promise<string>((done) => {
        resolve = done
      }),
    open,
    inactive: vi.fn(),
    report: vi.fn(),
  })
  stop()
  resolve('ticket')
  await Promise.resolve()
  expect(open).not.toHaveBeenCalled()
})

it('reports a service outage once after consecutive unavailable attempts', async () => {
  vi.useFakeTimers()
  const report = vi.fn()
  const stop = maintainSpacetimeConnection({
    issue: async () => {
      throw new RealtimeHttpError('Spacetime guest token', 502)
    },
    open: vi.fn(),
    inactive: vi.fn(),
    report,
  })
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  stop()
  expect(report.mock.calls.map(([error]) => (error as Error).message)).toEqual([
    'Spacetime guest token failed with HTTP 502 on 5 consecutive attempts',
  ])
})

it('restarts the outage count after a ticket is issued', async () => {
  vi.useFakeTimers()
  const issue = vi.fn(async () => {
    if (issue.mock.calls.length === 5) return 'ticket'
    throw new RealtimeHttpError('Spacetime token', 503)
  })
  const report = vi.fn()
  const stop = maintainSpacetimeConnection({ issue, open: () => ({ disconnect: vi.fn() }), inactive: vi.fn(), report })
  await vi.advanceTimersByTimeAsync(320_000)
  stop()
  expect([issue.mock.calls.length, report.mock.calls.length]).toEqual([6, 0])
})

it('does not report a sustained network failure', async () => {
  vi.useFakeTimers()
  const report = vi.fn()
  const stop = maintainSpacetimeConnection({
    issue: async () => {
      throw new TypeError('Failed to fetch')
    },
    open: vi.fn(),
    inactive: vi.fn(),
    report,
  })
  await vi.advanceTimersByTimeAsync(10 * 60_000)
  stop()
  expect(report).not.toHaveBeenCalled()
})
