import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { catalogueRuntimeFingerprint, readCatalogueRuntime, runtimeManifestSchema } from '../../src/server/catalogueRuntime'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { installPublishedRuntime } from './catalogueRuntimeDistribution'

type Prepare = (directory: string, output: string) => Promise<void>

const publishedOrCompiled: Prepare = async (directory, output) => {
  if (!(await installPublishedRuntime(directory, output))) writeCatalogueRuntime(directory, output)
}

/**
 * Prepares the runtime at `output`, reusing a cached copy keyed by the snapshot and compiler
 * fingerprint; compiling it from the snapshot costs minutes and every build and browser-test
 * stack on a machine needs the same one.
 */
export async function prepareCatalogueRuntime(
  directory: string,
  output: string,
  cacheRoot: string | null,
  prepare: Prepare = publishedOrCompiled,
): Promise<'cached' | 'prepared'> {
  const cached = cacheRoot ? path.join(cacheRoot, catalogueRuntimeFingerprint(directory)) : null
  if (cached && restoreRuntime(directory, cached, output)) return 'cached'
  fs.mkdirSync(path.dirname(output), { recursive: true })
  await prepare(directory, output)
  if (cached) storeRuntime(output, cached)
  return 'prepared'
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
    fs.rmSync(cached, { recursive: true, force: true })
    try {
      fs.renameSync(staging, cached)
    } catch (error) {
      // Another build may have stored the same runtime while this one was copying.
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}
