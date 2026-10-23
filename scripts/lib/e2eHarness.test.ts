import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { harnessFiles } from './e2eHarness'

let root: string
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), text)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-e2e-harness-'))
  write(
    'package.json',
    JSON.stringify({ scripts: { prepare: 'pnpm build-stack', 'build-stack': 'tsx scripts/buildStack.ts', lint: 'tsx scripts/lint.ts' } }),
  )
  write(
    '.github/workflows/ci.yml',
    'jobs:\n  browser-build:\n    steps:\n      - run: pnpm prepare\n  e2e-shard:\n    steps:\n      - uses: ./.github/actions/stack\n  static:\n    steps:\n      - run: pnpm lint\n',
  )
  write('.github/actions/stack/action.yml', 'runs:\n  steps:\n    - run: echo\n')
  write('playwright.config.ts', "import { start } from './scripts/lib/stack.ts'\nstart()\n")
  write('scripts/lib/stack.ts', "export const start = () => ['node', 'scripts/server.ts']\n")
  write('scripts/server.ts', "import '../src/server/app.ts'\n")
  write('src/server/app.ts', 'export {}\n')
  write('scripts/buildStack.ts', "export const worker = new URL(path.join(import.meta.dirname, 'buildWorker.ts'))\n")
  write('scripts/buildWorker.ts', 'export {}\n')
  write('scripts/lint.ts', 'export {}\n')
  write('scripts/deploy.ts', 'export {}\n')
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('follows imports, named scripts, sibling workers and chained package scripts from the browser jobs', async () => {
  expect(await harnessFiles(root)).toEqual([
    '.github/actions/stack/action.yml',
    '.github/workflows/ci.yml',
    'playwright.config.ts',
    'scripts/buildStack.ts',
    'scripts/buildWorker.ts',
    'scripts/lib/stack.ts',
    'scripts/server.ts',
    'src/server/app.ts',
  ])
})

it('refuses a workflow without the browser jobs it reads', async () => {
  write('.github/workflows/ci.yml', 'jobs:\n  static:\n    steps: []\n')
  await expect(harnessFiles(root)).rejects.toThrow('has no browser-build job')
})
