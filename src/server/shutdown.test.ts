import { expect, it, vi } from 'vitest'
import { globalSingleton } from '../lib/globalSingleton'
import shutdown from './shutdown'

it('shuts telemetry down when Nitro closes', async () => {
  const telemetry = globalSingleton('test.telemetry', () => ({ shutdown: vi.fn(async () => {}) }))
  const hooks: Array<() => unknown> = []
  shutdown({ hooks: { hook: (_name: string, hook: () => unknown) => hooks.push(hook) } } as never)
  await Promise.all(hooks.map((hook) => hook()))
  expect(telemetry.shutdown).toHaveBeenCalledWith(2_000)
})
