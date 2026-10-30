import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { planIosDelivery } from './iosDeliveryPlan'

let root: string
let base: string

function commit(content: string) {
  writeFileSync(path.join(root, 'change'), content)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('add', 'change')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture')
  return git('rev-parse', 'HEAD')
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'praetorium-ios-plan-'))
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  base = commit('base')
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', base], { cwd: root })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const payload = { runtimeVersion: 'runtime-a', appVersion: '1.0.0', inputFingerprint: 'inputs-a' }

test('builds when no native binary has been recorded', () => {
  expect(planIosDelivery(root, base, payload, null, null, false)).toEqual({ build: true, update: true })
})

test('publishes an OTA update when JavaScript changed within the installed runtime', () => {
  const revision = commit('new JavaScript')
  expect(
    planIosDelivery(root, revision, { ...payload, inputFingerprint: 'inputs-b' }, { sha: base, payload }, { sha: base, payload }, false),
  ).toEqual({ build: false, update: true })
})

test('builds when the native runtime changes', () => {
  expect(planIosDelivery(root, base, { ...payload, runtimeVersion: 'runtime-b' }, { sha: base, payload }, null, false).build).toBe(true)
})

test('builds when the public app version changes despite an unchanged native runtime', () => {
  expect(planIosDelivery(root, base, { ...payload, appVersion: '1.1.0' }, { sha: base, payload }, null, false).build).toBe(true)
})

test('skips an already delivered revision', () => {
  expect(planIosDelivery(root, base, payload, { sha: base, payload }, { sha: base, payload }, false)).toEqual({
    build: false,
    update: false,
  })
})

test('skips a later web-only revision with the same mobile inputs', () => {
  expect(planIosDelivery(root, commit('web-only change'), payload, { sha: base, payload }, { sha: base, payload }, false)).toEqual({
    build: false,
    update: false,
  })
})

test('retries OTA publication without rebuilding an uploaded binary', () => {
  const revision = commit('new native code')
  const current = { ...payload, inputFingerprint: 'inputs-b' }
  expect(planIosDelivery(root, revision, current, { sha: revision, payload: current }, { sha: base, payload }, false)).toEqual({
    build: false,
    update: true,
  })
})

test('an explicit manual build rebuilds an already delivered revision', () => {
  expect(planIosDelivery(root, base, payload, { sha: base, payload }, { sha: base, payload }, true).build).toBe(true)
})

test.each(['binary', 'update'] as const)('does not roll back a newer %s from an older queued delivery', (kind) => {
  const newer = { sha: commit('newer release'), payload }
  expect(planIosDelivery(root, base, payload, kind === 'binary' ? newer : null, kind === 'update' ? newer : null, false)).toEqual({
    build: false,
    update: false,
  })
})

test('rejects history that does not contain the delivered revision', () => {
  const delivered = commit('delivered')
  execFileSync('git', ['checkout', '--quiet', '--detach', base], { cwd: root })
  const revision = commit('divergent release')
  expect(() => planIosDelivery(root, revision, payload, { sha: delivered, payload }, null, false)).toThrow('does not contain')
})

function delivery(channel: string, kind: string, main = true, failApi = false) {
  const bin = path.join(root, 'test-bin')
  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const input = args.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify({ args, input }) + '\\n')
if (process.env.TEST_API_FAIL === 'true') process.exit(23)
process.stdout.write(JSON.stringify(input ? { id: 42 } : {}))
`,
    { mode: 0o755 },
  )
  const calls = path.join(root, 'api-calls')
  const result = spawnSync(
    process.execPath,
    [
      path.join(repository, 'node_modules/tsx/dist/cli.mjs'),
      path.join(repository, 'scripts/iosDeliveryPlan.ts'),
      ...(kind === 'plan' ? ['plan', channel] : ['record', channel, kind]),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GITHUB_REF: main ? 'refs/heads/main' : 'refs/heads/feature',
        GITHUB_REPOSITORY: 'test/app',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '123',
        IOS_RUNTIME_VERSION: payload.runtimeVersion,
        IOS_APP_VERSION: payload.appVersion,
        IOS_INPUT_FINGERPRINT: payload.inputFingerprint,
        TEST_CALLS: calls,
        TEST_API_FAIL: String(failApi),
      },
    },
  )
  return {
    status: result.status,
    error: result.stderr,
    calls: existsSync(calls)
      ? readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [],
  }
}

const repository = path.resolve(import.meta.dirname, '..')

test.each(['canary', 'stable'])('records the uploaded %s binary independently of OTA delivery', (channel) => {
  expect(delivery(channel, 'binary').calls[0]).toMatchObject({
    input: {
      ref: base,
      environment: `mobile-ios-${channel}-binary`,
      auto_merge: false,
      required_contexts: [],
      production_environment: channel === 'stable',
      payload,
    },
  })
})

test('records an OTA receipt without replacing the binary receipt', () => {
  expect(delivery('stable', 'update').calls[0].input.environment).toBe('mobile-ios-stable')
})

test('marks a recorded delivery successful', () => {
  expect(delivery('stable', 'binary').calls[1].args).toContain('state=success')
})

test('finishes successfully after recording a delivery', () => {
  expect(delivery('stable', 'binary').status).toBe(0)
})

test('allows a delivery revision from earlier main history', () => {
  const latest = commit('later main release')
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', latest], { cwd: root })
  execFileSync('git', ['checkout', '--quiet', '--detach', base], { cwd: root })
  expect(delivery('stable', 'binary').status).toBe(0)
})

test('stops before recording delivery when main history is unavailable', () => {
  execFileSync('git', ['update-ref', '-d', 'refs/remotes/origin/main'], { cwd: root })
  expect(delivery('stable', 'binary')).toMatchObject({
    status: 1,
    calls: [],
    error: expect.stringContaining('Cannot compare revisions'),
  })
})

test('stops if GitHub rejects a delivery receipt', () => {
  expect(delivery('stable', 'binary', true, true).status).not.toBe(0)
})

test('does not record feature-branch builds in production history', () => {
  expect(delivery('canary', 'binary', false)).toMatchObject({ status: 1, calls: [] })
})

test.each(['canary', 'stable'])('rejects an unmerged revision before planning a main %s delivery', (channel) => {
  commit('unmerged feature')
  expect(delivery(channel, 'plan')).toMatchObject({
    status: 1,
    calls: [],
    error: expect.stringContaining('not in origin/main'),
  })
})

test.each([
  ['canary', 'binary'],
  ['canary', 'update'],
  ['stable', 'binary'],
  ['stable', 'update'],
])('rejects an unmerged revision before recording a main %s %s receipt', (channel, kind) => {
  commit('unmerged feature')
  expect(delivery(channel, kind)).toMatchObject({
    status: 1,
    calls: [],
    error: expect.stringContaining('not in origin/main'),
  })
})
