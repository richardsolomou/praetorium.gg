import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { catalogueRuntimeFingerprint, readCatalogueRuntime, runtimeManifestSchema } from '../../src/server/catalogueRuntime'
import { writeCatalogueRuntime } from './catalogueRuntime'
import { installPublishedRuntime } from './catalogueRuntimeDistribution'

type Prepare = (directory: string, output: string) => Promise<void>

const publishedOrCompiled: Prepare = async (directory, output) => {
  if (!(await installPublishedRuntime(directory, output))) writeCatalogueRuntime(directory, output)
}

const compilerSources = ['src/contracts', 'src/core', 'src/server', 'src/shared', 'scripts/lib', 'scripts/compileCatalogueRuntime.ts']

/**
 * The published pack is keyed by the snapshot and the compiler version its authors bumped; a
 * local compile also depends on every compiler source as it is now, so a change that forgot the
 * bump still recompiles instead of restoring yesterday's output.
 */
export function compilerSourcesFingerprint(worktree = process.cwd()) {
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...compilerSources], {
    cwd: worktree,
    encoding: 'utf8',
    maxBuffer: 8_000_000,
  })
  const hash = createHash('sha256')
  for (const file of listed
    .split('\0')
    .filter((name) => name && !/\.(?:integration\.)?test\.[^.]+$/.test(name))
    .sort()) {
    hash.update(file).update('\0')
    try {
      hash.update(fs.readFileSync(path.join(worktree, file)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    hash.update('\0')
  }
  return hash.digest('hex')
}

export function runtimeCacheKey(directory: string, sources = compilerSourcesFingerprint()) {
  return `${catalogueRuntimeFingerprint(directory)}-${sources.slice(0, 16)}`
}

/**
 * Prepares the runtime at `output`, reusing a cached copy under `key`; compiling it from the
 * snapshot costs minutes and every build and browser-test stack on a machine needs the same one.
 */
export async function prepareCatalogueRuntime(
  directory: string,
  output: string,
  cacheRoot: string | null,
  prepare: Prepare = publishedOrCompiled,
  key = runtimeCacheKey(directory),
): Promise<'cached' | 'prepared'> {
  const cached = cacheRoot ? path.join(cacheRoot, key) : null
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
