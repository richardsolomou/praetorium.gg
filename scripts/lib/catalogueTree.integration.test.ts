import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { catalogueTree } from './catalogueTree'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-tree-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '--quiet')
  fs.mkdirSync(path.join(root, 'catalogue'))
  fs.writeFileSync(path.join(root, 'catalogue/sources.json'), '{}')
  fs.writeFileSync(path.join(root, 'catalogue.json'), '{"pointer":"first"}')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--quiet', '-m', 'data')
  return { root, git }
}

it('keeps the same revision when only the snapshot pointer changes', () => {
  const { root, git } = repository()
  const before = catalogueTree(root)
  fs.writeFileSync(path.join(root, 'catalogue.json'), '{"pointer":"second"}')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--quiet', '-am', 'pointer')
  expect(catalogueTree(root)).toBe(before)
})

it('changes the revision when catalogue data changes', () => {
  const { root, git } = repository()
  const before = catalogueTree(root)
  fs.writeFileSync(path.join(root, 'catalogue/sources.json'), '{"changed":true}')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--quiet', '-am', 'data')
  expect(catalogueTree(root)).not.toBe(before)
})

it('refuses uncommitted catalogue data', () => {
  const { root } = repository()
  fs.writeFileSync(path.join(root, 'catalogue/sources.json'), '{"changed":true}')
  expect(() => catalogueTree(root)).toThrow('commit catalogue/ before packing')
})
