import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { port } from './stackEnv'

/**
 * Takes the stack down after the suite.
 *
 * The stack script cannot be relied on to do it: Playwright kills its web server
 * without leaving the shell long enough to run an exit trap, so a run would
 * otherwise leave a container holding the port and refuse the next one. This runs
 * inside Playwright itself, which is still alive here.
 */
export default function teardown() {
  execFileSync('sh', [path.join(import.meta.dirname, 'stack-down.sh'), String(port)], { stdio: 'inherit' })
}
