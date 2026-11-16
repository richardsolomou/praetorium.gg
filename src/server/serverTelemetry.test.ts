import { afterEach, expect, it, vi } from 'vitest'
import { createTelemetry } from './telemetry'
import { serverTelemetry } from './serverTelemetry'

vi.mock('./telemetry', () => ({ createTelemetry: vi.fn(() => ({})) }))
afterEach(() => vi.unstubAllEnvs())

it('attributes logs, metrics and spans to the public deployment host', () => {
  vi.stubEnv('APP_URL', 'https://praetorium.gg')
  serverTelemetry()
  expect(createTelemetry).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ resourceAttributes: { 'deployment.host': 'praetorium.gg' } }),
  )
})
