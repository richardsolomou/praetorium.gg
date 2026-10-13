import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { afterEach, expect, it } from 'vitest'

const workflow = parse(fs.readFileSync(path.join(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8')) as {
  jobs: Record<string, { steps: { name?: string; run?: string }[] }>
}
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function verify(job: string, stored: string | null, fingerprintFails = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-browser-ci-'))
  directories.push(directory)
  const bin = path.join(directory, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'pnpm'), fingerprintFails ? '#!/bin/sh\nexit 1\n' : '#!/bin/sh\necho current-inputs\n', { mode: 0o755 })
  if (stored !== null) {
    fs.mkdirSync(path.join(directory, 'data-dev/e2e-build'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'data-dev/e2e-build/fingerprint'), stored)
  }
  const command = workflow.jobs[job]!.steps.find((step) => step.name === 'Verify the shared browser-test build')!.run!
  return spawnSync('bash', ['-c', command], { cwd: directory, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).status
}

it.each(['catalogue-smoke', 'e2e-shard'])('%s accepts a build matching the current inputs', (job) => {
  expect(verify(job, 'current-inputs')).toBe(0)
})

it.each(['catalogue-smoke', 'e2e-shard'])('%s rejects a build from different inputs', (job) => {
  expect(verify(job, 'old-inputs')).not.toBe(0)
})

it.each(['catalogue-smoke', 'e2e-shard'])('%s rejects a missing build', (job) => {
  expect(verify(job, null)).not.toBe(0)
})

it.each(['catalogue-smoke', 'e2e-shard'])('%s stops when input fingerprinting fails', (job) => {
  expect(verify(job, null, true)).not.toBe(0)
})
