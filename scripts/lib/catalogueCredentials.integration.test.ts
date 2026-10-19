import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadCatalogueCredentials } from './catalogueCredentials'

let root: string
let main: string
let worktree: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-credentials-'))
  main = path.join(root, 'main')
  worktree = path.join(root, 'worktree')
  fs.mkdirSync(main)
  execFileSync('git', ['init', '--quiet', main])
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'fixture',
    ],
    { cwd: main },
  )
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', worktree], { cwd: main })
  for (const name of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'LOCAL_DATA_DIR']) vi.stubEnv(name, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(root, { recursive: true, force: true })
})

it('reads the main checkout credentials from a linked worktree', () => {
  fs.writeFileSync(
    path.join(main, '.env.local'),
    'R2_ACCOUNT_ID=account\nR2_ACCESS_KEY_ID=key\nR2_SECRET_ACCESS_KEY="secret#with$symbols"\nLOCAL_DATA_DIR=production\n',
  )

  loadCatalogueCredentials(worktree)

  expect([process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY, process.env.LOCAL_DATA_DIR]).toEqual([
    'account',
    'key',
    'secret#with$symbols',
    undefined,
  ])
})

it('prefers the environment, then worktree local settings, then worktree defaults', () => {
  vi.stubEnv('R2_ACCOUNT_ID', 'environment')
  fs.writeFileSync(path.join(worktree, '.env.local'), 'R2_ACCOUNT_ID=local\nR2_ACCESS_KEY_ID=local\n')
  fs.writeFileSync(path.join(worktree, '.env'), 'R2_ACCESS_KEY_ID=default\nR2_SECRET_ACCESS_KEY=default\n')
  fs.writeFileSync(path.join(main, '.env.local'), 'R2_ACCOUNT_ID=main\nR2_ACCESS_KEY_ID=main\nR2_SECRET_ACCESS_KEY=main\n')

  loadCatalogueCredentials(worktree)

  expect([process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY]).toEqual([
    'environment',
    'local',
    'default',
  ])
})

it('prefers the main checkout local settings over its defaults', () => {
  fs.writeFileSync(path.join(main, '.env.local'), 'R2_ACCESS_KEY_ID=local\n')
  fs.writeFileSync(path.join(main, '.env'), 'R2_ACCOUNT_ID=default\nR2_ACCESS_KEY_ID=default\nR2_SECRET_ACCESS_KEY=default\n')

  loadCatalogueCredentials(worktree)

  expect([process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY]).toEqual([
    'default',
    'local',
    'default',
  ])
})

it('leaves credentials absent when no checkout has configured them', () => {
  loadCatalogueCredentials(worktree)

  expect([process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY]).toEqual([
    undefined,
    undefined,
    undefined,
  ])
})

it('loads local credentials in a source archive without Git metadata', () => {
  fs.writeFileSync(path.join(root, '.env.local'), 'R2_ACCESS_KEY_ID=archive\n')

  loadCatalogueCredentials(root)

  expect(process.env.R2_ACCESS_KEY_ID).toBe('archive')
})
