import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
const script = path.resolve('scripts/check-mobile-delivery-revision.sh')

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function git(repository: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
}

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-mobile-delivery-'))
  const remote = path.join(root, 'remote.git')
  const working = path.join(root, 'working')
  roots.push(root)

  fs.mkdirSync(working)
  execFileSync('git', ['init', '--bare', remote])
  git(working, 'init', '-b', 'main')
  git(working, 'config', 'user.email', 'test@example.com')
  git(working, 'config', 'user.name', 'Test')
  git(working, 'remote', 'add', 'origin', remote)
  fs.mkdirSync(path.join(working, 'mobile'))
  fs.writeFileSync(path.join(working, 'mobile', 'app.txt'), 'first\n')
  git(working, 'add', 'mobile/app.txt')
  git(working, 'commit', '-m', 'feat: first mobile revision')
  git(working, 'push', '-u', 'origin', 'main')

  return { root, working, deliverySha: git(working, 'rev-parse', 'HEAD') }
}

function current(working: string, deliverySha: string) {
  const output = path.join(working, 'output')
  execFileSync('sh', [script, deliverySha, output], { cwd: working })
  return fs.readFileSync(output, 'utf8').trim()
}

it('keeps a delivery current after a later unrelated push', () => {
  const { working, deliverySha } = repository()
  fs.writeFileSync(path.join(working, 'README.md'), 'later\n')
  git(working, 'add', 'README.md')
  git(working, 'commit', '-m', 'docs: update readme')
  git(working, 'push', 'origin', 'main')

  expect(current(working, deliverySha)).toBe('current=true')
})

it('skips a delivery superseded by a later mobile push', () => {
  const { working, deliverySha } = repository()
  fs.writeFileSync(path.join(working, 'mobile', 'app.txt'), 'later\n')
  git(working, 'add', 'mobile/app.txt')
  git(working, 'commit', '-m', 'feat: later mobile revision')
  git(working, 'push', 'origin', 'main')

  expect(current(working, deliverySha)).toBe('current=false')
})

it('does not let an automated release commit suppress a delivery', () => {
  const { working, deliverySha } = repository()
  fs.writeFileSync(path.join(working, 'package.json'), '{"version":"1.0.0"}\n')
  git(working, 'add', 'package.json')
  git(working, 'commit', '-m', 'chore: release v1.0.0 [skip ci]')
  git(working, 'push', 'origin', 'main')

  expect(current(working, deliverySha)).toBe('current=true')
})

it('honours an explicit delivery skip on the triggering revision', () => {
  const { working } = repository()
  fs.writeFileSync(path.join(working, 'mobile', 'app.txt'), 'skip\n')
  git(working, 'add', 'mobile/app.txt')
  git(working, 'commit', '-m', 'chore: skip delivery [no eas]')
  git(working, 'push', 'origin', 'main')

  expect(current(working, git(working, 'rev-parse', 'HEAD'))).toBe('current=false')
})
