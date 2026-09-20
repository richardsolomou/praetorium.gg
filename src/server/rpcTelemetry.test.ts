import { describe, expect, it, vi } from 'vitest'
import { observeServerFunction } from './rpcTelemetry'

function telemetryDouble() {
  const count = vi.fn(async () => undefined)
  const histogram = vi.fn(async () => undefined)
  const setAttribute = vi.fn()
  const withRequestContext = vi.fn(async (_request: Request, _options: unknown, work: () => unknown) => work())
  const withSpan = vi.fn(async (_name: string, _options: unknown, work: (span: { setAttribute: typeof setAttribute }) => unknown) =>
    work({ setAttribute }),
  )
  return {
    telemetry: { metrics: { count, histogram }, withRequestContext, withSpan } as unknown as Parameters<typeof observeServerFunction>[0],
    count,
    histogram,
    setAttribute,
    withRequestContext,
    withSpan,
  }
}

describe('server function telemetry', () => {
  it('links successful work to its request trace and records bounded metrics', async () => {
    const { telemetry, count, histogram, setAttribute, withRequestContext, withSpan } = telemetryDouble()
    const request = new Request('https://praetorium.gg/_server?id=secret', {
      method: 'POST',
      headers: { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
    })
    const times = [100, 142]

    await expect(
      observeServerFunction(
        telemetry,
        request,
        () => 'completed',
        () => times.shift()!,
      ),
    ).resolves.toBe('completed')
    expect(withRequestContext).toHaveBeenCalledWith(request, {}, expect.any(Function))
    expect(withSpan).toHaveBeenCalledWith(
      'server_function',
      { kind: 'server', parent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      expect.any(Function),
    )
    expect(setAttribute).toHaveBeenCalledWith('server.function.outcome', 'success')
    expect(count).toHaveBeenCalledWith('server_function.requests', 1, { attributes: { method: 'POST', outcome: 'success' } })
    expect(histogram).toHaveBeenCalledWith('server_function.duration', 42, { unit: 'ms', attributes: { method: 'POST' } })
  })

  it('records failed work before preserving the original error', async () => {
    const { telemetry, count, setAttribute } = telemetryDouble()
    const failure = new Error('failed')
    const request = new Request('https://praetorium.gg/_server')

    await expect(
      observeServerFunction(
        telemetry,
        request,
        () => Promise.reject(failure),
        () => 10,
      ),
    ).rejects.toBe(failure)
    expect(setAttribute).toHaveBeenCalledWith('server.function.outcome', 'error')
    expect(count).toHaveBeenCalledWith('server_function.requests', 1, { attributes: { method: 'GET', outcome: 'error' } })
  })
})
