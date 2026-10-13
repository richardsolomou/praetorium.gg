import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { abandonedTestStacks } from './testStacks'

let root: string
let worktree: string
let other: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-stacks-'))
  worktree = path.join(root, 'mine')
  other = path.join(root, 'theirs')
  for (const directory of [worktree, other]) fs.mkdirSync(path.join(directory, 'node_modules'), { recursive: true })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function stack(name: string, owner?: string) {
  const directory = path.join(root, name)
  fs.mkdirSync(directory)
  if (owner) fs.symlinkSync(path.join(owner, 'node_modules'), path.join(directory, 'node_modules'))
  return directory
}

it('names the stacks this worktree started and the ones whose worktree is gone', () => {
  const mine = stack('praetorium-e2e-1111', worktree)
  const native = stack('praetorium-native-auth-ios-2222', worktree)
  stack('praetorium-e2e-3333', other)
  const orphan = stack('praetorium-e2e-4444', path.join(root, 'deleted'))
  const unlinked = stack('praetorium-e2e-5555')
  fs.mkdirSync(path.join(root, 'praetorium-dev-6666'))
  expect(abandonedTestStacks(worktree, root).toSorted()).toEqual([mine, native, orphan, unlinked].toSorted())
})
