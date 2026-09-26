import { expect, it } from 'vitest'
import { readWorkerCatalogueAsset } from './workerCatalogueAssets'

const key = `snapshots/${'a'.repeat(64)}/${'b'.repeat(64)}/shared.json`

it('reads a private catalogue asset through the binding', async () => {
  const assets = { fetch: async (request: string) => new Response(request) }
  const bytes = await readWorkerCatalogueAsset(assets, key, 300)
  expect(new TextDecoder().decode(bytes)).toBe(`https://assets.local/_catalogue/${key}`)
})

it('rejects missing catalogue assets', async () => {
  const assets = { fetch: async () => new Response(null, { status: 404 }) }
  await expect(readWorkerCatalogueAsset(assets, key, 300)).rejects.toThrow('Worker catalogue asset unavailable')
})

it('rejects an oversized catalogue asset without trusting its content length', async () => {
  const assets = { fetch: async () => new Response('long body', { headers: { 'content-length': '1' } }) }
  await expect(readWorkerCatalogueAsset(assets, key, 4)).rejects.toThrow('Worker catalogue asset unavailable')
})
