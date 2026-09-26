import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { workerCatalogueManifest } from '../../src/server/workerCatalogueStore'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export async function installWorkerCatalogueAssets(source: string, destination: string) {
  const manifestBytes = await readFile(path.join(source, 'manifest.json'))
  const value: unknown = JSON.parse(manifestBytes.toString('utf8'))
  if (!value || typeof value !== 'object' || !('snapshotId' in value) || typeof value.snapshotId !== 'string') {
    throw new Error('Invalid Worker catalogue snapshot ID')
  }
  const manifest = workerCatalogueManifest(value, value.snapshotId)
  const manifestSha256 = sha256(manifestBytes)
  const assetRoot = path.join(destination, '_catalogue')
  const installed = path.join(assetRoot, 'snapshots', manifest.snapshotId, manifestSha256)

  await rm(assetRoot, { recursive: true, force: true })
  for (const [name, entry] of Object.entries(manifest.entries)) {
    const bytes = await readFile(path.join(source, name))
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`Worker catalogue ${name} checksum does not match`)
    }
    const target = path.join(installed, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  await writeFile(path.join(installed, 'manifest.json'), manifestBytes)
  return { snapshotId: manifest.snapshotId, manifestSha256 }
}
