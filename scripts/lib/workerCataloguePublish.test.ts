import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { publishWorkerCatalogue } from './workerCataloguePublish'

const snapshotId = 'a'.repeat(64)
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-catalogue-publish-'))
  const objects = new Map<string, Uint8Array>()
  const uploads: string[] = []
  const entries: Record<string, { sha256: string; bytes: number }> = {}
  for (const name of ['shared.json', 'navigation.json', 'search.json', 'reference-meta.json', 'references/global.json']) {
    const bytes = Buffer.from(`{"name":"${name}"}\n`)
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true })
    await writeFile(path.join(directory, name), bytes)
    entries[name] = { sha256: sha256(bytes), bytes: bytes.byteLength }
  }
  await writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify({ format: 'praetorium.worker-catalogue.v2', snapshotId, revision: 'revision', entries, partitions: {}, pickers: {} })}\n`,
  )
  const store = {
    get: async (key: string) => objects.get(key) ?? null,
    put: async (key: string, bytes: Uint8Array) => {
      uploads.push(key)
      objects.set(key, bytes)
    },
  }
  return { directory, objects, uploads, store }
}

it('publishes verified objects before the manifest and skips matching retries', async () => {
  const { directory, uploads, store } = await fixture()
  try {
    const first = await publishWorkerCatalogue(directory, store)
    await publishWorkerCatalogue(directory, store)
    expect({
      count: uploads.length,
      last: uploads.at(-1),
      hash: first.manifestSha256,
    }).toEqual({
      count: 6,
      last: `snapshots/${snapshotId}/${first.manifestSha256}/manifest.json`,
      hash: sha256(await readFile(path.join(directory, 'manifest.json'))),
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('refuses to overwrite different bytes at an immutable key', async () => {
  const { directory, objects, store } = await fixture()
  try {
    const manifestSha256 = sha256(await readFile(path.join(directory, 'manifest.json')))
    objects.set(`snapshots/${snapshotId}/${manifestSha256}/shared.json`, Buffer.from('different'))
    await expect(publishWorkerCatalogue(directory, store)).rejects.toThrow('Published Worker catalogue shared.json differs')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('does not publish a manifest when an object fails readback', async () => {
  const { directory, store, uploads } = await fixture()
  try {
    store.put = async (key: string) => {
      uploads.push(key)
    }
    await expect(publishWorkerCatalogue(directory, store)).rejects.toThrow('failed readback')
    const manifestSha256 = sha256(await readFile(path.join(directory, 'manifest.json')))
    expect(uploads).not.toContain(`snapshots/${snapshotId}/${manifestSha256}/manifest.json`)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('publishes a revised compilation beside the previous version of one source snapshot', async () => {
  const { directory, objects, store } = await fixture()
  try {
    const first = await publishWorkerCatalogue(directory, store)
    const changed = Buffer.from('{"name":"updated shared"}\n')
    await writeFile(path.join(directory, 'shared.json'), changed)
    const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
    manifest.entries['shared.json'] = { sha256: sha256(changed), bytes: changed.byteLength }
    await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
    const second = await publishWorkerCatalogue(directory, store)

    expect({
      different: first.manifestSha256 !== second.manifestSha256,
      old: objects.has(`snapshots/${snapshotId}/${first.manifestSha256}/manifest.json`),
      next: objects.has(`snapshots/${snapshotId}/${second.manifestSha256}/manifest.json`),
    }).toEqual({ different: true, old: true, next: true })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
