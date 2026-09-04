import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
const script = path.resolve('scripts/report-catalogue-failure.sh')
const RUN_URL = 'https://github.com/owner/repo/actions/runs/1'

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

/** A `gh` that records how it was called and answers `issue list` with the open issues given. */
function withStubbedGh(openIssues: { number: number; title: string }[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-catalogue-failure-'))
  roots.push(root)
  const calls = path.join(root, 'calls.txt')
  const issues = path.join(root, 'issues.json')
  fs.writeFileSync(issues, JSON.stringify(openIssues))
  fs.writeFileSync(
    path.join(root, 'gh'),
    ['#!/usr/bin/env sh', 'echo "$@" >> "$GH_CALLS"', 'if [ "$1" = issue ] && [ "$2" = list ]; then cat "$GH_ISSUES"; fi', ''].join('\n'),
    { mode: 0o755 },
  )
  const run = (...args: string[]) =>
    execFileSync('sh', [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}${path.delimiter}${process.env.PATH}`, GH_CALLS: calls, GH_ISSUES: issues },
    })
  return { run, calls: () => (fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8') : '') }
}

it('opens an issue when publishing fails and none is open', () => {
  const gh = withStubbedGh([])
  gh.run(RUN_URL)
  expect(gh.calls()).toContain('issue create --title Catalogue snapshot publishing is failing')
})

it('comments on the open issue rather than opening a second one', () => {
  const gh = withStubbedGh([{ number: 77, title: 'Catalogue snapshot publishing is failing' }])
  gh.run(RUN_URL)
  expect(gh.calls()).toContain('issue comment 77')
})

it('does not open a second issue while one is already open', () => {
  const gh = withStubbedGh([{ number: 77, title: 'Catalogue snapshot publishing is failing' }])
  gh.run(RUN_URL)
  expect(gh.calls()).not.toContain('issue create')
})

it('ignores an unrelated open issue', () => {
  const gh = withStubbedGh([{ number: 12, title: 'Add iOS and Android apps' }])
  gh.run(RUN_URL)
  expect(gh.calls()).toContain('issue create --title Catalogue snapshot publishing is failing')
})

it('names the run it is reporting', () => {
  const gh = withStubbedGh([{ number: 77, title: 'Catalogue snapshot publishing is failing' }])
  gh.run(RUN_URL)
  expect(gh.calls()).toContain(RUN_URL)
})

it('refuses to report without a run to point at', () => {
  const gh = withStubbedGh([])
  expect(() => gh.run()).toThrow()
})
