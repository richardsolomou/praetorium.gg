import { beforeEach, expect, it, vi } from 'vitest'
import { reportServerErrorResponses } from './rpc'

const mocks = vi.hoisted(() => ({ log: vi.fn() }))
vi.mock('../adapters/posthog', () => ({
  reportsToTelemetry: false,
  serverTelemetry: () => ({ log: mocks.log, metrics: { count: vi.fn() } }),
}))
vi.mock('ras-stack/posthog/server', () => ({ createPostHogRpcLogger: vi.fn(), createPostHogRpcObserver: vi.fn() }))

const request = new Request('https://praetorium.gg/_serverFn/abc')
const answered = (status: number) => () => Promise.reject(new Error('request failed', { cause: new Response(null, { status }) }))

beforeEach(() => mocks.log.mockReset().mockResolvedValue(undefined))

it('logs an answer that is the server’s fault by its status', async () => {
  await expect(reportServerErrorResponses(request, answered(502))).rejects.toThrow('request failed')

  expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ attributes: { status: 502, request_path: '/_serverFn/abc' } }))
})

it('leaves a refusal the player caused unlogged', async () => {
  await expect(reportServerErrorResponses(request, answered(409))).rejects.toThrow('request failed')

  expect(mocks.log).not.toHaveBeenCalled()
})
