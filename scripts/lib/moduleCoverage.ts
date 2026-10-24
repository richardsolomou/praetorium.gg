import fs from 'node:fs'
import path from 'node:path'
import { parseSync } from 'vite'

/**
 * Coverage for the SpacetimeDB module, which runs inside SpacetimeDB where no coverage API reaches.
 *
 * A coverage run publishes the module with a marker at the start of every function. Each reducer,
 * procedure or view call logs one line listing the functions it ran, so the run's module logs say
 * what every call executed and when. SpacetimeDB keeps several module instances, so counts kept in
 * module memory could not be read back reliably; the logs collect every instance's calls.
 */
const CALL = 'praetorium-coverage'
// What an instance ran while starting, before its first call: it runs whatever a test does.
const START = 'praetorium-coverage-start'

type Node = { type: string; start: number; end: number; body?: Node }

/** Every function node in the program, by its source offsets. */
function functionNodes(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) for (const child of node) functionNodes(child, found)
  else if (node && typeof node === 'object') {
    const { type } = node as Node
    if (type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression') found.push(node as Node)
    for (const [key, value] of Object.entries(node)) if (key !== 'type' && value && typeof value === 'object') functionNodes(value, found)
  }
  return found
}

const prelude = (count: number) => `var __praetoriumSeen = new Uint8Array(${count}), __praetoriumHits = [];
function __praetoriumHit(id) { if (!__praetoriumSeen[id]) { __praetoriumSeen[id] = 1; __praetoriumHits.push(id); } }
function __praetoriumFlush(prefix) {
  if (__praetoriumHits.length === 0) return;
  console.log(prefix + " " + __praetoriumHits.join(","));
  for (const id of __praetoriumHits) __praetoriumSeen[id] = 0;
  __praetoriumHits.length = 0;
}
function __praetoriumCover(hooks) {
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(hooks))) {
    if (!name.startsWith("__call_")) continue;
    const call = hooks[name];
    hooks[name] = function (...args) {
      __praetoriumFlush(${JSON.stringify(START)});
      try { return call.apply(hooks, args); } finally { __praetoriumFlush(${JSON.stringify(CALL)}); }
    };
  }
  return hooks;
}
`

// The SDK builds the hooks SpacetimeDB calls here; the pinned SDK version keeps it stable.
const hooks = 'return makeHooks(this.#ctx);'

/** Offsets of the bundle's application source, from the region markers Rolldown writes around each module. */
function applicationRegions(code: string) {
  return [...code.matchAll(/^\/\/#region (.+)$[\s\S]*?^\/\/#endregion$/gm)].flatMap((match) =>
    // Sources are relative to the module's directory, `spacetimedb/`.
    match[1]!.startsWith('../src/') ? [[match.index, match.index + match[0].length] as const] : [],
  )
}

/**
 * The module with a marker at the start of every application function and its call hooks logging
 * what each call ran, and the offsets of each marked function in `code`, indexed by marker.
 */
export function instrumentModule(code: string) {
  if (code.split(hooks).length !== 2) throw new Error(`the module bundle has no single \`${hooks}\` to wrap`)
  const regions = applicationRegions(code)
  const functions = functionNodes(parseSync('bundle.js', code).program).filter(({ start }) =>
    regions.some(([first, last]) => first <= start && start < last),
  )
  const insertions: [offset: number, text: string][] = []
  functions.forEach(({ body }, id) => {
    if (body!.type === 'BlockStatement') insertions.push([body!.start + 1, `__praetoriumHit(${id});`])
    else insertions.push([body!.start, `(__praetoriumHit(${id}), `], [body!.end, ')'])
  })
  let instrumented = code
  for (const [offset, text] of insertions.toSorted((left, right) => right[0] - left[0]))
    instrumented = instrumented.slice(0, offset) + text + instrumented.slice(offset)
  return {
    code: prelude(functions.length) + instrumented.replace(hooks, 'return __praetoriumCover(makeHooks(this.#ctx));'),
    functions: functions.map(({ start, end }) => [start, end] as [number, number]),
  }
}

/** Each logged call: when it ended in milliseconds, the markers it ran, and whether an instance ran them while starting. */
export function moduleCalls(logs: string) {
  return logs.split('\n').flatMap((line) => {
    if (!line.includes(CALL)) return []
    const { ts, message } = JSON.parse(line) as { ts: number; message: string }
    const [prefix, ids] = message.split(' ')
    if (prefix !== CALL && prefix !== START) return []
    return [{ at: ts / 1_000, ids: ids!.split(',').map(Number), starting: prefix === START }]
  })
}

const inlineMap = /\n\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\s*$/

/**
 * Instruments the built module at `bundle` in place, keeping what `scripts/e2eMap.ts` maps its
 * calls back to source with in `output`: the original bundle, its source map with paths in `repository`,
 * and the marked functions' offsets.
 */
export function prepareModuleCoverage(bundle: string, output: string, repository: string) {
  const code = fs.readFileSync(bundle, 'utf8')
  const encoded = inlineMap.exec(code)?.[1]
  if (!encoded) throw new Error(`${bundle} has no inline source map`)
  const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as { sources: string[] }
  // The module builds from a copy laid out like the repository, with sources relative to its `spacetimedb/`.
  map.sources = map.sources.map((source) => path.resolve(repository, 'spacetimedb', source))
  const instrumented = instrumentModule(code)
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, 'bundle.js'), code)
  fs.writeFileSync(path.join(output, 'bundle.js.map'), JSON.stringify(map))
  fs.writeFileSync(path.join(output, 'functions.json'), JSON.stringify(instrumented.functions))
  fs.writeFileSync(bundle, instrumented.code)
}
