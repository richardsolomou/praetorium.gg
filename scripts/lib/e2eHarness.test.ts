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
    JSON.stringify({
      scripts: {
        prepare: 'pnpm build-stack && tsx scripts/seed.ts',
        'build-stack': 'tsx scripts/buildStack.ts',
        lint: 'tsx scripts/lint.ts',
      },
    }),
  )
  write(
    '.github/workflows/ci.yml',
    'jobs:\n  changes:\n    uses: ./.github/workflows/scope.yml\n  browser-build:\n    steps:\n      - run: pnpm prepare\n  e2e-shard:\n    steps:\n      - uses: ./.github/actions/stack\n  static:\n    steps:\n      - run: pnpm lint\n',
  )
  write('.github/workflows/scope.yml', 'jobs:\n  scope:\n    steps:\n      - run: node scripts/scope.ts\n')
  write('scripts/scope.ts', 'export {}\n')
  write('.github/actions/stack/action.yml', 'runs:\n  steps:\n    - run: echo\n')
  write('playwright.config.ts', "import { start } from './scripts/lib/stack.ts'\nstart()\n")
  write('scripts/lib/stack.ts', "export const start = () => ['node', 'scripts/server.ts']\n")
  write('scripts/server.ts', "import '@/server/app.ts'\n")
  write('src/server/app.ts', 'export {}\n')
  write('scripts/buildStack.ts', "export const worker = new URL(path.join(import.meta.dirname, 'buildWorker.ts'))\n")
  write('scripts/buildWorker.ts', 'export {}\n')
  write('scripts/lint.ts', 'export {}\n')
  write('scripts/deploy.ts', 'export {}\n')
  write('scripts/seed.ts', "import './lib/seedData.ts'\nimport '@/core/seeded.ts'\nimport '@/server/app.ts'\n")
  write('scripts/lib/seedData.ts', 'export {}\n')
  write('src/core/seeded.ts', 'export {}\n')
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it('follows imports, named scripts, sibling workers and chained package scripts from the browser jobs', async () => {
  expect(await harnessFiles(root, [])).toEqual([
    '.github/actions/stack/action.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/scope.yml',
    'playwright.config.ts',
    'scripts/buildStack.ts',
    'scripts/buildWorker.ts',
    'scripts/lib/seedData.ts',
    'scripts/lib/stack.ts',
    'scripts/scope.ts',
    'scripts/seed.ts',
    'scripts/server.ts',
    'src/core/seeded.ts',
    'src/server/app.ts',
  ])
})

it('leaves out application source only an accounted module reaches, keeping its other files', async () => {
  const files = await harnessFiles(root, ['scripts/seed.ts'])
  expect(
    ['scripts/seed.ts', 'scripts/lib/seedData.ts', 'src/core/seeded.ts', 'src/server/app.ts'].map((file) => files.includes(file)),
  ).toEqual([true, true, false, true])
})

it('refuses a workflow without the jobs it reads', async () => {
  write('.github/workflows/ci.yml', 'jobs:\n  static:\n    steps: []\n')
  await expect(harnessFiles(root)).rejects.toThrow('has no changes job')
})

it('fails on an import it cannot resolve rather than cutting the graph short', async () => {
  write('scripts/server.ts', "import './missing.ts'\n")
  await expect(harnessFiles(root)).rejects.toThrow()
})
