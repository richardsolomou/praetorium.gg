import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { parse } from 'yaml'

const release = parse(fs.readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')) as {
  jobs: { pending: { steps: { name?: string; run: string }[] } }
}
const gate = release.jobs.pending.steps.find(({ name }) => name === 'Require the full suite to pass on this commit')!.run

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-release-gate-'))
  fs.mkdirSync(path.join(root, 'bin'))
  // `gh` lists the full-suite run once one exists and starts one on `workflow run`; like the real
  // one, `run watch` reports a failed run only with `--exit-status`.
  fs.writeFileSync(
    path.join(root, 'bin/gh'),
    `#!/bin/sh
echo "$*" >> "$ROOT/calls"
case "$1 $2" in
  "run list") if [ -f "$ROOT/run" ]; then echo 7; fi ;;
  "workflow run") if [ "$STARTS" = true ]; then touch "$ROOT/run"; fi ;;
  "run watch") case "$*" in *--exit-status*) exit "$WATCH" ;; esac ;;
esac
`,
    { mode: 0o755 },
  )
  fs.writeFileSync(path.join(root, 'bin/sleep'), '#!/bin/sh\n', { mode: 0o755 })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function check({ ran = false, starts = true, watch = 0 } = {}) {
  if (ran) fs.writeFileSync(path.join(root, 'run'), '')
  const result = spawnSync('bash', ['-c', gate], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
      ROOT: root,
      STARTS: String(starts),
      WATCH: String(watch),
      GITHUB_REPOSITORY: 'test/app',
      GITHUB_SHA: 'abc',
    },
  })
  const calls = fs.existsSync(path.join(root, 'calls')) ? fs.readFileSync(path.join(root, 'calls'), 'utf8') : ''
  return { status: result.status, started: calls.includes('workflow run'), watched: calls.includes('run watch 7') }
}

it('releases once the full suite on the commit passed', () => {
  expect(check({ ran: true })).toEqual({ status: 0, started: false, watched: true })
})

it('stops the release when the full suite on the commit failed', () => {
  expect(check({ ran: true, watch: 1 }).status).not.toBe(0)
})

it('runs the full suite and waits for it when none ran on the commit', () => {
  expect(check()).toEqual({ status: 0, started: true, watched: true })
})

it('stops the release when the full suite it started never runs on the commit', () => {
  expect(check({ starts: false })).toEqual({ status: 1, started: true, watched: false })
})
