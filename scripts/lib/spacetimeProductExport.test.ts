import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { expect, it, vi } from 'vitest'
import { schema } from '../../src/db/schema'
import { exportSpacetimeProductBundle, productOrderColumns, productTableNames } from './productExport'
import { verifyProductBundle } from './productImport'

function query(name: string) {
  const table = Object.values(schema).find((candidate) => getTableName(candidate) === name)!
  const fields = Object.values(getTableColumns(table)).map((column) => column.name)
  const rows =
    name === 'user_onboarding'
      ? [['user-1', true]]
      : name === 'user_onboarding_tasks'
        ? [['["user-1","guide"]', 'user-1', 'guide', 'completed']]
        : []
  if (productOrderColumns[name as keyof typeof productOrderColumns].length > 1) fields.unshift('key')
  return [{ schema: { elements: fields.map((field) => ({ name: { some: field } })) }, rows }]
}

it('exports every SpacetimeDB product table into a verified import bundle', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'praetorium-spacetime-export-'))
  const destination = join(parent, 'product')
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const name = /FROM "([a-z_]+)"/.exec(typeof init?.body === 'string' ? init.body : '')?.[1]
    return Response.json(query(name!))
  })
  vi.stubGlobal('fetch', request)
  try {
    const manifest = await exportSpacetimeProductBundle(
      'https://spacetime.example/',
      'praetorium-production',
      'owner',
      destination,
      process.cwd(),
      {
        clientId: 'access-id',
        clientSecret: 'access-secret',
      },
    )
    expect(await verifyProductBundle(destination)).toEqual(manifest)
    expect((await readFile(join(destination, 'user_onboarding_tasks.jsonl'), 'utf8')).trim()).toBe(
      '{"user_id":"user-1","task":"guide","state":"completed"}',
    )
    expect(request).toHaveBeenCalledTimes(productTableNames.length)
  } finally {
    vi.unstubAllGlobals()
    await rm(parent, { recursive: true, force: true })
  }
})

it('rejects a SpacetimeDB response missing a product column', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'praetorium-spacetime-export-'))
  vi.stubGlobal('fetch', async () => Response.json([{ schema: { elements: [] }, rows: [] }]))
  try {
    await expect(
      exportSpacetimeProductBundle('https://spacetime.example/', 'praetorium-production', 'owner', join(parent, 'product'), process.cwd()),
    ).rejects.toThrow('SpacetimeDB column mismatch in user_onboarding')
  } finally {
    vi.unstubAllGlobals()
    await rm(parent, { recursive: true, force: true })
  }
})
