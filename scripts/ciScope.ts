import { isEntryPoint } from './lib/entryPoint.ts'
import { changedFiles } from './lib/git.ts'
import { stepOutput } from './lib/stepOutput.ts'

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
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    if (!base || !head) throw new Error('pull request comparison requires BASE_SHA and HEAD_SHA')
    runtime = needsRuntimeChecks(changedFiles(`${base}...${head}`))
  }
  stepOutput({ runtime })
}
