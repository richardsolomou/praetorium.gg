import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { catalogueRuntimeFingerprint, readCatalogueRuntime, runtimeManifestSchema } from '../../src/server/catalogueRuntime'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { publishDirectory } from './publishDirectory'
import { downloadRuntime, packCatalogueRuntime, storeHasArchive, uploadRuntime } from './catalogueRuntimeDistribution'
import { errorText } from './errorText'

type Compile = (directory: string, output: string) => Promise<void> | void
export type RuntimeStore = {
  has: (key: string) => Promise<boolean>
  download: (directory: string, output: string, key: string) => Promise<boolean>
  upload: (key: string, archive: Uint8Array) => Promise<unknown>
}

const sharedStore: RuntimeStore = { has: storeHasArchive, download: downloadRuntime, upload: uploadRuntime }
/** `compiler` is `compilerFingerprint()`, computed by the build and handed to the production worker. */
export function runtimeCacheKey(directory: string, compiler: string) {
  return `${catalogueRuntimeFingerprint(directory)}-${compiler.slice(0, 16)}`
}

/**
 * Prepares the runtime at `output` from the first of: this machine's cache, the shared store, a
 * compile. A compile costs minutes and the result is the same for everyone with the same key, so
 * it is cached here and uploaded for every other build, deployment and worktree.
 */
export async function prepareCatalogueRuntime(
  directory: string,
  output: string,
  cacheRoot: string | null,
  key: string,
  compile: Compile = writeCatalogueRuntime,
  store: RuntimeStore = sharedStore,
): Promise<'cached' | 'downloaded' | 'compiled'> {
  const cached = cacheRoot ? path.join(cacheRoot, key) : null
  if (cached && restoreRuntime(directory, cached, output)) {
    // A build without write access usually compiles first and leaves its result in this cache.
    if (!(await store.has(key))) await share(directory, output, key, store)
    return 'cached'
  }
  fs.mkdirSync(path.dirname(output), { recursive: true })
  if (await store.download(directory, output, key)) {
    if (cached) storeRuntime(output, cached)
    return 'downloaded'
  }
  await compile(directory, output)
  if (cached) storeRuntime(output, cached)
  await share(directory, output, key, store)
  return 'compiled'
}

async function share(directory: string, output: string, key: string, store: RuntimeStore) {
  const archive = path.join(os.tmpdir(), `praetorium-runtime-${randomUUID()}.zip`)
  try {
    packCatalogueRuntime(directory, output, archive)
    await store.upload(key, fs.readFileSync(archive))
  } catch (error) {
    console.error(`Catalogue runtime ${key} was not shared:`, errorText(error))
  } finally {
    fs.rmSync(archive, { force: true })
  }
}

function verifyRuntime(directory: string, location: string) {
  const manifest = runtimeManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(location, 'manifest.json'), 'utf8')))
  const runtime = readCatalogueRuntime(directory, location)
  for (const key of Object.keys(manifest.files)) runtime.read(key as 'startup')
}

function restoreRuntime(directory: string, cached: string, output: string) {
  if (!fs.existsSync(path.join(cached, 'manifest.json'))) return false
  try {
    verifyRuntime(directory, cached)
  } catch {
    fs.rmSync(cached, { recursive: true, force: true })
    return false
  }
  fs.rmSync(output, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.cpSync(cached, output, { recursive: true })
  return true
}

function storeRuntime(output: string, cached: string) {
  fs.mkdirSync(path.dirname(cached), { recursive: true })
  const staging = `${cached}.incoming-${randomUUID()}`
  try {
    fs.cpSync(output, staging, { recursive: true })
    publishDirectory(staging, cached)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
