import { execFile } from 'node:child_process'
import { createHash, hash, randomUUID } from 'node:crypto'
import { access, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { testFile, treeFingerprint } from './compilerSources.ts'
import { publishDirectory } from './publishDirectory.ts'

const execute = promisify(execFile)
const inputs = [
  'src',
  'scripts',
  'public',
  'catalogue.json',
  'spacetimedb',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'ras.config.ts',
  'tsconfig.json',
  'vite.config.ts',
  'vite.seed.config.ts',
]
const environmentFiles = ['.env', '.env.local', '.env.production', '.env.production.local']

export function browserTestBuildEnvironment(environment: NodeJS.ProcessEnv) {
  return {
    ...environment,
    NODE_ENV: 'production',
    NITRO_PRESET: 'node-server',
    LOCAL_TEST_MODE: 'true',
    PRAETORIUM_LOCAL_DEV: 'true',
    VITE_POSTHOG_PROJECT_TOKEN: '',
    VITE_POSTHOG_HOST: '',
    POSTHOG_UPLOAD_SOURCEMAPS: 'false',
  }
}

export async function browserTestBuildFingerprint(worktree: string, catalogue: string, environment: NodeJS.ProcessEnv) {
  const snapshotFile = await readFile(path.join(catalogue, '.snapshot.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  let catalogueIdentity: string
  if (snapshotFile !== null) {
    const snapshot = JSON.parse(snapshotFile) as { id?: string }
    const manifest = await readFile(path.join(catalogue, '.snapshot-manifest.json'))
    catalogueIdentity = hash('sha256', manifest)
    if (snapshot.id !== catalogueIdentity) throw new Error('Browser tests require a verified catalogue snapshot manifest')
  } else {
    catalogueIdentity = treeFingerprint(catalogue, ['.'])
  }
  const { stdout } = await execute('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...inputs], {
    cwd: worktree,
    maxBuffer: 8_000_000,
  })
  const files = [...new Set([...stdout.split('\0').filter(Boolean), ...environmentFiles])].filter((file) => !testFile.test(file)).sort()
  const hasher = createHash('sha256').update(
    JSON.stringify([
      process.version,
      process.platform,
      process.arch,
      catalogueIdentity,
      environment.CATALOGUE_RUNTIME_FETCH === 'true',
      Object.entries(browserTestBuildEnvironment(environment))
        .filter(([key]) => key.startsWith('VITE_'))
        .sort(([left], [right]) => left.localeCompare(right)),
    ]),
  )
  for (const file of files) {
    hasher.update(file).update('\0')
    try {
      const content = await readFile(path.join(worktree, file))
      hasher.update(String(content.length)).update('\0').update(content)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      hasher.update('missing')
    }
    hasher.update('\0')
  }
  return hasher.digest('hex')
}

export async function restoreBrowserTestBuild(cache: string, fingerprint: string, output: string, runtimeFetch = false) {
  try {
    const before = await stat(cache, { bigint: true })
    if ((await readFile(path.join(cache, 'fingerprint'), 'utf8')) !== fingerprint) return false
    await mkdir(output, { recursive: true })
    for (const directory of ['server', 'public'])
      await cp(path.join(cache, directory), path.join(output, directory), { recursive: true, verbatimSymlinks: true })
    for (const file of [
      'server/index.mjs',
      'server/seed-preview.mjs',
      'public/offline-app-version.json',
      ...(runtimeFetch ? ['server/catalogue-refresh.mjs', 'server/catalogue-compiler.json'] : ['public/offline-reference-version.json']),
    ])
      await access(path.join(output, file))
    const after = await stat(cache, { bigint: true })
    if (
      before.ino === after.ino &&
      before.birthtimeNs === after.birthtimeNs &&
      (await readFile(path.join(cache, 'fingerprint'), 'utf8')) === fingerprint
    )
      return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await rm(output, { recursive: true, force: true })
  return false
}

export async function saveBrowserTestBuild(cache: string, fingerprint: string, output: string) {
  const temporary = `${cache}-${randomUUID()}`
  try {
    await mkdir(temporary, { recursive: true })
    for (const directory of ['server', 'public'])
      await cp(path.join(output, directory), path.join(temporary, directory), { recursive: true, verbatimSymlinks: true })
    await writeFile(path.join(temporary, 'fingerprint'), fingerprint)
    publishDirectory(temporary, cache)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

/**
 * Leaves a compiled browser-test build at `output` for the current inputs: restored from `cache`
 * when its fingerprint matches, otherwise built and saved there for the next stack.
 */
export async function ensureBrowserTestBuild(
  worktree: string,
  catalogue: string,
  environment: NodeJS.ProcessEnv,
  output: string,
  cache: string,
  build: () => Promise<void>,
) {
  const fingerprint = await browserTestBuildFingerprint(worktree, catalogue, environment)
  const cached =
    environment.LOCAL_BUILD_CACHE !== 'off' &&
    (await restoreBrowserTestBuild(cache, fingerprint, output, environment.CATALOGUE_RUNTIME_FETCH === 'true'))
  if (!cached) await build()
  if ((await browserTestBuildFingerprint(worktree, catalogue, environment)) !== fingerprint)
    throw new Error('Browser-test build inputs changed during the build; run it again')
  if (!cached && environment.LOCAL_BUILD_CACHE !== 'off') await saveBrowserTestBuild(cache, fingerprint, output)
  return { fingerprint, cached }
}
