/**
 * Splits the end-to-end suite across CI runners by recorded test duration.
 *
 * Playwright shards by test count, and a handful of long journeys decide how long a
 * runner takes, so count-based shards finished minutes apart. Packing the longest
 * tests first onto the least-loaded runner keeps every runner near the mean.
 *
 * `tsx scripts/e2eShard.ts <tests.json> <current> <total>` reads the JSON reporter's
 * `--list` output and prints one runner's tests for `playwright test --test-list`.
 * With E2E_SPECS set to a JSON array of spec files, only their tests are listed, as the
 * coverage map chose. `tsx scripts/e2eShard.ts --runners <specs> <max>` prints the runners
 * those specs need, by their recorded durations, as a JSON array of runner numbers.
 * `tsx scripts/e2eShard.ts --record <report.json>...` updates e2e/durations.json from
 * JSON reports, taking each test's median across the runs they cover and dropping tests
 * the reports no longer list; a test missing from it weighs as much as the median.
 */
import fs from 'node:fs'
import path from 'node:path'
import { isEntryPoint } from './lib/entryPoint.ts'

type SpecReport = { title: string; tests?: { results?: { status: string; duration: number }[] }[] }
type Suite = { title: string; file: string; specs?: SpecReport[]; suites?: Suite[] }
type Report = { suites: Suite[] }
export type Durations = Record<string, number>

const durationsFile = path.join(import.meta.dirname, '..', 'e2e', 'durations.json')

function specsOf(report: Report) {
  const specs: { title: string; spec: SpecReport }[] = []
  const walk = (suite: Suite, titlePath: string[]) => {
    for (const spec of suite.specs ?? []) specs.push({ title: [...titlePath, spec.title].join(' › '), spec })
    for (const child of suite.suites ?? []) walk(child, [...titlePath, child.title])
  }
  for (const file of report.suites) walk(file, [file.file])
  return specs
}

export const testTitles = (report: Report) => specsOf(report).map(({ title }) => title)

/** Seconds each passing test took; a failure or timeout says nothing about its usual length. */
export function recordedDurations(report: Report): Durations {
  const durations: Durations = {}
  for (const { title, spec } of specsOf(report)) {
    const results = spec.tests?.flatMap((test) => test.results ?? []) ?? []
    if (results.length > 0 && results.every((result) => result.status === 'passed')) {
      durations[title] = Math.round(results.reduce((sum, result) => sum + result.duration, 0) / 100) / 10
    }
  }
  return durations
}

/** Each test's median across several runs' reports, so one slow runner does not set its weight. */
export function medianDurations(reports: readonly Report[]): Durations {
  const seconds = new Map<string, number[]>()
  for (const report of reports)
    for (const [title, duration] of Object.entries(recordedDurations(report))) seconds.set(title, [...(seconds.get(title) ?? []), duration])
  return Object.fromEntries(
    [...seconds].map(([title, values]) => {
      const sorted = values.toSorted((left, right) => left - right)
      const middle = Math.floor(sorted.length / 2)
      return [title, sorted.length % 2 ? sorted[middle]! : Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10]
    }),
  )
}

export function shardTitles(titles: readonly string[], durations: Durations, current: number, total: number) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(current) || current < 1 || current > total) {
    throw new Error(`shard must be between 1 and ${total}, got ${current}`)
  }
  const known = titles.flatMap((title) => durations[title] ?? []).toSorted((left, right) => left - right)
  const median = known[Math.floor(known.length / 2)] ?? 1
  const longestFirst = titles
    .map((title, index) => ({ index, seconds: durations[title] ?? median }))
    .toSorted((left, right) => right.seconds - left.seconds || left.index - right.index)
  const loads = Array.from({ length: total }, () => 0)
  const runnerOf: number[] = []
  for (const { index, seconds } of longestFirst) {
    const runner = loads.indexOf(Math.min(...loads))
    loads[runner]! += seconds
    runnerOf[index] = runner
  }
  return titles.filter((_, index) => runnerOf[index] === current - 1)
}

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T

/** Titles name their file relative to `e2e/`, as the selected specs name it relative to the repository. */
export function selectedTitles(titles: readonly string[], specs: readonly string[]) {
  const files = new Set(specs.map((spec) => path.relative('e2e', spec)))
  return titles.filter((title) => files.has(title.split(' › ')[0]!))
}

/** As many runners as the selected tests fill at the full suite's load per runner, up to `max`. */
export function runnersFor(durations: Durations, specs: readonly string[] | 'all', max: number) {
  if (specs === 'all') return max
  if (specs.length === 0) return 0
  const all = Object.values(durations).reduce((sum, seconds) => sum + seconds, 0)
  const selected = selectedTitles(Object.keys(durations), specs).reduce((sum, title) => sum + durations[title]!, 0)
  return Math.min(max, Math.max(1, Math.ceil((selected * max) / all)))
}

if (isEntryPoint(import.meta.url)) {
  const arguments_ = process.argv.slice(2)
  if (arguments_[0] === '--record') {
    const reports = arguments_.slice(1)
    if (reports.length === 0) throw new Error('usage: e2eShard.ts --record <report.json>...')
    const parsed = reports.map((report) => readJson<Report>(report))
    const listed = new Set(parsed.flatMap(testTitles))
    const kept = Object.entries(readJson<Durations>(durationsFile)).filter(([title]) => listed.has(title))
    const durations: Durations = { ...Object.fromEntries(kept), ...medianDurations(parsed) }
    const sorted = Object.fromEntries(Object.entries(durations).toSorted(([left], [right]) => left.localeCompare(right)))
    fs.writeFileSync(durationsFile, `${JSON.stringify(sorted, null, 2)}\n`)
  } else if (arguments_[0] === '--runners') {
    const [, specs, max] = arguments_
    if (!specs || !max) throw new Error('usage: e2eShard.ts --runners <all|specs.json> <max>')
    const count = runnersFor(readJson(durationsFile), specs === 'all' ? 'all' : (JSON.parse(specs) as string[]), Number(max))
    console.log(JSON.stringify(Array.from({ length: count }, (_, index) => index + 1)))
  } else {
    const [listFile, current, total] = arguments_
    if (!listFile || !current || !total) throw new Error('usage: e2eShard.ts <tests.json> <current> <total>')
    const listed = testTitles(readJson(listFile))
    const titles = process.env.E2E_SPECS ? selectedTitles(listed, JSON.parse(process.env.E2E_SPECS) as string[]) : listed
    if (titles.length === 0) throw new Error(`${listFile} lists no tests`)
    console.log(shardTitles(titles, readJson(durationsFile), Number(current), Number(total)).join('\n'))
  }
}
