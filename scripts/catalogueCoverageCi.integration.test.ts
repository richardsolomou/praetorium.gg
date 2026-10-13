import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'yaml'
import { afterEach, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const workflow = parse(fs.readFileSync(path.join(import.meta.dirname, '../.github/workflows/ci.yml'), 'utf8')) as {
  jobs: { coverage: { steps: { name?: string; run?: string }[] } }
}
const comparison = workflow.jobs.coverage.steps.find((step) => step.name === 'Compare snapshots')!.run!

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function compare(changed: boolean) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-coverage-ci-'))
  temporaryDirectories.push(root)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  git('init')
  fs.mkdirSync(path.join(root, 'catalogue'))
  const pin = path.join(root, 'catalogue/authoring.json')
  fs.writeFileSync(pin, JSON.stringify({ revision: 'a'.repeat(40) }))
  git('add', 'catalogue/authoring.json')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  if (changed) {
    fs.writeFileSync(pin, JSON.stringify({ revision: 'b'.repeat(40) }))
  }
  fs.writeFileSync(path.join(root, 'application.ts'), 'export {}')
  git('add', 'catalogue/authoring.json', 'application.ts')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'update application')
  for (const name of ['base-0', 'base-1', 'head-0', 'head-1']) fs.writeFileSync(path.join(root, `${name}.json`), '[]')
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 })
  execFileSync('bash', ['-c', comparison], {
    cwd: root,
    env: { ...process.env, BASE_SHA: base, HEAD_SHA: git('rev-parse', 'HEAD'), PATH: `${bin}:${process.env.PATH}` },
  })
  return fs.readFileSync(path.join(root, 'coverage.txt'), 'utf8').trim().split('\n')
}

it('uses the external coverage exceptions when adopting a catalogue authoring commit', () => {
  expect(compare(true)).toContain('.catalogue-authoring/catalogue/accepted-coverage-losses.json')
})

it('does not reuse catalogue exceptions on later application changes', () => {
  expect(compare(false)).not.toContain('--accept')
})
