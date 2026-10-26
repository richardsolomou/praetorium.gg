/**
 * Whether a change can move the catalogue coverage snapshot, so the coverage lane runs only then.
 *
 * Reads BASE_SHA and HEAD_SHA and writes `needed=true|false` to GITHUB_OUTPUT. The snapshot
 * depends on the code its scripts import, the catalogue configuration they read from disk, and the
 * installed dependencies and toolchain; anything else cannot change what it records.
 */
import { execFileSync } from 'node:child_process'
import { isEntryPoint } from './lib/entryPoint.ts'
import { stepOutput } from './lib/stepOutput.ts'
import { importClosures } from './lib/moduleGraph.ts'

export const coverageEntries = [
  'scripts/catalogueCoverage.ts',
  'scripts/parallelCatalogueCoverage.ts',
  'scripts/compareCatalogueCoverage.ts',
  'scripts/catalogueCoverageScope.ts',
]
const inputs = [
  /^catalogue(?:\.json|\/)/,
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|mise\.toml)$/,
  /^\.github\/workflows\/ci\.yml$/,
]

export function needsCatalogueCoverage(files: readonly string[], reached: ReadonlySet<string>) {
  return files.some((file) => reached.has(file) || inputs.some((pattern) => pattern.test(file)))
}

if (isEntryPoint(import.meta.url)) {
  const { BASE_SHA: base, HEAD_SHA: head } = process.env
  if (!base || !head) throw new Error('catalogue coverage scope requires BASE_SHA and HEAD_SHA')
  const files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head, '--'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  const reached = new Set([...(await importClosures(process.cwd(), coverageEntries)).values()].flat())
  stepOutput({ needed: needsCatalogueCoverage(files, reached) })
}
