import type { NitroApp } from 'nitro/types'
import { expect, it, vi } from 'vitest'
import { globalSingleton } from '../lib/globalSingleton'
import shutdown from './shutdown'

function closeHooks() {
  const hooks: Array<() => unknown> = []
  shutdown({ hooks: { hook: (_name: string, hook: () => unknown) => hooks.push(hook) } } as unknown as NitroApp & {
    hooks: NonNullable<NitroApp['hooks']>
  })
  return hooks
}

it('shuts telemetry down when Nitro closes', async () => {
  const telemetry = globalSingleton('test.telemetry', () => ({ shutdown: vi.fn(async () => {}) }))
  await Promise.all(closeHooks().map((hook) => hook()))
  expect(telemetry.shutdown).toHaveBeenCalledWith(2_000)
})
