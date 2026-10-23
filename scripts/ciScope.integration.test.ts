import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { parse } from 'yaml'

let root: string
let base: string
const script = path.join(import.meta.dirname, 'ciScope.ts')
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const commit = () => {
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture')
  return git('rev-parse', 'HEAD')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-ci-scope-'))
  git('init', '--quiet')
  fs.mkdirSync(path.join(root, 'docs'))
  fs.writeFileSync(path.join(root, 'runtime.ts'), 'export const runtime = true\n')
  fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Guide\n')
  base = commit()
})

afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function check(head = 'HEAD', event = 'pull_request', comparison = base) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_EVENT_NAME: event, BASE_SHA: comparison, HEAD_SHA: head, GITHUB_OUTPUT: '' },
  })
}

it('skips a documentation edit with spaces and newlines in its name', () => {
  fs.writeFileSync(path.join(root, 'docs/a guide\nfor players.md'), '# Players\n')
  commit()
  expect(check().stdout).toBe('runtime=false\n')
})

it('runs runtime checks when code moves into documentation', () => {
  git('mv', 'runtime.ts', 'docs/runtime.md')
  commit()
  expect(check().stdout).toBe('runtime=true\n')
})

it('runs runtime checks for a deleted application file', () => {
  fs.rmSync(path.join(root, 'runtime.ts'))
  commit()
  expect(check().stdout).toBe('runtime=true\n')
})

it('runs runtime checks for manual dispatches regardless of the changed paths', () => {
  fs.writeFileSync(path.join(root, 'docs/guide.md'), '# Edited\n')
  commit()
  expect(check('HEAD', 'workflow_dispatch').stdout).toBe('runtime=true\n')
})

it('fails without emitting a skip when git cannot compare the revisions', () => {
  const result = check('missing-revision')
  expect({ status: result.status, output: result.stdout }).toEqual({ status: 1, output: '' })
})

it('fails without emitting a skip when the PR base is missing', () => {
  const result = check('HEAD', 'pull_request', '')
  expect({ status: result.status, output: result.stdout }).toEqual({ status: 1, output: '' })
})

const deploy = parse(fs.readFileSync(new URL('../.github/workflows/dokploy-preview-deploy.yml', import.meta.url), 'utf8')) as {
  jobs: { image: { steps: { run: string }[] } }
}

function imageBuilt(jobs: { name: string; conclusion: string }[], apiFails = false) {
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nif [ "$API_FAILS" = true ]; then exit 23; fi\nprintf "%s" "$JOBS" | jq -r "$4"\n', {
    mode: 0o755,
  })
  const output = path.join(root, 'output')
  const result = spawnSync('bash', ['-c', deploy.jobs.image.steps[0]!.run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_REPO: 'test/app',
      RUN_ID: '1',
      GITHUB_OUTPUT: output,
      JOBS: JSON.stringify({ jobs }),
      API_FAILS: String(apiFails),
    },
  })
  return { status: result.status, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' }
}

it('does not deploy an image skipped for documentation', () => {
  expect(imageBuilt([{ name: 'build', conclusion: 'skipped' }])).toEqual({ status: 0, output: 'built=false\n' })
})

it('deploys the image produced by the reusable workflow', () => {
  expect(imageBuilt([{ name: 'build / Preview image / build', conclusion: 'success' }])).toEqual({ status: 0, output: 'built=true\n' })
})

it('fails closed when no preview build job can be found', () => {
  expect(imageBuilt([{ name: 'changes / changes', conclusion: 'success' }])).toEqual({ status: 5, output: '' })
})

it('fails closed when the preview build API cannot be read', () => {
  expect(imageBuilt([], true)).toEqual({ status: 23, output: '' })
})
