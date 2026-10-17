import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { afterEach, expect, it } from 'vitest'

const action = parse(fs.readFileSync(path.join(import.meta.dirname, '../.github/actions/verify-browser-build/action.yml'), 'utf8')) as {
  runs: { steps: { run: string }[] }
}
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function verify(stored: string | null, fingerprintFails = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-browser-ci-'))
  directories.push(directory)
  const bin = path.join(directory, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'pnpm'), fingerprintFails ? '#!/bin/sh\nexit 1\n' : '#!/bin/sh\necho current-inputs\n', { mode: 0o755 })
  if (stored !== null) {
    fs.mkdirSync(path.join(directory, 'data-dev/e2e-build'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'data-dev/e2e-build/fingerprint'), stored)
  }
  const command = action.runs.steps[0]!.run
  return spawnSync('bash', ['-c', command], { cwd: directory, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).status
}

it('accepts a build matching the current inputs', () => {
  expect(verify('current-inputs')).toBe(0)
})

it('rejects a build from different inputs', () => {
  expect(verify('old-inputs')).not.toBe(0)
})

it('rejects a missing build', () => {
  expect(verify(null)).not.toBe(0)
})

it('stops when input fingerprinting fails', () => {
  expect(verify('', true)).not.toBe(0)
})
