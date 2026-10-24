/**
 * Folds a coverage run's per-test records into the map that chooses which specs a change needs.
 *
 * `tsx scripts/e2eMap.ts <build-dir> <revision> <out.json> <coverage-dir>...` reads every record
 * that `E2E_COVERAGE_DIR` runs of `e2e/test.ts` wrote and what each stack wrote under `processes/`
 * (see `e2e/stackEnv.ts`), maps executed code through the build's source maps, adds the source web
 * workers run, which coverage cannot see, and writes the map for `scripts/e2eSelect.ts`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildE2eMap, builtCatalogue, scriptReader, workerSources, type CoverageRecord, type ProcessCoverage } from './lib/e2eMap.ts'
import { moduleCalls } from './lib/moduleCoverage.ts'

const [buildDirectory, revision, output, ...directories] = process.argv.slice(2)
if (!buildDirectory || !revision || !output || directories.length === 0)
  throw new Error('usage: e2eMap.ts <build-dir> <revision> <out.json> <coverage-dir>...')

const json = <T>(directory: string, keep = (_file: string) => true) =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((file) => file.endsWith('.json') && keep(file))
        .map((file) => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as T)
    : []

const records = directories.flatMap((directory) => json<CoverageRecord>(directory))
const stacks = directories.flatMap((directory) =>
  fs.existsSync(path.join(directory, 'processes'))
    ? fs.readdirSync(path.join(directory, 'processes')).map((stack) => path.join(directory, 'processes', stack))
    : [],
)

/**
 * The SpacetimeDB module's calls, read as server code: each call the test whose window it ended
 * in, and the rest as harness coverage, with every marked function the harness never ran uncalled.
 */
const moduleReaders = new Map<string, ReturnType<typeof scriptReader>>()
const moduleHarness = stacks.flatMap((stack): ProcessCoverage[] => {
  const directory = path.join(stack, 'spacetime')
  if (!fs.existsSync(path.join(directory, 'logs.jsonl'))) return []
  const name = path.basename(stack)
  const url = `file:///spacetime/${name}/build/bundle.js`
  const functions = JSON.parse(fs.readFileSync(path.join(directory, 'functions.json'), 'utf8')) as [number, number][]
  const windows = records.filter((record) => record.stack === name)
  const ranHere = new Set<number>()
  for (const call of moduleCalls(fs.readFileSync(path.join(directory, 'logs.jsonl'), 'utf8'))) {
    const record = call.starting ? undefined : windows.find(({ started, ended }) => started! <= call.at && call.at <= ended!)
    if (record) record.server.push(...call.ids.map((id) => ({ url, start: functions[id]![0], end: functions[id]![1] })))
    else for (const id of call.ids) ranHere.add(id)
  }
  moduleReaders.set(name, scriptReader(directory, process.cwd()))
  const ranges = functions.map(([startOffset, endOffset], id) => ({ ranges: [{ startOffset, endOffset, count: ranHere.has(id) ? 1 : 0 }] }))
  return [{ result: [{ url, functions: ranges }] }]
})
// The server's main thread wrote its startup separately; its exit coverage holds only the last test.
const harness = {
  seed: stacks.flatMap((stack) => json<ProcessCoverage>(path.join(stack, 'seed'))),
  startup: stacks.flatMap((stack) => json<ProcessCoverage>(path.join(stack, 'startup'))),
  // `NODE_V8_COVERAGE` names each file after its thread, and thread 0 is the main one.
  'combat worker': stacks.flatMap((stack) => json<ProcessCoverage>(path.join(stack, 'server'), (file) => !file.endsWith('-0.json'))),
  'SpacetimeDB module': moduleHarness,
}
// Missing coverage would make the harness's source look unused, so selection would skip it.
for (const [name, coverage] of Object.entries(harness))
  if (coverage.length === 0) throw new Error(`the coverage run recorded no ${name} coverage`)
const build = path.resolve(buildDirectory)
const readBuild = scriptReader(build, process.cwd())
const map = buildE2eMap(
  records,
  (url) => {
    const module = /^file:\/\/\/spacetime\/([^/]+)\/build\//.exec(url)?.[1]
    return module ? moduleReaders.get(module)!(url) : readBuild(url)
  },
  process.cwd(),
  revision,
  {
    whole: workerSources(build, process.cwd()),
    processes: Object.values(harness).flat(),
    catalogue: builtCatalogue(build),
  },
)
if (map.specs.length === 0) throw new Error('the coverage run recorded no tests')
fs.writeFileSync(output, JSON.stringify(map))
console.log(`Mapped ${Object.keys(map.files).length} source files across ${map.specs.length} specs at ${revision}`)
