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

/**
 * Files browser tests run outside the processes coverage records, the specs whose own modules
 * import each file, and `builtCatalogue` of the head's build, all read from the change's head so
 * they are never staler than it.
 */
export type Graph = { harness: ReadonlySet<string>; imports: ReadonlyMap<string, readonly string[]>; catalogue: string }

const unitTest = /\.test\.tsx?$/
const moduleFile = /\.(?:ts|tsx|mts|mjs)$/

/**
 * Whether a file outside the application source that no spec or harness process reaches at the
 * head cannot affect a browser test: a module below the repository root, a workflow other than
 * CI's, a container build, or the native shell's own files other than its dependencies.
 */
function unreached(file: string) {
  if (/^mobile\/(?:.+\/)?(?:package\.json|[\w-]*lock[\w.-]*)$/.test(file)) return false
  return /^(?:\.github\/workflows\/|mobile\/|(?!src\/)[^/]+\/.+\.(?:ts|tsx|mts|mjs)$)|^(?:Dockerfile[^/]*|\.dockerignore)$/.test(file)
}

/**
 * The end-to-end specs a change needs, from the map of what each spec executed and the head's
 * import graph.
 *
 * An edit inside a function needs the specs that called it; any other edit to a source file
 * coverage saw needs every spec that loaded it, because top-level code runs on load. A source
 * file coverage never saw needs every spec, because it may run before any test does. A file a
 * spec's own modules import needs that spec. A file the harness runs needs every spec. A file
 * outside the application source that nothing reaches needs no spec (see `unreached`). A file
 * changed since the map's revision has its lines translated back to the map's numbering through
 * `moves`; an edit to lines that themselves changed since counts as the whole file. Edits that
 * cannot change what runs, such as comments, types and added imports, need no spec. Anything else,
 * such as configuration, needs every spec.
 *
 * The seed and the combat workers run for every test at once, so an edit to a file they loaded
 * needs every spec unless it falls inside a function they never called. A catalogue compiled
 * differently from the coverage run's may change what any test sees, so it needs every spec.
 */
export function selectSpecs(map: E2eMap, changes: readonly Change[], moves: Moves, contents: Contents, graph: Graph): Selection {
  if (map.version !== E2E_MAP_VERSION)
    return { all: true, reason: `the coverage map is version ${map.version ?? 1}, not ${E2E_MAP_VERSION}` }
  if (map.catalogue !== graph.catalogue) return { all: true, reason: "the build compiled a different catalogue from the coverage run's" }
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
    if (whole.has(file) || graph.harness.has(file)) return { all: true, reason: `${file} runs in every browser test` }
    for (const spec of graph.imports.get(file) ?? []) specs.add(spec)
    if (!file.startsWith('src/')) {
      if (graph.imports.has(file) || unreached(file)) continue
      return { all: true, reason: `${file} is outside the application source` }
    }
    const translated = edits?.map(({ start, end }) => mapSpan([start, end], moves.get(file)))
    const ran = map.harness[file]
    if (ran && !translated?.every((span) => span !== null && uncalledByHarness(ran, span)))
      return { all: true, reason: `${file} runs in the seed or a combat worker` }
    const entry = map.files[file]
    // A unit-test fixture no spec loaded serves the unit tests alone; a file only the harness loaded was edited where it never ran.
    if (!entry && (ran || /\.fixtures?\.ts$/.test(file))) continue
    if (!entry) return { all: true, reason: `${file} is not in the map` }
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

/** Whether a span lies in a function the harness compiled but never called, rather than one it ran or at the top level. */
function uncalledByHarness({ called, uncalled }: E2eMap['harness'][string], [start, end]: [number, number]) {
  const within = ([first, last]: [number, number]) => first <= start && end <= last
  const innermost = uncalled.filter(within).toSorted((left, right) => left[1] - left[0] - (right[1] - right[0]))[0]
  // A called function nested in it, or the same function called in another process, ran the edit.
  return innermost !== undefined && !called.some((span) => within(span) && innermost[0] <= span[0] && span[1] <= innermost[1])
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
