import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { isEntryPoint } from './lib/entryPoint.ts'

export function needsRuntimeChecks(files: readonly string[]) {
  return (
    files.length === 0 ||
    files.some(
      (file) =>
        !/^docs\/[\s\S]+\.md$/.test(file) && !['README.md', 'CONTRIBUTING.md', 'CLAUDE.md', 'AGENTS.md', 'SECURITY.md'].includes(file),
    )
  )
}

if (isEntryPoint(import.meta.url)) {
  const base = process.env.BASE_SHA
  const head = process.env.HEAD_SHA
  let runtime = true
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    if (!base || !head) throw new Error('pull request comparison requires BASE_SHA and HEAD_SHA')
    const files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--'], { encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
    runtime = needsRuntimeChecks(files)
  }
  const output = `runtime=${runtime}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  else process.stdout.write(output)
}
