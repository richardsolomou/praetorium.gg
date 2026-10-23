import { needsRuntimeChecks } from '../ciScope.ts'
import type { E2eMap } from './e2eMap.ts'

/** A changed file and its changed lines on the base side, or null when the whole file counts. */
export type Change = { file: string; hunks: [start: number, end: number][] | null }

export type Selection = { all: true; reason: string } | { all: false; specs: string[] }

const unitTest = /\.test\.tsx?$/

/**
 * The end-to-end specs a change needs, from the map of what each spec executed.
 *
 * An edit inside a function needs the specs that called it; any other edit to a file needs every
 * spec that loaded it, because top-level code runs on load. Anything the map cannot place, such
 * as a new source file, configuration, tooling, or a shared test helper, needs every spec.
 * `stale` lists files changed since the map's revision, whose line numbers no longer match it.
 */
export function selectSpecs(map: E2eMap, changes: readonly Change[], stale: ReadonlySet<string>): Selection {
  const specs = new Set<string>()
  for (const { file, hunks } of changes) {
    if (unitTest.test(file) || !needsRuntimeChecks([file]) || file === 'e2e/durations.json') continue
    if (/^e2e\/.+\.spec\.ts$/.test(file)) {
      specs.add(file)
      continue
    }
    if (!file.startsWith('src/')) return { all: true, reason: `${file} is outside the application source` }
    const entry = map.files[file]
    if (!entry) return { all: true, reason: `${file} is not in the map` }
    const add = (indexes: readonly number[]) => indexes.forEach((index) => specs.add(map.specs[index]!))
    if (!hunks || stale.has(file)) {
      add(entry.loaded)
      for (const [, , users] of entry.functions) add(users)
      continue
    }
    for (const [start, end] of hunks) {
      const enclosing = entry.functions.filter(([first, last]) => first <= start && end <= last)
      if (enclosing.length === 0) add(entry.loaded)
      for (const [, , users] of enclosing) add(users)
    }
  }
  return { all: false, specs: [...specs].toSorted() }
}

/**
 * Base-side changed line spans per file from `git diff --unified=0` output. An insertion after
 * line L spans L to L + 1, so it counts as inside a function only when both neighbours are.
 */
export function changedHunks(diff: string): Change[] {
  const changes: Change[] = []
  let current: Change | null = null
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (header) {
      current = { file: header[1]!, hunks: [] }
      changes.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('Binary files ') || line.startsWith('deleted file mode') || line.startsWith('new file mode')) current.hunks = null
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line)
    if (hunk && current.hunks) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      current.hunks.push(count === 0 ? [start, start + 1] : [start, start + count - 1])
    }
  }
  return changes
}
