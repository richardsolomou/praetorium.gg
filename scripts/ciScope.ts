import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { isEntryPoint } from './lib/entryPoint.ts'

/** Paths that no runtime lane, build or deploy reads; `static` still checks them. CHANGELOG.md is not here: the app imports it. */
const INERT = [
  /^docs\/[\s\S]+\.md$/,
  /^(README|CONTRIBUTING|CLAUDE|AGENTS|SECURITY|DESIGN|PRODUCT)\.md$/,
  /^\.changeset\/[^/]+\.md$/,
  /^plugin\//,
  /^justfile$/,
  /^\.github\/pull_request_template\.md$/,
]

export function needsRuntimeChecks(files: readonly string[]) {
  return files.length === 0 || files.some((file) => !INERT.some((pattern) => pattern.test(file)))
}

if (isEntryPoint(import.meta.url)) {
  const base = process.env.BASE_SHA
  const head = process.env.HEAD_SHA
  let runtime = true
  // A push compares with the branch's previous head; a new branch's previous head is all zeros.
  const compared =
    process.env.GITHUB_EVENT_NAME === 'pull_request' || (process.env.GITHUB_EVENT_NAME === 'push' && !/^0+$/.test(base ?? ''))
  if (compared) {
    if (!base || !head) throw new Error('the comparison requires BASE_SHA and HEAD_SHA')
    const files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    runtime = needsRuntimeChecks(files)
  }
  const output = `runtime=${runtime}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  else process.stdout.write(output)
}
