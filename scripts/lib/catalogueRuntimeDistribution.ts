import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import {
  catalogueRuntimeFingerprint,
  readCatalogueRuntime,
  runtimeManifestSchema,
  MAX_RUNTIME_FILE_BYTES,
} from '../../src/server/catalogueRuntime'
import { catalogueBaseUrl, catalogueLock, type SnapshotPointer } from '../../src/server/catalogueSnapshot'
import { catalogueReleaseUrl, fetchCatalogueArtifact } from '../../src/server/catalogueDistribution'

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const MAX_BYTES = 128 * 1024 * 1024

export function packCatalogueRuntime(directory: string, output: string, archive: string) {
  const manifest = runtimeManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8')))
  const runtime = readCatalogueRuntime(directory, output)
  const files: Record<string, Uint8Array> = { 'manifest.json': fs.readFileSync(path.join(output, 'manifest.json')) }
  for (const key of Object.keys(manifest.files)) {
    runtime.read(key as 'startup')
    files[`${key}.json`] = fs.readFileSync(path.join(output, `${key}.json`))
  }
  const bytes = zipSync(files, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') })
  if (bytes.length > MAX_BYTES) throw new Error('Catalogue runtime archive is too large')
  fs.writeFileSync(archive, bytes)
  return { fingerprint: manifest.fingerprint, archiveSha256: hash(bytes) }
}

export async function installPublishedRuntime(directory: string, output: string, pointer: SnapshotPointer = catalogueLock.pointer) {
  if (!pointer.runtime || pointer.runtime.fingerprint !== catalogueRuntimeFingerprint(directory)) return false
  const response = await fetchCatalogueArtifact(
    `${catalogueBaseUrl()}/runtime/${pointer.runtime.archiveSha256}.zip`,
    catalogueReleaseUrl(pointer.id, 'runtime.zip'),
  )
  if (!response.ok) throw new Error(`Catalogue runtime archive answered ${response.status}`)
  if (!response.body) throw new Error('Catalogue runtime archive has no body')
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > MAX_BYTES) throw new Error('Catalogue runtime archive is too large')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (hash(bytes) !== pointer.runtime.archiveSha256) throw new Error('Catalogue runtime archive checksum does not match')
  let expanded = 0
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      expanded += entry.originalSize
      if (entry.originalSize > MAX_RUNTIME_FILE_BYTES || expanded > MAX_BYTES)
        throw new Error('Catalogue runtime expands beyond its size limit')
      return true
    },
  })
  if (!entries['manifest.json'] || entries['manifest.json'].length > 16 * 1024) throw new Error('Catalogue runtime manifest is invalid')
  const manifest = runtimeManifestSchema.parse(JSON.parse(Buffer.from(entries['manifest.json']).toString('utf8')))
  const expected = new Set(['manifest.json', ...Object.keys(manifest.files).map((key) => `${key}.json`)])
  if (Object.keys(entries).length !== expected.size || Object.keys(entries).some((name) => !expected.has(name)))
    throw new Error('Catalogue runtime contains unexpected files')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const staging = fs.mkdtempSync(`${output}.incoming-`)
  try {
    for (const [name, value] of Object.entries(entries)) fs.writeFileSync(path.join(staging, name), value)
    const runtime = readCatalogueRuntime(directory, staging)
    for (const key of Object.keys(manifest.files)) runtime.read(key as 'startup')
    const previous = `${output}.previous-${randomUUID()}`
    if (fs.existsSync(output)) fs.renameSync(output, previous)
    try {
      fs.renameSync(staging, output)
    } catch (error) {
      if (fs.existsSync(previous)) fs.renameSync(previous, output)
      throw error
    }
    fs.rmSync(previous, { recursive: true, force: true })
    return true
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
