import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { parse, stringify } from 'yaml'
import { iosDeliveryChanged, iosDeliveryFingerprint } from './iosDelivery'
import { planIosDelivery } from './iosDeliveryPlan'

let root: string
let base: string
const initialLock = {
  lockfileVersion: '9.0',
  settings: { autoInstallPeers: true },
  importers: {
    '.': { dependencies: { zod: { specifier: '4.5.4', version: '4.5.4' }, web: { specifier: '1.0.0', version: '1.0.0' } } },
    mobile: { dependencies: { native: { specifier: '1.0.0', version: '1.0.0' } } },
  },
  packages: {
    'native@1.0.0': { resolution: { integrity: 'native' } },
    'storage@1.0.0': { resolution: { integrity: 'storage' } },
    'zod@4.5.4': { resolution: { integrity: 'zod' } },
    'web@1.0.0': { resolution: { integrity: 'web' } },
  },
  snapshots: {
    'native@1.0.0': { dependencies: { storage: '1.0.0' } },
    'storage@1.0.0': {},
    'zod@4.5.4': {},
    'web@1.0.0': {},
  },
}

const releaseWorkflow = parse(readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as {
  jobs: { 'after-release': { steps: { id?: string; name?: string; run?: string }[] } }
}
const checkCommand = releaseWorkflow.jobs['after-release'].steps.find((step) => step.id === 'ios')!.run!

function releaseCheck(delivered: string | null, runs: { status: string; display_title: string }[] = [], failApi = false) {
  file(
    'test-bin/gh',
    `#!/bin/sh\nif [ "$TEST_API_FAIL" = true ]; then exit 23; fi\ncase "$2" in\n  */deployments\\?*) printf '%s' "$TEST_DEPLOYMENTS" | jq -r "$4" ;;\n  */runs\\?*) printf '%s' "$TEST_RUNS" | jq -r "$4" ;;\n  *) exit 24 ;;\nesac\n`,
  )
  const tool = new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url).pathname
  const script = new URL('./iosDelivery.ts', import.meta.url).pathname
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  file('test-bin/pnpm', `#!/bin/sh\nshift 3\nexec ${quote(process.execPath)} ${quote(tool)} ${quote(script)} "$@"\n`)
  execFileSync('chmod', ['+x', 'test-bin/gh', 'test-bin/pnpm'], { cwd: root })
  const output = path.join(root, 'test-output')
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', checkCommand], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${root}/test-bin:${process.env.PATH}`,
      GITHUB_REPOSITORY: 'test/app',
      GITHUB_OUTPUT: output,
      TEST_DEPLOYMENTS: JSON.stringify(delivered ? [{ sha: delivered }] : []),
      TEST_RUNS: JSON.stringify({ workflow_runs: runs }),
      TEST_API_FAIL: String(failApi),
    },
  })
  return { status: result.status, output: existsSync(output) ? readFileSync(output, 'utf8') : '', error: result.stderr }
}

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function file(name: string, content: string) {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
  writeFileSync(path.join(root, name), content)
}

function commit() {
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture')
  return git('rev-parse', 'HEAD')
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'praetorium-ios-delivery-'))
  git('init', '--quiet')
  file('package.json', JSON.stringify({ name: 'web', version: '1.0.0', packageManager: 'pnpm@11.15.0', engines: { node: '24' } }))
  file('pnpm-lock.yaml', stringify(initialLock))
  file('pnpm-workspace.yaml', 'packages: [., mobile]\n')
  file('mobile/package.json', JSON.stringify({ name: '@praetorium/mobile', version: '1.0.0' }))
  file(
    'mobile/src/localStateStorage.ts',
    "import { parseLocalState } from '../../src/contracts/localState'\nexport const read = parseLocalState\n",
  )
  file('src/contracts/localState.ts', "import { z } from 'zod'\nexport const parseLocalState = z.string().parse\n")
  base = commit()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

test('skips iOS delivery when only web code changes', () => {
  file('src/routes/index.tsx', 'web change')
  expect(iosDeliveryChanged(root, base, commit())).toBe(false)
})

test.each(['EXPO_PUBLIC_POSTHOG_API_KEY', 'EXPO_PUBLIC_POSTHOG_HOST', 'EXPO_PUBLIC_APP_URL'])(
  'publishes an OTA update without rebuilding when %s changes',
  (name) => {
    const previous = {
      runtimeVersion: 'installed-runtime',
      appVersion: '1.0.0',
      inputFingerprint: iosDeliveryFingerprint(root, base, { [name]: 'previous-value' }),
    }
    const current = { ...previous, inputFingerprint: iosDeliveryFingerprint(root, base, { [name]: 'replacement-value' }) }
    const receipt = { sha: base, payload: previous }
    expect(planIosDelivery(root, base, current, receipt, receipt, false)).toEqual({ build: false, update: true })
  },
)

