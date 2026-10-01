import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { readLocalDevPreview, reuseLocalDevPreview, type LocalDevPreview } from './localDevPreview.ts'

it('reads the port and data directory of a previous local preview', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-local-preview-'))
  const file = path.join(directory, 'active-preview.json')
  const preview: LocalDevPreview = {
    pid: process.pid,
    appPort: 3301,
    spacetimePort: 13301,
    dataDir: path.join(directory, 'data'),
    catalogueDir: path.join(directory, 'catalogue'),
    publicUrl: 'http://127.0.0.1:3301',
  }
  try {
    await writeFile(file, JSON.stringify(preview))
    expect(readLocalDevPreview(file)).toEqual(preview)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('reuses a healthy local preview', async () => {
  const server = createServer((_request, response) => response.writeHead(200).end('ready'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No preview address')
    expect(
      await reuseLocalDevPreview({
        pid: process.pid,
        appPort: address.port,
        spacetimePort: address.port + 1,
        dataDir: tmpdir(),
        catalogueDir: tmpdir(),
        publicUrl: `http://127.0.0.1:${address.port}`,
      }),
    ).toBe(true)
  } finally {
    server.close()
  }
})

it('allows a new preview when the recorded process has exited', async () => {
  expect(
    await reuseLocalDevPreview({
      pid: 2_147_483_647,
      appPort: 3301,
      spacetimePort: 13301,
      dataDir: tmpdir(),
      catalogueDir: tmpdir(),
      publicUrl: 'http://127.0.0.1:3301',
    }),
  ).toBe(false)
})

it('rejects an invalid preview PID before checking it', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-local-preview-'))
  const file = path.join(directory, 'active-preview.json')
  try {
    await writeFile(
      file,
      JSON.stringify({
        pid: -1,
        appPort: 3301,
        spacetimePort: 13301,
        dataDir: directory,
        catalogueDir: directory,
        publicUrl: 'http://127.0.0.1:3301',
      }),
    )
    expect(() => readLocalDevPreview(file)).toThrow('Invalid local preview record')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
