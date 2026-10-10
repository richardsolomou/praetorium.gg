import { expect, it, vi } from 'vitest'
import { offlineContext } from './offlineContext'

it('shares request context with separately loaded server module copies', async () => {
  vi.resetModules()
  const separate = await import('./offlineContext')
  const value = { id: crypto.randomUUID(), owner: 'player', fingerprint: 'fingerprint', createdAt: 1, identifiers: {}, wrote: false }
  expect(offlineContext.run(value, () => separate.offlineContext.getStore())).toBe(value)
})
