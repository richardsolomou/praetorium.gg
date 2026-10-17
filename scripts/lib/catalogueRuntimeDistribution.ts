import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { readCatalogueRuntime, runtimeManifestSchema, MAX_RUNTIME_FILE_BYTES } from '../../src/server/catalogueRuntime'
import { fetchWithRetry } from '../../src/server/fetch'
import { DEFAULT_PUBLIC_ASSETS_BASE_URL } from '../../src/server/objectStorage'
import { replaceDirectory } from './replaceDirectory'
import { publicAssetsR2Client } from '../../src/server/r2Client'

const MAX_BYTES = 128 * 1024 * 1024
const STORE_PATH = 'catalogue/runtime/by-key'

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
  return { fingerprint: manifest.fingerprint, archiveSha256: createHash('sha256').update(bytes).digest('hex') }
}

/** Where compiled runtimes are shared by cache key; `off` keeps every build compiling for itself. */
export function runtimeStoreUrl(environment: NodeJS.ProcessEnv = process.env) {
  const value = environment.CATALOGUE_RUNTIME_STORE?.trim()
  if (value === 'off') return null
  return (value || `${DEFAULT_PUBLIC_ASSETS_BASE_URL}/${STORE_PATH}`).replace(/\/$/, '')
}

/** Unpacks an archive into `output` only once every file verifies against its manifest and the snapshot. */
export function installRuntimeArchive(directory: string, output: string, bytes: Uint8Array) {
  if (bytes.length > MAX_BYTES) throw new Error('Catalogue runtime archive is too large')
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
    replaceDirectory(staging, output)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

/** Whether the store already holds `key`; an unreachable store reads as holding it, so nothing retries uploads against it. */
export async function storeHasRuntime(key: string, store = runtimeStoreUrl()) {
  if (!store) return true
  try {
    const response = await fetchWithRetry(`${store}/${key}.zip`, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
    await response.body?.cancel()
    return response.status !== 404
  } catch {
    return true
  }
}

/** A missing, unreachable or unverifiable object is a cache miss, never a failed build. */
export async function downloadRuntime(directory: string, output: string, key: string, store = runtimeStoreUrl()) {
  if (!store) return false
  try {
    const response = await fetchWithRetry(`${store}/${key}.zip`, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return false
    }
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > MAX_BYTES) throw new Error('Catalogue runtime archive is too large')
      chunks.push(chunk)
    }
    installRuntimeArchive(directory, output, Buffer.concat(chunks))
    return true
  } catch (error) {
    console.error(`Catalogue runtime ${key} not restored from the store:`, error instanceof Error ? error.message : String(error))
    return false
  }
}

type Uploader = { fetch: (url: string, init: RequestInit) => Promise<Response>; base: string }

function configuredUploader(): Uploader | null {
  try {
    const client = publicAssetsR2Client()
    return client ? { fetch: (url, init) => client.client.fetch(url, init), base: client.base } : null
  } catch (error) {
    console.error('Catalogue runtime store is not writable here:', error instanceof Error ? error.message : String(error))
    return null
  }
}

/** Keys name their inputs, so an object is written once and never replaced. */
export async function uploadRuntime(key: string, archive: Uint8Array, uploader = configuredUploader()) {
  if (!uploader) return 'skipped' as const
  const body = new Uint8Array(archive.byteLength)
  body.set(archive)
  const response = await uploader.fetch(`${uploader.base}${STORE_PATH}/${key}.zip`, {
    method: 'PUT',
    body,
    headers: { 'content-type': 'application/zip', 'if-none-match': '*' },
    signal: AbortSignal.timeout(120_000),
  })
  if (response.status === 412) return 'exists' as const
  if (!response.ok) throw new Error(`Catalogue runtime upload failed with HTTP ${response.status}`)
  return 'uploaded' as const
}
