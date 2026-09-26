import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { productTableNames } from './productExport'
import { importProductBundle, verifyProductBundle } from './productImport'

async function bundle(rows: Partial<Record<string, Record<string, unknown>[]>>) {
  const directory = await mkdtemp(join(tmpdir(), 'praetorium-product-verify-'))
  const tables = []
  for (const name of productTableNames) {
    const content = (rows[name] ?? []).map((row) => `${JSON.stringify(row)}\n`).join('')
    await writeFile(join(directory, `${name}.jsonl`), content)
    tables.push({ name, count: rows[name]?.length ?? 0, sha256: createHash('sha256').update(content).digest('hex') })
  }
  const manifest = { version: 1, tables }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest))
  return { directory, manifest }
}

it('verifies the complete product table inventory', async () => {
  const { directory, manifest } = await bundle({})
  try {
    expect(await verifyProductBundle(directory)).toEqual(manifest)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects product bytes changed after export', async () => {
  const { directory } = await bundle({ battles: [{ id: 'battle-1', token: 'token-1', created_at: '1000' }] })
  try {
    await writeFile(join(directory, 'battles.jsonl'), '{"id":"battle-1","token":"token-2","created_at":"1000"}\n')
    await expect(verifyProductBundle(directory)).rejects.toThrow('Product export mismatch in battles')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('rejects an integer that SpacetimeDB would silently wrap', async () => {
  const { directory } = await bundle({
    rosters: [
      {
        id: 'roster-1',
        user_id: 'user-1',
        name: 'Roster',
        catalogue_id: 'catalogue',
        detachment_id: null,
        disposition: null,
        limit: 4_294_967_296,
        picks: '[]',
        prep: null,
        tags: '[]',
        waived_rules: '[]',
        optional_rules: '[]',
        borrowed_detachment_id: null,
        visibility: 'private',
        source: 'legacy',
        created_at: '1000',
        updated_at: '1000',
      },
    ],
  })
  try {
    await expect(verifyProductBundle(directory)).rejects.toThrow('Invalid limit in rosters')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('sends Access credentials when importing through a protected SpacetimeDB endpoint', async () => {
  const { directory } = await bundle({})
  const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json([{ schema: { elements: [] }, rows: [[0]] }]),
  )
  vi.stubGlobal('fetch', request)
  try {
    await importProductBundle(directory, 'https://spacetime.example/', 'praetorium-staging', 'owner-token', {
      clientId: 'access-id',
      clientSecret: 'access-secret',
    })
    const headers = new Headers(request.mock.calls[0]![1]?.headers)
    expect([headers.get('CF-Access-Client-Id'), headers.get('CF-Access-Client-Secret')]).toEqual(['access-id', 'access-secret'])
  } finally {
    vi.unstubAllGlobals()
    await rm(directory, { recursive: true, force: true })
  }
})
