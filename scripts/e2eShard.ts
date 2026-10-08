/**
 * Splits the end-to-end suite across CI runners by recorded test duration.
 *
 * Playwright shards by test count, and a handful of long journeys decide how long a
 * runner takes, so count-based shards finished minutes apart. Packing the longest
 * tests first onto the least-loaded runner keeps every runner near the mean.
 *
 * `tsx scripts/e2eShard.ts <tests.json> <current> <total>` reads the JSON reporter's
 * `--list` output and prints one runner's tests for `playwright test --test-list`.
 * `tsx scripts/e2eShard.ts --record <report.json>...` updates e2e/durations.json from
 * JSON reports; a test missing from it weighs as much as the median.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const arguments_ = process.argv.slice(2)
  if (arguments_[0] === '--record') {
    const reports = arguments_.slice(1)
    if (reports.length === 0) throw new Error('usage: e2eShard.ts --record <report.json>...')
    const durations: Durations = Object.assign(readJson(durationsFile), ...reports.map((report) => recordedDurations(readJson(report))))
    const sorted = Object.fromEntries(Object.entries(durations).toSorted(([left], [right]) => left.localeCompare(right)))
    fs.writeFileSync(durationsFile, `${JSON.stringify(sorted, null, 2)}\n`)
  } else {
    const [listFile, current, total] = arguments_
    if (!listFile || !current || !total) throw new Error('usage: e2eShard.ts <tests.json> <current> <total>')
    const titles = testTitles(readJson(listFile))
    if (titles.length === 0) throw new Error(`${listFile} lists no tests`)
    console.log(shardTitles(titles, readJson(durationsFile), Number(current), Number(total)).join('\n'))
  }
}
