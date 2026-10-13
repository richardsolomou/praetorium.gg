import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { browserTestBuildEnvironment, ensureBrowserTestBuild } from './lib/browserTestBuild.ts'

const execute = promisify(execFile)
const worktree = await realpath(process.cwd())
const catalogue = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
// The build resolves modules from beside its output, as a test stack's does from its own root.
const root = path.join('/tmp', `praetorium-e2e-build-${randomUUID()}`)
const output = path.join(root, 'build')
const environment = { ...browserTestBuildEnvironment(process.env), LOCAL_BUILD_DIR: output, CATALOGUE_DIR: catalogue }
try {
  await mkdir(root)
  await symlink(path.join(worktree, 'node_modules'), path.join(root, 'node_modules'), 'dir')
  const { fingerprint, cached } = await ensureBrowserTestBuild(
    worktree,
    catalogue,
    environment,
    output,
    path.join(worktree, 'data-dev/e2e-build'),
    async () => {
      const started = performance.now()
      await execute('pnpm', ['build'], { cwd: worktree, env: environment, maxBuffer: 64_000_000 })
      console.error(`Browser-test build completed in ${Math.round(performance.now() - started)}ms`)
    },
  )
  console.log(`${cached ? 'Restored' : 'Built'} the browser-test build ${fingerprint} into data-dev/e2e-build`)
} finally {
  await rm(root, { recursive: true, force: true })
}