test('distinguishes an unset public variable from an empty value', () => {
  expect(iosDeliveryFingerprint(root, base, {})).not.toBe(iosDeliveryFingerprint(root, base, { EXPO_PUBLIC_APP_URL: '' }))
})

test('ignores private environment changes in the delivery fingerprint', () => {
  expect(iosDeliveryFingerprint(root, base, { EXPO_TOKEN: 'first-token' })).toBe(
    iosDeliveryFingerprint(root, base, { EXPO_TOKEN: 'replacement-token' }),
  )
})

test('keeps the delivery fingerprint stable when public variable order changes', () => {
  expect(iosDeliveryFingerprint(root, base, { EXPO_PUBLIC_APP_URL: 'app', EXPO_PUBLIC_POSTHOG_HOST: 'host' })).toBe(
    iosDeliveryFingerprint(root, base, { EXPO_PUBLIC_POSTHOG_HOST: 'host', EXPO_PUBLIC_APP_URL: 'app' }),
  )
})

test('skips web version, scripts, and dependency changes in the root manifest', () => {
  file(
    'package.json',
    JSON.stringify({
      version: '2.0.0',
      scripts: { build: 'vite build' },
      dependencies: { web: '2.0.0' },
      packageManager: 'pnpm@11.15.0',
      engines: { node: '24' },
    }),
  )
  expect(iosDeliveryChanged(root, base, commit())).toBe(false)
})

test('skips a web-only lockfile update even when the root importer and package resolutions change', () => {
  const lock = structuredClone(initialLock)
  lock.importers['.'].dependencies.web.version = '2.0.0'
  lock.packages['web@1.0.0'].resolution.integrity = 'replacement web bytes'
  file('pnpm-lock.yaml', stringify(lock))
  expect(iosDeliveryChanged(root, base, commit())).toBe(false)
})

test('reads the application lockfile after pnpm configuration dependencies', () => {
  file('pnpm-lock.yaml', `---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    configDependencies: {}\n---\n${stringify(initialLock)}`)
  expect(iosDeliveryChanged(root, base, commit())).toBe(false)
})

