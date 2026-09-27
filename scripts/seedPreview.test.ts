import { afterEach, expect, it, vi } from 'vitest'
import { seedPreview } from './seedPreview'

afterEach(() => vi.unstubAllEnvs())

it('refuses to seed without the preview flag', async () => {
  vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'false')
  await expect(seedPreview()).rejects.toThrow('Refusing to seed a database without the preview flag')
})

it('refuses to seed without the hosted storage configuration', async () => {
  vi.stubEnv('PRAETORIUM_SEED_PREVIEW', 'true')
  vi.stubEnv('SPACETIME_URL', '')
  await expect(seedPreview()).rejects.toThrow('Preview seed requires SpacetimeDB and auth configuration')
})
