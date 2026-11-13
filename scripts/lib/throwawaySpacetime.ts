import type { ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { publishSpacetimeModule } from 'ras-stack/spacetime'
import { copyProductModule, localSpacetimeIdentity, reserveLocalPort } from './localStack.ts'
import { assertSpacetimeCliVersion, spacetimeCli } from './spacetimeCli.ts'
import { moduleEnvironment } from './spacetimeEnvironment.ts'

export async function exited(child: ChildProcess, signal: AbortSignal) {
  signal.throwIfAborted()
  const status = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
    signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true })
  })
  if (status !== 0) throw new Error(`${child.spawnargs.join(' ')} exited with status ${status}`)
}

async function waitForServer(url: string, database: string, signal: AbortSignal) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
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

/**
 * Builds the product module from a copy of `worktree` and publishes it to a new SpacetimeDB server whose data lives under
 * `root`. The server exiting early aborts `abort`; `launch` owns the children, so the caller stops them.
 */
export async function startThrowawaySpacetime(input: {
  root: string
  worktree: string
  database: string
  launch: (command: string, args: string[]) => ChildProcess
  abort: AbortController
}) {
  const { root, database, launch, abort } = input
  await assertSpacetimeCliVersion(abort.signal)
  const moduleRoot = path.join(root, 'module')
  await copyProductModule(moduleRoot, input.worktree)
  await exited(launch(spacetimeCli, ['build', '-p', path.join(moduleRoot, 'spacetimedb')]), abort.signal)

  const port = await reserveLocalPort()
  await port.release()
  const url = `http://127.0.0.1:${port.port}`
  const server = launch(spacetimeCli, [
    'start',
    '--listen-addr',
    `127.0.0.1:${port.port}`,
    '--data-dir',
    path.join(root, 'data'),
    '--non-interactive',
  ])
  server.once('exit', (code, signal) => abort.abort(new Error(`SpacetimeDB exited unexpectedly (${code ?? signal})`)))
  await waitForServer(url, database, abort.signal)

  const owner = await localSpacetimeIdentity(url)
  const operator = await localSpacetimeIdentity(url)
  const issuerPort = await reserveLocalPort()
  await issuerPort.release()
  const issuer = `http://127.0.0.1:${issuerPort.port}`
  await publishSpacetimeModule({ url, database, token: owner.token }, await readFile(path.join(moduleRoot, 'spacetimedb/dist/bundle.js')), {
    environment: moduleEnvironment({ issuer: `${issuer}/api/auth`, audience: database, operator: operator.identity }),
    timeoutMs: 60_000,
  })
  return { url, operatorToken: operator.token, issuer }
}
