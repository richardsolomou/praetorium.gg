import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { parseCatalogueLock } from '../../src/server/catalogueSnapshot'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const HASH = /^[0-9a-f]{64}$/
const ASSET_PATH = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.json$/
const MAX_MANIFEST_BYTES = 512 * 1024
const MAX_ASSET_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024

async function regularFile(file: string, maxBytes: number) {
  const status = await lstat(file)
  if (!status.isFile() || status.size > maxBytes) throw new Error('Invalid preview catalogue file')
  return readFile(file)
}

export async function readPreviewCatalogueLock(directory: string) {
  const bytes = await regularFile(path.join(directory, 'catalogue-lock.json'), 16 * 1024)
  return parseCatalogueLock(JSON.parse(bytes.toString('utf8')))
}

async function filesUnder(directory: string, relative = '', found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name)
    if (entry.isDirectory()) await filesUnder(directory, name, found)
    else if (entry.isFile()) found.push(name)
    else throw new Error('Invalid preview catalogue asset')
    if (found.length > 2_000) throw new Error('Too many preview catalogue assets')
  }
  return found
}

export async function verifyPreviewCatalogueAssets(directory: string) {
  const lock = await readPreviewCatalogueLock(directory)
  const manifestBytes = await regularFile(path.join(directory, 'catalogue-manifest.json'), MAX_MANIFEST_BYTES)
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as Record<string, unknown>
  if (
    !manifest ||
    manifest.format !== 'praetorium.worker-catalogue.v2' ||
    manifest.snapshotId !== lock.pointer.id ||
    typeof manifest.entries !== 'object' ||
    !manifest.entries ||
    Array.isArray(manifest.entries)
  ) {
    throw new Error('Invalid preview catalogue snapshot or manifest')
  }
  const entries = Object.entries(manifest.entries)
  if (entries.length < 1 || entries.length > 2_000) throw new Error('Invalid preview catalogue entry count')
  let total = 0
  for (const [name, value] of entries) {
    if (!ASSET_PATH.test(name) || name.length > 256) throw new Error('Invalid preview catalogue asset path')
    const entry = value as { bytes?: unknown; sha256?: unknown } | null
    if (
      !entry ||
      typeof entry.bytes !== 'number' ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > MAX_ASSET_BYTES ||
      typeof entry.sha256 !== 'string' ||
      !HASH.test(entry.sha256)
    ) {
      throw new Error('Invalid preview catalogue entry')
    }
    total += entry.bytes
    if (total > MAX_TOTAL_BYTES) throw new Error('Preview catalogue is too large')
  }
  const manifestSha256 = sha256(manifestBytes)
  const prefix = path.posix.join('snapshots', lock.pointer.id, manifestSha256)
  const assetRoot = path.join(directory, 'assets', '_catalogue')
  const expected = new Set([path.posix.join(prefix, 'manifest.json')])
  for (const [name, value] of entries) {
    const entry = value as { bytes: number; sha256: string }
    const relative = path.posix.join(prefix, name)
    expected.add(relative)
    const bytes = await regularFile(path.join(assetRoot, relative), entry.bytes)
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`Preview catalogue ${name} checksum does not match`)
    }
  }
  const installedManifest = await regularFile(path.join(assetRoot, prefix, 'manifest.json'), MAX_MANIFEST_BYTES)
  if (sha256(installedManifest) !== manifestSha256) throw new Error('Preview catalogue manifest checksum does not match')
  const files = await filesUnder(assetRoot)
  if (files.length !== expected.size || files.some((name) => !expected.has(name))) {
    throw new Error('Preview catalogue has an unlisted asset')
  }
  return { snapshotId: lock.pointer.id, manifestSha256 }
}
