import { afterEach, expect, it, vi } from 'vitest'
import { calculationRead } from './calculationRead'

afterEach(() => vi.unstubAllGlobals())

function connect(onLine: boolean) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine })
}

it('uses server calculations without starting local work while connected', async () => {
  connect(true)
  const local = vi.fn(() => 'device')
  const result = await calculationRead(async () => 'server', local)
  expect({ result, calculations: local.mock.calls.length }).toEqual({ result: 'server', calculations: 0 })
})

it('calculates locally without attempting the server while offline', async () => {
  connect(false)
  const online = vi.fn(async () => 'server')
  const result = await calculationRead(online, () => 'device')
  expect({ result, requests: online.mock.calls.length }).toEqual({ result: 'device', requests: 0 })
})

it('falls back locally when connectivity is reported but the request fails', async () => {
  connect(true)
  expect(
    await calculationRead(
      async () => {
        throw new TypeError('Failed to fetch')
      },
      () => 'device',
    ),
  ).toBe('device')
})

it('aborts a stalled server request after five seconds before falling back locally', async () => {
  connect(true)
  const deadline = new AbortController()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
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
    deadline.abort(new DOMException('The operation timed out.', 'TimeoutError'))
    expect({ result: await result, aborted: requestSignal?.aborted, after: timeout.mock.calls[0] }).toEqual({
      result: 'device',
      aborted: true,
      after: [5_000],
    })
  } finally {
    timeout.mockRestore()
  }
})

it('does not start local calculations for a cancelled caller', async () => {
  connect(true)
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
