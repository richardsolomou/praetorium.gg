import { hash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { CATALOGUE_HISTORY_FILE } from '../../src/server/catalogueHistory'
import { catalogueCacheRoot } from './catalogueCache'
import { catalogueDataDirectory } from './catalogueFiles'
import { downloadArchive, storeHasArchive, storeUrl, uploadArchive } from './catalogueRuntimeDistribution'
import { writeReferenceBundle } from './offlineReferenceBundle'
import { errorText } from './errorText'

const STORE_PATH = 'catalogue/offline-reference/by-key'
const MANIFEST = 'offline-reference-version.json'
const ASSET = /^assets\/(?:reference|construction)-[0-9a-f]{64}\.bin$/
const MAX_BYTES = 64 * 1024 * 1024

export type ReferenceStore = {
  has: (key: string) => Promise<boolean>
  download: (key: string) => Promise<Uint8Array | null>
  upload: (key: string, archive: Uint8Array) => Promise<unknown>
}

const sharedStore: ReferenceStore = {
  has: (key) => storeHasArchive(key, storeUrl(STORE_PATH)),
  download: (key) => downloadArchive(key, storeUrl(STORE_PATH)),
  upload: (key, archive) => uploadArchive(STORE_PATH, key, archive),
}

/** The bundle reads what the compiled runtime reads, plus the snapshot's change history. */
export function referenceBundleKey(directory: string, runtimeKey: string) {
  const history = path.join(directory, CATALOGUE_HISTORY_FILE)
  return `${runtimeKey}-${hash('sha256', fs.existsSync(history) ? fs.readFileSync(history) : 'absent').slice(0, 16)}`
}

const manifestFiles = (manifest: Buffer) => {
  const { bundle, construction } = JSON.parse(manifest.toString('utf8')) as {
    bundle: string
    construction: { current: string; complete: string }
  }
  return [bundle, construction.current, construction.complete].map((file) => file.replace(/^\//, ''))
}

function pack(outDir: string) {
  const manifest = fs.readFileSync(path.join(outDir, MANIFEST))
  const files: Record<string, Uint8Array> = { [MANIFEST]: manifest }
  for (const file of manifestFiles(manifest)) files[file] = fs.readFileSync(path.join(outDir, file))
  return zipSync(files, { level: 0, mtime: new Date('2000-01-01T00:00:00Z') })
}

/** Writes the archive's files into `outDir` only when it holds exactly the manifest and the assets it names. */
function install(outDir: string, archive: Uint8Array) {
  let expanded = 0
  const entries = unzipSync(archive, {
    filter: (entry) => {
      expanded += entry.originalSize
      if (expanded > MAX_BYTES) throw new Error('Offline reference archive expands beyond its size limit')
      return true
    },
  })
  const manifest = entries[MANIFEST]
  if (!manifest) throw new Error('Offline reference archive has no manifest')
  const expected = new Set([MANIFEST, ...manifestFiles(Buffer.from(manifest))])
  if (
    Object.keys(entries).length !== expected.size ||
    Object.keys(entries).some((name) => !expected.has(name) || (name !== MANIFEST && !ASSET.test(name)))
  )
    throw new Error('Offline reference archive contains unexpected files')
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true })
  for (const [name, bytes] of Object.entries(entries)) fs.writeFileSync(path.join(outDir, name), bytes)
}

function tryInstall(outDir: string, archive: Uint8Array, origin: string) {
  try {
    install(outDir, archive)
    return true
  } catch (error) {
    console.error(`Offline reference from ${origin} not restored:`, errorText(error))
    return false
  }
}

/**
 * Writes the offline reference into `outDir` from the first of: this machine's cache, the shared
 * store, a fresh build. Building it compiles every faction's reference and costs well over a minute.
 */
export async function prepareReferenceBundle(
  outDir: string,
  key: string,
  directory = catalogueDataDirectory(),
  cacheRoot = catalogueCacheRoot('offline-reference'),
  build: (outDir: string, directory: string) => Promise<void> = writeReferenceBundle,
  store: ReferenceStore = sharedStore,
): Promise<'cached' | 'downloaded' | 'built'> {
  const cached = cacheRoot ? path.join(cacheRoot, `${key}.zip`) : null
  if (cached && fs.existsSync(cached) && tryInstall(outDir, fs.readFileSync(cached), 'this machine')) {
    if (!(await store.has(key))) await share(key, fs.readFileSync(cached), store)
    return 'cached'
  }
  const downloaded = await store.download(key)
  if (downloaded && tryInstall(outDir, downloaded, 'the store')) {
    if (cached) keep(cached, downloaded)
    return 'downloaded'
  }
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-offline-reference-'))
  try {
    fs.mkdirSync(path.join(staging, 'assets'))
    await build(staging, directory)
    const archive = pack(staging)
    install(outDir, archive)
    if (cached) keep(cached, archive)
    await share(key, archive, store)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  return 'built'
}

function keep(cached: string, archive: Uint8Array) {
  fs.mkdirSync(path.dirname(cached), { recursive: true })
  const staging = `${cached}.incoming-${process.pid}`
  fs.writeFileSync(staging, archive)
  fs.renameSync(staging, cached)
}

async function share(key: string, archive: Uint8Array, store: ReferenceStore) {
  try {
    await store.upload(key, archive)
  } catch (error) {
    console.error(`Offline reference ${key} was not shared:`, errorText(error))
  }
}
