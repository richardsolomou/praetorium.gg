import { afterEach, expect, it, vi } from 'vitest'
import { calculationRead } from './calculationRead'

afterEach(() => vi.unstubAllGlobals())

it('uses server calculations without starting local work while connected', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  const local = vi.fn(() => 'device')
  const result = await calculationRead(async () => 'server', local)
  expect({ result, calculations: local.mock.calls.length }).toEqual({ result: 'server', calculations: 0 })
})

it('calculates locally without attempting the server while offline', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  const online = vi.fn(async () => 'server')
  const result = await calculationRead(online, () => 'device')
  expect({ result, requests: online.mock.calls.length }).toEqual({ result: 'device', requests: 0 })
})

it('falls back locally when connectivity is reported but the request fails', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  expect(
    await calculationRead(
      async () => {
        throw new TypeError('Failed to fetch')
      },
      () => 'device',
    ),
  ).toBe('device')
})

it('aborts a stalled server request before falling back locally', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  vi.useFakeTimers()
  let requestSignal: AbortSignal | undefined
  try {
    const result = calculationRead(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          requestSignal = signal
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
      () => 'device',
    )
    await vi.advanceTimersByTimeAsync(5_000)
    expect({ result: await result, aborted: requestSignal?.aborted }).toEqual({ result: 'device', aborted: true })
  } finally {
    vi.useRealTimers()
  }
})

it('does not start local calculations for a cancelled caller', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  const controller = new AbortController()
  const local = vi.fn(() => 'device')
  const result = calculationRead(
    (signal) =>
      new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
    local,
    controller.signal,
  )
  controller.abort()
  await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  expect(local).not.toHaveBeenCalled()
})
