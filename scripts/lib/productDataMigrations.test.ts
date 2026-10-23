import { expect, it, vi } from 'vitest'
import { migrateProductData } from './productDataMigrations'

const source = { url: 'http://127.0.0.1:3000', database: 'migration-test', ownerToken: 'owner', operatorToken: 'operator' }
const sql = (keys: string[]) => Response.json([{ rows: keys.map((key) => [key]) }])

it('inventories private keys before upgrading in bounded operator batches', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(sql(Array.from({ length: 21 }, (_, index) => `roster-${index}`)))
    .mockResolvedValueOnce(sql(['heart']))
    .mockResolvedValueOnce(sql(['battle-sharer']))
    .mockResolvedValueOnce(sql(['collection-sharer']))
    .mockResolvedValueOnce(Response.json(JSON.stringify({ changed: 20 })))
    .mockResolvedValueOnce(Response.json(JSON.stringify({ changed: 1 })))
    .mockResolvedValueOnce(Response.json(JSON.stringify({ changed: 1 })))
    .mockResolvedValueOnce(Response.json(JSON.stringify({ changed: 1 })))
    .mockResolvedValueOnce(Response.json(JSON.stringify({ changed: 1 })))
  const totals = await migrateProductData(source, request)
  expect({
    totals,
    calls: request.mock.calls.map(([url, options]) => [
      url instanceof URL ? url.pathname : new URL(typeof url === 'string' ? url : url.url).pathname,
      options?.body,
      options?.headers,
    ]),
  }).toEqual({
    totals: { rosters: 21, collection: 1, battle_sharing: 1, collection_sharing: 1 },
    calls: [
      ['/v1/database/migration-test/sql', 'SELECT id FROM rosters', { authorization: 'Bearer owner', 'content-type': 'text/plain' }],
      ['/v1/database/migration-test/sql', 'SELECT key FROM collection', { authorization: 'Bearer owner', 'content-type': 'text/plain' }],
      [
        '/v1/database/migration-test/sql',
        'SELECT userId FROM battle_sharing',
        { authorization: 'Bearer owner', 'content-type': 'text/plain' },
      ],
      [
        '/v1/database/migration-test/sql',
        'SELECT userId FROM collection_sharing',
        { authorization: 'Bearer owner', 'content-type': 'text/plain' },
      ],
      ...[
        ['rosters', Array.from({ length: 20 }, (_, index) => `roster-${index}`)],
        ['rosters', ['roster-20']],
        ['collection', ['heart']],
        ['battle_sharing', ['battle-sharer']],
        ['collection_sharing', ['collection-sharer']],
      ].map((batch) => [
        '/v1/database/migration-test/call/migrate_product_data',
        JSON.stringify(batch),
        { authorization: 'Bearer operator', 'content-type': 'application/json' },
      ]),
    ],
  })
})

it('stops on a failed batch so a deployment cannot continue with partially upgraded data', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(sql(['roster']))
    .mockResolvedValueOnce(sql(['heart']))
    .mockResolvedValueOnce(sql([]))
    .mockResolvedValueOnce(sql([]))
    .mockResolvedValueOnce(new Response('', { status: 500 }))
  await expect(migrateProductData(source, request)).rejects.toThrow('HTTP 500')
  expect(request).toHaveBeenCalledTimes(5)
})

it('does not write when an inventory is invalid', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(sql(['roster']))
    .mockResolvedValueOnce(Response.json([{ rows: [[null]] }]))
  await expect(migrateProductData(source, request)).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
})

it('rejects an incomplete Access grant before contacting the database', async () => {
  const request = vi.fn<typeof fetch>()
  await expect(migrateProductData({ ...source, accessClientId: 'client' }, request)).rejects.toThrow('both Cloudflare')
  expect(request).not.toHaveBeenCalled()
})

it('refuses an oversized inventory before making any writes', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('x'.repeat(32_000_001)))
  await expect(migrateProductData(source, request)).rejects.toThrow('exceeds 32 MB')
  expect(request).toHaveBeenCalledTimes(1)
})
