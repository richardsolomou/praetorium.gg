import fs from 'node:fs'
import path from 'node:path'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

/** A function V8 counted at least once in one test, by its byte offsets in a built script. */
export type ExecutedFunction = { url: string; start: number; end: number }
/** What `e2e/test.ts` writes for each test in a coverage run. */
export type CoverageRecord = { spec: string; client: ExecutedFunction[]; server: ExecutedFunction[] }

/** Bumped whenever selection reads the map differently, so an older cached map runs every spec. */
export const E2E_MAP_VERSION = 2

/**
 * Which specs exercise each source file, at one revision.
 *
 * `loaded` lists every spec that loaded a script containing the file, so its top-level code ran.
 * `functions` lists the file's executed functions as 1-based source line spans, each with the
 * specs that called it. Specs are indexes into `specs`.
 */
export type E2eMap = {
  version: number
  revision: string
  specs: string[]
  files: Record<string, { loaded: number[]; functions: [start: number, end: number, specs: number[]][] }>
  /** Source the build's web workers run, which page coverage never sees into. */
  whole: string[]
}

type Script = { trace: TraceMap; length: number; lineStarts: number[]; sources: (string | null)[] }

/** A source path in a map, relative to `root`, or null for dependencies and generated code. */
function sourcePath(source: string | null, root: string) {
  if (!source || source.includes('/node_modules/')) return null
  // Rolldown writes sources relative to where the build ran; past the leading `..` they are absolute.
  const absolute = path.isAbsolute(source) ? source : source.replace(/^(\.\.\/)+/, '/')
  const file = path.relative(root, absolute).replace(/\?.*$/, '')
  return file.startsWith('src/') ? file : null
}

/** Source files in the build's web worker chunks, which page coverage cannot see into. */
export function workerSources(buildDirectory: string, root: string) {
  const assets = path.join(buildDirectory, 'public/assets')
  return fs
    .readdirSync(assets)
    .filter((file) => /\.worker-[\w-]+\.js\.map$/.test(file))
    .flatMap((file) => (JSON.parse(fs.readFileSync(path.join(assets, file), 'utf8')) as { sources: (string | null)[] }).sources)
    .flatMap((source) => sourcePath(source, root) ?? [])
}

/** Reads a built script and its source map from the build directory, by the address the test loaded it from. */
export function scriptReader(buildDirectory: string, root: string) {
  const scripts = new Map<string, Script | null>()
  return (url: string) => {
    const parsed = new URL(url)
    // Browsers load `/assets/…` from the public directory; the server runs `…/build/server/…` from a stack's copy.
    const relative =
      parsed.protocol === 'file:'
        ? parsed.pathname.slice(parsed.pathname.lastIndexOf('/build/') + '/build/'.length)
        : `public${parsed.pathname}`
    if (scripts.has(relative)) return scripts.get(relative)!
    const file = path.join(buildDirectory, relative)
    let script: Script | null = null
    if (fs.existsSync(`${file}.map`)) {
      const code = fs.readFileSync(file, 'utf8')
      const lineStarts = [0]
      for (let index = 0; index < code.length; index += 1) if (code.charCodeAt(index) === 10) lineStarts.push(index + 1)
      const raw = JSON.parse(fs.readFileSync(`${file}.map`, 'utf8')) as { sources: (string | null)[] }
      script = {
        trace: new TraceMap(raw as never),
        length: code.length,
        lineStarts,
        sources: raw.sources.map((source) => sourcePath(source, root)),
      }
    }
    scripts.set(relative, script)
    return script
  }
}

/** The zero-based generated line holding `offset`. */
function lineAt(script: Script, offset: number) {
  let low = 0
  let high = script.lineStarts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (script.lineStarts[middle]! <= offset) low = middle
    else high = middle - 1
  }
  return low
}

function originalAt(script: Script, offset: number) {
  const line = lineAt(script, offset)
  return originalPositionFor(script.trace, { line: line + 1, column: offset - script.lineStarts[line]! })
}

/**
 * The last source line a function's body maps to. Closing braces often carry no mapping, so this
 * walks back line by line from the function's end; finding none leaves only its first line, so
 * an edit later in the body counts as top-level.
 */
function lastMappedLine(script: Script, start: number, end: number, source: string, firstLine: number) {
  let offset = Math.max(start, end - 1)
  while (offset >= start) {
    const position = originalAt(script, offset)
    if (position.source === source && position.line !== null && position.line >= firstLine) return position.line
    // Step to the end of the previous generated line.
    offset = script.lineStarts[lineAt(script, offset)]! - 1
  }
  return firstLine
}

/** Folds every test's coverage into one map; tests of the same spec file count as that spec. */
export function buildE2eMap(
  records: Iterable<CoverageRecord>,
  readScript: ReturnType<typeof scriptReader>,
  root: string,
  revision: string,
  whole: readonly string[] = [],
): E2eMap {
  const specs: string[] = []
  const loaded = new Map<string, Set<number>>()
  const functions = new Map<string, Map<string, Set<number>>>()
  for (const record of records) {
    let spec = specs.indexOf(record.spec)
    if (spec === -1) spec = specs.push(record.spec) - 1
    for (const { url, start, end } of [...record.client, ...record.server]) {
      const script = readScript(url)
      if (!script) continue
      for (const source of script.sources) if (source) loaded.set(source, (loaded.get(source) ?? new Set()).add(spec))
      // V8 reports a loaded script's top level as a function spanning it; `loaded` already records it.
      if (start === 0 && end >= script.length) continue
      const first = originalAt(script, start)
      const file = sourcePath(first.source, root)
      if (!file || first.line === null) continue
      const lastLine = lastMappedLine(script, start, end, first.source!, first.line)
      const spans = functions.get(file) ?? new Map<string, Set<number>>()
      const key = `${first.line}:${lastLine}`
      spans.set(key, (spans.get(key) ?? new Set()).add(spec))
      functions.set(file, spans)
    }
  }
  const sorted = (values: Iterable<number>) => [...values].toSorted((left, right) => left - right)
  const files: E2eMap['files'] = {}
  for (const file of [...new Set([...loaded.keys(), ...functions.keys()])].toSorted()) {
    files[file] = {
      loaded: sorted(loaded.get(file) ?? []),
      functions: [...(functions.get(file) ?? [])]
        .map(([key, users]) => [...(key.split(':').map(Number) as [number, number]), sorted(users)] as [number, number, number[]])
        .toSorted((left, right) => left[0] - right[0] || left[1] - right[1]),
    }
  }
  return { version: E2E_MAP_VERSION, revision, specs, files, whole: [...new Set(whole)].toSorted() }
}
