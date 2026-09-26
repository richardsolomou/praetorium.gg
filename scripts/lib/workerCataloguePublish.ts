import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { workerCatalogueManifest } from '../../src/server/workerCatalogueStore'

type Store = {
  get: (key: string) => Promise<Uint8Array | null>
  put: (key: string, bytes: Uint8Array) => Promise<void>
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export async function publishWorkerCatalogue(directory: string, store: Store) {
  const manifestBytes = await readFile(path.join(directory, 'manifest.json'))
  const value: unknown = JSON.parse(manifestBytes.toString('utf8'))
  if (!value || typeof value !== 'object' || !('snapshotId' in value) || typeof value.snapshotId !== 'string') {
    throw new Error('Invalid Worker catalogue snapshot ID')
  }
  const manifest = workerCatalogueManifest(value, value.snapshotId)
  const prefix = `snapshots/${manifest.snapshotId}/`

  async function publish(name: string, bytes: Uint8Array, expected: string) {
    if (sha256(bytes) !== expected) throw new Error(`Worker catalogue ${name} checksum does not match`)
    const key = `${prefix}${name}`
    const existing = await store.get(key)
    if (existing) {
      if (sha256(existing) !== expected) throw new Error(`Published Worker catalogue ${name} differs`)
      return
    }
    await store.put(key, bytes)
    const published = await store.get(key)
    if (!published || sha256(published) !== expected) throw new Error(`Published Worker catalogue ${name} failed readback`)
  }

  for (const [name, entry] of Object.entries(manifest.entries).toSorted(([left], [right]) => left.localeCompare(right))) {
    const bytes = await readFile(path.join(directory, name))
    if (bytes.byteLength !== entry.bytes) throw new Error(`Worker catalogue ${name} size does not match`)
    await publish(name, bytes, entry.sha256)
  }
  const manifestSha256 = sha256(manifestBytes)
  await publish('manifest.json', manifestBytes, manifestSha256)
  return { snapshotId: manifest.snapshotId, manifestSha256 }
}