test('delivers native dependency changes after pnpm configuration dependencies', () => {
  const lock = structuredClone(initialLock)
  lock.packages['storage@1.0.0'].resolution.integrity = 'replacement native bytes'
  file('pnpm-lock.yaml', `---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    configDependencies: {}\n---\n${stringify(lock)}`)
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('skips dependency age exceptions and workspace comments', () => {
  file(
    'pnpm-workspace.yaml',
    'packages: [., mobile]\n# Reviewed web SDK update\nminimumReleaseAge: 10080\nminimumReleaseAgeExclude: [web@2.0.0]\n',
  )
  expect(iosDeliveryChanged(root, base, commit())).toBe(false)
})

test('delivers changes to workspace package extensions', () => {
  file('pnpm-workspace.yaml', 'packages: [., mobile]\npackageExtensions: {native: {dependencies: {storage: 1.0.0}}}\n')
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test.each(['mobile/src/localStateStorage.ts', 'src/contracts/localState.ts'])('delivers mobile JavaScript when %s changes', (name) => {
  file(name, `${readFileSync(path.join(root, name), 'utf8')}\nchanged native input`)
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('delivers shared code imported transitively by native storage', () => {
  file('src/contracts/localState.ts', "export { parseLocalState } from './storageValidation'\n")
  file('src/contracts/storageValidation.ts', 'export const parseLocalState = () => null\n')
  base = commit()
  file('src/contracts/storageValidation.ts', 'export const parseLocalState = () => true\n')
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test.each(["import type { State } from './webModel'", "export type { State } from './webModel'"])(
  'skips changes to a shared module referenced only by %s',
  (statement) => {
    file('src/contracts/localState.ts', `${statement}\nexport const parseLocalState = () => null\n`)
    file('src/contracts/webModel.ts', 'export type State = string\n')
    base = commit()
    file('src/contracts/webModel.ts', 'export type State = number\n')
    expect(iosDeliveryChanged(root, base, commit())).toBe(false)
  },
)

test('delivers when native storage is deleted', () => {
  rmSync(path.join(root, 'mobile/src/localStateStorage.ts'))
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('delivers when a native transitive dependency changes without changing the mobile importer', () => {
  const lock = structuredClone(initialLock)
  lock.packages['storage@1.0.0'].resolution.integrity = 'replacement native bytes'
  file('pnpm-lock.yaml', stringify(lock))
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('delivers when a root dependency used by shared native code changes', () => {
  const lock = structuredClone(initialLock)
  lock.packages['zod@4.5.4'].resolution.integrity = 'replacement shared bytes'
  file('pnpm-lock.yaml', stringify(lock))
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('delivers when the mobile importer changes', () => {
  const lock = structuredClone(initialLock)
  lock.importers.mobile.dependencies.native.specifier = '^1.0.0'
  file('pnpm-lock.yaml', stringify(lock))
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('includes a mobile version bump in the generated release commit', () => {
  file('src/routes/index.tsx', 'web update')
  commit()
  file('mobile/package.json', JSON.stringify({ version: '1.1.0' }))
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('delivers when there is no recorded iOS delivery', () => {
  expect(iosDeliveryChanged(root, '0'.repeat(40), base)).toBe(true)
})

test('skips another delivery when a pending build already includes the native change', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const pending = commit()
  file('src/routes/index.tsx', 'later web update')
  expect(iosDeliveryChanged(root, base, commit(), [pending])).toBe(false)
})

test('delivers when a pending build does not include a later native change', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const pending = commit()
  file('mobile/src/localStateStorage.ts', 'additional native storage change')
  expect(iosDeliveryChanged(root, base, commit(), [pending])).toBe(true)
})

test('keeps native changes eligible after a failed build and subsequent web-only pushes', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  commit()
  file('src/routes/index.tsx', 'later web update')
  expect(iosDeliveryChanged(root, base, commit())).toBe(true)
})

test('does not roll back a newer delivered native revision from an older release run', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const delivered = commit()
  expect(iosDeliveryChanged(root, delivered, base)).toBe(false)
})

test('does not queue an older native revision after a newer pending build', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const pending = commit()
  expect(iosDeliveryChanged(root, '0'.repeat(40), base, [pending])).toBe(false)
})

test('fails instead of silently skipping an unavailable base revision', () => {
  expect(() => iosDeliveryChanged(root, '1'.repeat(40), base)).toThrow()
})

test('fails instead of silently skipping an incomplete native dependency graph', () => {
  const lock = structuredClone(initialLock)
  delete (lock.snapshots as Record<string, unknown>)['storage@1.0.0']
  file('pnpm-lock.yaml', stringify(lock))
  expect(() => iosDeliveryChanged(root, base, commit())).toThrow('storage@1.0.0')
})

test('the release workflow skips delivery after a web-only update', () => {
  file('src/routes/index.tsx', 'web update')
  commit()
  expect(releaseCheck(base)).toMatchObject({ status: 0, output: 'changed=false\n' })
})

test('the release workflow delivers changed native storage', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  commit()
  expect(releaseCheck(base)).toMatchObject({ status: 0, output: 'changed=true\n' })
})

test('the release workflow establishes its first delivery baseline', () => {
  expect(releaseCheck(null)).toMatchObject({ status: 0, output: 'changed=true\n' })
})

test.each(['queued', 'in_progress'])('the release workflow skips inputs already in a %s native build', (status) => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const pending = commit()
  file('src/routes/index.tsx', 'later web update')
  commit()
  expect(releaseCheck(base, [{ status, display_title: `iOS delivery ${pending}` }])).toMatchObject({ status: 0, output: 'changed=false\n' })
})

test('the release workflow retries native changes after a completed failed delivery', () => {
  file('mobile/src/localStateStorage.ts', 'new native storage')
  const failed = commit()
  file('src/routes/index.tsx', 'later web update')
  commit()
  expect(releaseCheck(base, [{ status: 'completed', display_title: `iOS delivery ${failed}` }])).toMatchObject({
    status: 0,
    output: 'changed=true\n',
  })
})

test('the release workflow stops if GitHub delivery history cannot be read', () => {
  expect(releaseCheck(base, [], true)).toMatchObject({ status: 23, output: '' })
})

test('automatic releases dispatch delivery without forcing a native build', () => {
  file('test-bin/gh', '#!/bin/sh\nprintf "%s\\n" "$@"\n')
  execFileSync('chmod', ['+x', 'test-bin/gh'], { cwd: root })
  const command = releaseWorkflow.jobs['after-release'].steps.find((step) => step.name === 'Deliver changed iOS application')!.run!
  const args = execFileSync('bash', ['-euo', 'pipefail', '-c', command], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${root}/test-bin:${process.env.PATH}`, GITHUB_REPOSITORY: 'test/app', RELEASE_REVISION: base },
  })
    .trim()
    .split('\n')
  expect(args).toContain('force_build=false')
})
