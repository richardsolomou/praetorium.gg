import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  assertSavedDevData,
  assertPreviewOverrides,
  inspectLocalDevPreview,
  readLocalDevPreview,
  type LocalDevPreview,
} from './localDevPreview.ts'

const preview = (): LocalDevPreview => ({
  pid: process.pid,
  token: randomUUID(),
  worktree: '/worktree',
  mode: 'dev',
  ready: true,
  appPort: 3301,
  internalPort: 3302,
  spacetimePort: 13301,
  controlPort: 23301,
  database: 'praetorium-local-3301',
  dataDir: '/worktree/data-dev/hosted',
  catalogueDir: '/worktree/catalogue-data',
  publicUrl: 'http://127.0.0.1:3301',
})

async function withController(body: unknown, work: (port: number) => Promise<void>) {
  const server = createServer((_request, response) =>
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body)),
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No controller address')
    await work(address.port)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

it('reads a preview record with its worktree and owner identity', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-local-preview-'))
  const file = path.join(directory, 'active-preview.json')
  const record = preview()
  try {
    await writeFile(file, JSON.stringify(record))
    expect(readLocalDevPreview(file)).toEqual(record)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('recognizes the recorded controller independently of the application health endpoint', async () => {
  const record = preview()
  await withController(record, async (port) => {
    expect(await inspectLocalDevPreview(record.worktree, port, record.token)).toEqual(record)
  })
})

it('refuses an unrelated successful HTTP service', async () => {
  await withController({ healthy: true }, async (port) => {
    await expect(inspectLocalDevPreview('/worktree', port)).rejects.toThrow('not owned')
  })
})

it('refuses a controller belonging to another worktree', async () => {
  await withController(preview(), async (port) => {
    await expect(inspectLocalDevPreview('/another-worktree', port)).rejects.toThrow('not owned')
  })
})

it('refuses a replacement controller with the same worktree and a different owner token', async () => {
  await withController(preview(), async (port) => {
    await expect(inspectLocalDevPreview('/worktree', port, randomUUID())).rejects.toThrow('not owned')
  })
})

it('refuses a test stack when requesting an interactive preview', async () => {
  await withController({ ...preview(), mode: 'test' }, async (port) => {
    await expect(inspectLocalDevPreview('/worktree', port)).rejects.toThrow('not owned')
  })
})

it.each([
  'LOCAL_APP_PORT',
  'LOCAL_INTERNAL_PORT',
  'LOCAL_SPACETIME_PORT',
  'LOCAL_CONTROL_PORT',
  'LOCAL_DATA_DIR',
  'CATALOGUE_DIR',
  'LOCAL_PUBLIC_URL',
])('does not silently ignore a changed %s on a running preview', (name) => {
  expect(() => assertPreviewOverrides(preview(), { [name]: 'changed' })).toThrow(name)
})

it('reuses a preview when every explicit override matches', () => {
  const record = preview()
  expect(() => assertPreviewOverrides(record, { LOCAL_APP_PORT: String(record.appPort), LOCAL_DATA_DIR: record.dataDir })).not.toThrow()
})

it('preserves the product database name when upgrading an exited pre-controller preview', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-local-preview-'))
  const file = path.join(directory, 'active-preview.json')
  try {
    await writeFile(
      file,
      JSON.stringify({
        pid: 2_147_483_647,
        appPort: 3301,
        spacetimePort: 13301,
        dataDir: directory,
        catalogueDir: directory,
        publicUrl: 'http://127.0.0.1:3301',
      }),
    )
    expect(readLocalDevPreview(file)?.database).toBe('praetorium-local-3301')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('does not take over a living pre-controller preview', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-local-preview-'))
  const file = path.join(directory, 'active-preview.json')
  try {
    await writeFile(
      file,
      JSON.stringify({
        pid: process.pid,
        appPort: 3301,
        spacetimePort: 13301,
        dataDir: directory,
        catalogueDir: directory,
        publicUrl: 'http://127.0.0.1:3301',
      }),
    )
    expect(() => readLocalDevPreview(file)).toThrow('Stop an older runner')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it.each(['appPort', 'publicUrl'] as const)('refuses a changed %s before stopping a preview with existing data', (field) => {
  const record = preview()
  const next = {
    dataDir: record.dataDir,
    appPort: record.appPort,
    publicUrl: record.publicUrl,
    [field]: field === 'appPort' ? 4401 : 'http://127.0.0.1:4401',
  }
  expect(() => assertSavedDevData(record, next)).toThrow('authentication is bound')
})

it('allows new app settings when the caller selects fresh development data', () => {
  expect(() =>
    assertSavedDevData(preview(), { dataDir: '/worktree/fresh-data', appPort: 4401, publicUrl: 'http://127.0.0.1:4401' }),
  ).not.toThrow()
})

it('retains existing development data when the app settings match', () => {
  const record = preview()
  expect(() => assertSavedDevData(record, record)).not.toThrow()
})
