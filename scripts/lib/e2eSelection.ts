import { needsRuntimeChecks } from '../ciScope.ts'
import { E2E_MAP_VERSION, type E2eMap } from './e2eMap.ts'
import { quietHunk, type Hunk } from './quietEdits.ts'

/** A changed file and its edits, or null hunks when the whole file counts, as for a new file. */
export type Change = { file: string; hunks: Hunk[] | null }
/** A changed file's text at the base and head, for telling edits that cannot change what runs. */
export type Contents = (file: string) => { base: string | null; head: string | null }

export type Selection = { all: true; reason: string } | { all: false; specs: string[] }

/** One hunk of the diff from the map's revision to the base: old lines are the map's, new lines the base's. */
export type Move = { oldCount: number; newStart: number; newCount: number }
/** Per file changed since the map's revision, how its lines moved, or null when they cannot be followed. */
export type Moves = ReadonlyMap<string, Move[] | null>

const unitTest = /\.test\.tsx?$/
const moduleFile = /\.(?:ts|tsx|mts|mjs)$/

/**
 * Whether a file the map does not know cannot affect a browser test. Below the repository root, a
 * module none of the map's tests or harness import or name only runs through files that do, which
 * a change adding or removing it edits too; routes are the exception, found by their directory.
 * Workflows other than CI's, container builds and the native shell's own files never run in one.
 */
function unreached(file: string, hunks: Hunk[] | null, moves: Moves) {
  if (/^(?:\.github\/workflows\/|mobile\/)|^(?:Dockerfile[^/]*|\.dockerignore)$/.test(file)) return true
  if (!/^[^/]+\/.+\.(?:ts|tsx|mts|mjs)$/.test(file) || file.startsWith('src/routes/')) return false
  // A module created since the map may already be imported by files the map does not know.
  return hunks === null || moves.get(file) !== null
}

/**
 * The end-to-end specs a change needs, from the map of what each spec executed and imports.
 *
 * An edit inside a function needs the specs that called it; any other edit to a file coverage
 * saw needs every spec that loaded it, because top-level code runs on load. A file a spec's own
 * modules import needs that spec. Files the harness, compiler, workers or CI's browser jobs run
 * need every spec, because coverage sees none of them. A file nothing a test runs can reach needs
 * no spec (see `unreached`). A file changed since the map's revision has its lines translated back to the map's
 * numbering through `moves`; an edit to lines that themselves changed since counts as the whole
 * file. Edits that cannot change what runs, such as comments, types and added imports, need no
 * spec. Anything else the map cannot place, such as configuration or a new file, needs every spec.
 */
export function selectSpecs(map: E2eMap, changes: readonly Change[], moves: Moves, contents: Contents): Selection {
  if (map.version !== E2E_MAP_VERSION)
    return { all: true, reason: `the coverage map is version ${map.version ?? 1}, not ${E2E_MAP_VERSION}` }
  const whole = new Set(map.whole)
  const specs = new Set<string>()
  const add = (indexes: readonly number[]) => indexes.forEach((index) => specs.add(map.specs[index]!))
  for (const { file, hunks } of changes) {
    if (unitTest.test(file) || !needsRuntimeChecks([file]) || file === 'e2e/durations.json') continue
    if (/^e2e\/.+\.spec\.ts$/.test(file)) {
      specs.add(file)
      continue
    }
    // Only modules have comments and declarations `quietHunk` understands; a `*` line in Markdown is a list item.
    const { base, head } = hunks && moduleFile.test(file) ? contents(file) : { base: null, head: null }
    const edits = moduleFile.test(file) ? hunks?.filter((hunk) => !quietHunk(hunk, base, head)) : hunks
    if (edits?.length === 0) continue
    if (whole.has(file)) return { all: true, reason: `${file} runs in every browser test` }
    const entry = map.files[file]
    const imported = map.imports[file]
    if (imported) add(imported)
    if (!entry) {
      if (imported || unreached(file, hunks, moves)) continue
      return { all: true, reason: `${file} is not in the map` }
    }
    const translated = edits?.map(({ start, end }) => mapSpan([start, end], moves.get(file)))
    if (!translated || translated.some((span) => span === null)) {
      add(entry.loaded)
      for (const [, , users] of entry.functions) add(users)
      continue
    }
    for (const [start, end] of translated as [number, number][]) {
      const enclosing = entry.functions.filter(([first, last]) => first <= start && end <= last)
      if (enclosing.length === 0) add(entry.loaded)
      for (const [, , users] of enclosing) add(users)
    }
  }
  return { all: false, specs: [...specs].toSorted() }
}

/** A base-side span in the map's numbering, or null when any of its lines changed since the map. */
function mapSpan([start, end]: [number, number], file: Move[] | null | undefined): [number, number] | null {
  if (file === undefined) return [start, end]
  if (file === null) return null
  let offset = 0
  for (const { oldCount, newStart, newCount } of file) {
    // A hunk adding no lines deletes the map's lines after base line `newStart`.
    const last = newCount === 0 ? newStart : newStart + newCount - 1
    if (newCount > 0 && newStart <= end && start <= last) return null
    if (newCount === 0 && start <= newStart && newStart < end) return null
    if (last >= start) break
    offset += oldCount - newCount
  }
  return [start + offset, end + offset]
}

/** How each file's lines moved, from `git diff --unified=0 <map revision> <base>` output. */
export function lineMoves(diff: string): Moves {
  const moves = new Map<string, Move[] | null>()
  let current: string | null = null
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (header) {
      current = header[1]!
      moves.set(current, [])
      continue
    }
    if (!current) continue
    if (line.startsWith('Binary files ') || line.startsWith('deleted file mode') || line.startsWith('new file mode'))
      moves.set(current, null)
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    const moved = moves.get(current)
    if (hunk && moved)
      moved.push({
        oldCount: hunk[2] === undefined ? 1 : Number(hunk[2]),
        newStart: Number(hunk[3]),
        newCount: hunk[4] === undefined ? 1 : Number(hunk[4]),
      })
  }
  return moves
}

/**
 * Each file's edits from `git diff --unified=0` output, with base-side spans. An insertion after
 * line L spans L to L + 1, so it counts as inside a function only when both neighbours are.
 */
export function changedHunks(diff: string): Change[] {
  const changes: Change[] = []
  let current: Change | null = null
  let hunk: Hunk | null = null
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (header) {
      current = { file: header[1]!, hunks: [] }
      hunk = null
      changes.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('Binary files ') || line.startsWith('deleted file mode') || line.startsWith('new file mode')) current.hunks = null
    const span = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (span && current.hunks) {
      const start = Number(span[1])
      const count = span[2] === undefined ? 1 : Number(span[2])
      hunk = { start, end: count === 0 ? start + 1 : start + count - 1, removed: [], added: [], addedStart: Number(span[3]) }
      current.hunks.push(hunk)
      // A file's `---` and `+++` headers come before its first hunk, so inside one every sign is a line.
    } else if (hunk && line.startsWith('-')) hunk.removed.push(line.slice(1))
    else if (hunk && line.startsWith('+')) hunk.added.push(line.slice(1))
  }
  return changes
}
