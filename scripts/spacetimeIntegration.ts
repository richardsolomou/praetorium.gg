import { execFile, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { publishSpacetimeModule } from 'ras-stack/spacetime'
import { copyProductModule, localSpacetimeIdentity, reserveLocalPort, startLocalChild, stopLocalChildren } from './lib/localStack.ts'
import { assertSpacetimeCliVersion, spacetimeCli } from './lib/spacetimeCli.ts'
import { moduleEnvironment } from './lib/spacetimeEnvironment.ts'

type VitestReport = { testResults: { name: string; assertionResults: { status: string; fullName: string }[] }[] }

const database = 'praetorium-integration'
const abort = new AbortController()
const children: ChildProcess[] = []
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => abort.abort(new Error(`Stopped by ${signal}`)))

function start(command: string, args: string[], environment = process.env) {
  const child = startLocalChild(command, args, environment)
  children.push(child)
  return child
}

async function run(command: string, args: string[], environment = process.env) {
  abort.signal.throwIfAborted()
  const child = start(command, args, environment)
  const status = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
    abort.signal.addEventListener('abort', () => reject(abort.signal.reason as Error), { once: true })
  })
  if (status !== 0) throw new Error(`${command} ${args.join(' ')} exited with status ${status}`)
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    abort.signal.throwIfAborted()
    try {
      const response = await fetch(`${url}/v1/database/${database}`, { signal: AbortSignal.timeout(1_000) })
      if (response.status === 404) return
    } catch {
      // The server is still starting.
    }
    await delay(250)
  }
  throw new Error('SpacetimeDB did not start')
}

/** Every test file gated on a live server; a new one joins this lane by reading the same variables. */
async function gatedFiles() {
  const { stdout } = await promisify(execFile)('git', ['grep', '--untracked', '-l', 'SPACETIME_TEST_', '--', '*.integration.test.ts'])
  const files = stdout.split('\n').filter(Boolean)
  if (files.length === 0) throw new Error('No SpacetimeDB integration tests found')
  return files
}

/** Vitest passes a run whose every test skipped. */
function assertEveryTestPassed(report: VitestReport, files: string[], worktree: string) {
  const problems = files.flatMap((file) => {
    const result = report.testResults.find(({ name }) => name === path.join(worktree, file))
    if (!result?.assertionResults.length) return [`${file}: no tests ran`]
    return result.assertionResults
      .filter(({ status }) => status !== 'passed')
      .map(({ status, fullName }) => `${file}: ${status}: ${fullName}`)
  })
  if (problems.length > 0) throw new Error(`Expected every SpacetimeDB integration test to pass:\n${problems.join('\n')}`)
}

const worktree = await realpath(process.cwd())
const root = await mkdtemp(path.join(await realpath(tmpdir()), 'praetorium-spacetime-integration-'))
try {
  await assertSpacetimeCliVersion(abort.signal)
  const files = await gatedFiles()

  const moduleRoot = path.join(root, 'module')
  await copyProductModule(moduleRoot, worktree)
  await run(spacetimeCli, ['build', '-p', path.join(moduleRoot, 'spacetimedb')])

  const port = await reserveLocalPort()
  await port.release()
  const url = `http://127.0.0.1:${port.port}`
  const server = start(spacetimeCli, [
    'start',
    '--listen-addr',
    `127.0.0.1:${port.port}`,
    '--data-dir',
    path.join(root, 'data'),
    '--non-interactive',
  ])
  server.once('exit', (code, signal) => abort.abort(new Error(`SpacetimeDB exited unexpectedly (${code ?? signal})`)))
  await waitForServer(url)

  const owner = await localSpacetimeIdentity(url)
  const operator = await localSpacetimeIdentity(url)
  const issuerPort = await reserveLocalPort()
  await issuerPort.release()
  const issuer = `http://127.0.0.1:${issuerPort.port}`
  await publishSpacetimeModule({ url, database, token: owner.token }, await readFile(path.join(moduleRoot, 'spacetimedb/dist/bundle.js')), {
    environment: moduleEnvironment({ issuer: `${issuer}/api/auth`, audience: database, operator: operator.identity }),
    timeoutMs: 60_000,
  })

  const reportFile = path.join(root, 'report.json')
  await run(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.ts',
      // Files assert exact revisions of database-wide signals, which a file running beside them would move.
      '--no-file-parallelism',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${reportFile}`,
      ...files,
    ],
    {
      ...process.env,
      SPACETIME_TEST_URL: url,
      SPACETIME_TEST_DATABASE: database,
      SPACETIME_TEST_OPERATOR_TOKEN: operator.token,
      SPACETIME_TEST_AUDIENCE: database,
      SPACETIME_TEST_ISSUER: issuer,
    },
  )
  assertEveryTestPassed(JSON.parse(await readFile(reportFile, 'utf8')) as VitestReport, files, worktree)
} finally {
  await stopLocalChildren(children)
  await rm(root, { recursive: true, force: true })
}
