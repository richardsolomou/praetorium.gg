import { execFile, type ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { childSucceeded, startLocalChild, stopLocalChildren } from './lib/localStack.ts'
import { startThrowawaySpacetime } from './lib/throwawaySpacetime.ts'

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
  await childSucceeded(start(command, args, environment), abort.signal)
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
  const files = await gatedFiles()
  const { url, operatorToken, issuer } = await startThrowawaySpacetime({
    root,
    worktree,
    database,
    launch: (command, args) => start(command, args),
    abort,
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
      SPACETIME_TEST_OPERATOR_TOKEN: operatorToken,
      SPACETIME_TEST_AUDIENCE: database,
      SPACETIME_TEST_ISSUER: issuer,
    },
  )
  assertEveryTestPassed(JSON.parse(await readFile(reportFile, 'utf8')) as VitestReport, files, worktree)
} finally {
  await stopLocalChildren(children)
  await rm(root, { recursive: true, force: true })
}
